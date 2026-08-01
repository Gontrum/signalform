import { describe, it, expect } from "vitest";
import {
  isOk,
  ordersByYearFirst,
  type DecadeFilter,
  type SortOption,
} from "@signalform/shared";
import {
  resolvePagination,
  selectDecadeYears,
  type LmsSortQuery,
} from "./browse.js";

const SORTS: readonly SortOption[] = [
  "artist-az",
  "title-az",
  "year-newest",
  "recently-added",
];

const DECADES: readonly DecadeFilter[] = [
  "all",
  "2020s",
  "2010s",
  "2000s",
  "1990s",
  "older",
];

// One year per decade bucket, so selectDecadeYears answers with a non-empty
// list for every decade the route accepts.
const LIBRARY_YEARS: readonly number[] = [1971, 1994, 2003, 2016, 2024];

type AcceptedPair = readonly [SortOption, DecadeFilter, LmsSortQuery];

const ACCEPTED_PAIRS: readonly AcceptedPair[] = SORTS.flatMap((sort) =>
  DECADES.flatMap((decade) => {
    const resolved = resolvePagination(sort, decade);

    return isOk(resolved) ? [[sort, decade, resolved.value] as const] : [];
  }),
);

// The client reads ordersByYearFirst to place its year headings while the
// server decides the order in two places — backward `yearalbum` pagination and
// the descending years of selectDecadeYears. This pins all three together.
describe("ordersByYearFirst agrees with the order the server delivers", () => {
  it.each(ACCEPTED_PAIRS)(
    "for sort %s and decade %s",
    (sort, decade, query) => {
      const iteratesYearsDownwards =
        selectDecadeYears(LIBRARY_YEARS, decade) !== undefined;

      const bothDirections = query.paginateBackward && iteratesYearsDownwards;
      expect(bothDirections).toBe(false);

      expect(ordersByYearFirst(sort, decade)).toBe(
        query.paginateBackward || iteratesYearsDownwards,
      );
    },
  );

  it("sees both answers in the table, so a constant cannot pass", () => {
    const answers = ACCEPTED_PAIRS.map(([sort, decade]) =>
      ordersByYearFirst(sort, decade),
    );

    expect(new Set(answers)).toEqual(new Set([true, false]));
  });
});
