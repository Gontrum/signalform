import { describe, expect, it } from "vitest";
import type { DecadeFilter, SortOption } from "@signalform/shared";
import {
  computeBackwardPage,
  findDecadeRange,
  mapSortToLmsQuery,
} from "./browse.js";

const ALL_SORTS: readonly SortOption[] = [
  "artist-az",
  "title-az",
  "year-newest",
  "recently-added",
];

const ALL_DECADES: readonly DecadeFilter[] = [
  "all",
  "2020s",
  "2010s",
  "2000s",
  "1990s",
  "older",
];

describe("mapSortToLmsQuery", () => {
  it("maps artist A–Z to sort:artistalbum without backward pagination or a cap", () => {
    expect(mapSortToLmsQuery("artist-az")).toEqual({
      lmsSort: "artistalbum",
      paginateBackward: false,
    });
  });

  it("maps title A–Z to sort:album without backward pagination or a cap", () => {
    expect(mapSortToLmsQuery("title-az")).toEqual({
      lmsSort: "album",
      paginateBackward: false,
    });
  });

  it("maps year newest to sort:yearalbum with backward pagination and no cap", () => {
    expect(mapSortToLmsQuery("year-newest")).toEqual({
      lmsSort: "yearalbum",
      paginateBackward: true,
    });
  });

  it("maps recently added to sort:new with the 100-row LMS cap", () => {
    expect(mapSortToLmsQuery("recently-added")).toEqual({
      lmsSort: "new",
      paginateBackward: false,
      hardLimit: 100,
    });
  });

  it("paginates backward for year-newest only", () => {
    const backwardSorts = ALL_SORTS.filter(
      (sort) => mapSortToLmsQuery(sort).paginateBackward,
    );

    expect(backwardSorts).toEqual(["year-newest"]);
  });

  it("carries a hard limit for recently-added only", () => {
    const cappedSorts = ALL_SORTS.filter(
      (sort) => mapSortToLmsQuery(sort).hardLimit !== undefined,
    );

    expect(cappedSorts).toEqual(["recently-added"]);
    expect(mapSortToLmsQuery("recently-added").hardLimit).toBe(100);
  });

  it("never produces the non-existent sort:artist", () => {
    const sortValues = ALL_SORTS.map((sort) => mapSortToLmsQuery(sort).lmsSort);

    expect(sortValues).toEqual(["artistalbum", "album", "yearalbum", "new"]);
    expect(sortValues).not.toContain("artist");
  });
});

describe("computeBackwardPage", () => {
  it("returns the last rows of the ascending result for the newest page", () => {
    expect(computeBackwardPage(799, 50, 0)).toEqual({ offset: 749, limit: 50 });
  });

  it("steps one full page further back for each following page", () => {
    expect(computeBackwardPage(799, 50, 1)).toEqual({ offset: 699, limit: 50 });
    expect(computeBackwardPage(799, 50, 2)).toEqual({ offset: 649, limit: 50 });
  });

  it("shortens the last page instead of producing a negative offset", () => {
    expect(computeBackwardPage(799, 50, 15)).toEqual({ offset: 0, limit: 49 });
  });

  it("keeps the last page full when the total is a multiple of the limit", () => {
    expect(computeBackwardPage(800, 50, 15)).toEqual({ offset: 0, limit: 50 });
  });

  it("returns an empty page past the end of a ragged library", () => {
    expect(computeBackwardPage(799, 50, 16)).toEqual({ offset: 0, limit: 0 });
    expect(computeBackwardPage(799, 50, 99)).toEqual({ offset: 0, limit: 0 });
  });

  it("returns an empty page past the end of an evenly divisible library", () => {
    expect(computeBackwardPage(800, 50, 16)).toEqual({ offset: 0, limit: 0 });
  });

  it("returns an empty page for an empty library", () => {
    expect(computeBackwardPage(0, 50, 0)).toEqual({ offset: 0, limit: 0 });
  });

  it("returns an empty page when the library is smaller than one page", () => {
    expect(computeBackwardPage(30, 50, 0)).toEqual({ offset: 0, limit: 30 });
    expect(computeBackwardPage(30, 50, 1)).toEqual({ offset: 0, limit: 0 });
  });

  it("covers every row of a ragged library exactly once across all pages", () => {
    const totalCount = 799;
    const limit = 50;
    const rowsPerPage = Array.from({ length: 16 }, (_unused, page) =>
      computeBackwardPage(totalCount, limit, page),
    ).map(({ offset, limit: pageLimit }) =>
      Array.from({ length: pageLimit }, (_row, index) => offset + index),
    );

    const visitedRows = rowsPerPage.flat();

    expect(visitedRows).toHaveLength(totalCount);
    expect(new Set(visitedRows).size).toBe(totalCount);
    expect(Math.min(...visitedRows)).toBe(0);
    expect(Math.max(...visitedRows)).toBe(totalCount - 1);
  });
});

// Ascending year column as LMS returns it (`sort:yearalbum`), unknown years as 0 up front.
const YEARS: readonly number[] = [
  0, 0, 0, 0, 0, 1969, 1989, 1990, 1999, 2000, 2009, 2010, 2019, 2020, 2031,
];

const slice = (
  years: readonly number[],
  range: { readonly offset: number; readonly count: number },
): readonly number[] => years.slice(range.offset, range.offset + range.count);

describe("findDecadeRange", () => {
  it("returns the whole library including the unknown-year block for 'all'", () => {
    const range = findDecadeRange(YEARS, "all");

    expect(range).toEqual({ offset: 0, count: 15 });
    expect(slice(YEARS, range)).toEqual([...YEARS]);
  });

  it("includes 1989 but not 1990 in 'older'", () => {
    const range = findDecadeRange(YEARS, "older");

    expect(range).toEqual({ offset: 5, count: 2 });
    expect(slice(YEARS, range)).toEqual([1969, 1989]);
    expect(YEARS[range.offset + range.count]).toBe(1990);
  });

  it("excludes the unknown-year block from 'older'", () => {
    const range = findDecadeRange(YEARS, "older");

    expect(slice(YEARS, range)).not.toContain(0);
    expect(YEARS[range.offset - 1]).toBe(0);
  });

  it("includes 1990 and 1999 but not 2000 in '1990s'", () => {
    const range = findDecadeRange(YEARS, "1990s");

    expect(range).toEqual({ offset: 7, count: 2 });
    expect(slice(YEARS, range)).toEqual([1990, 1999]);
    expect(YEARS[range.offset - 1]).toBe(1989);
    expect(YEARS[range.offset + range.count]).toBe(2000);
  });

  it("includes 2000 and 2009 but not 2010 in '2000s'", () => {
    const range = findDecadeRange(YEARS, "2000s");

    expect(range).toEqual({ offset: 9, count: 2 });
    expect(slice(YEARS, range)).toEqual([2000, 2009]);
    expect(YEARS[range.offset - 1]).toBe(1999);
    expect(YEARS[range.offset + range.count]).toBe(2010);
  });

  it("includes 2010 and 2019 but not 2020 in '2010s'", () => {
    const range = findDecadeRange(YEARS, "2010s");

    expect(range).toEqual({ offset: 11, count: 2 });
    expect(slice(YEARS, range)).toEqual([2010, 2019]);
    expect(YEARS[range.offset - 1]).toBe(2009);
    expect(YEARS[range.offset + range.count]).toBe(2020);
  });

  it("is open ended upwards for '2020s'", () => {
    const range = findDecadeRange(YEARS, "2020s");

    expect(range).toEqual({ offset: 13, count: 2 });
    expect(slice(YEARS, range)).toEqual([2020, 2031]);
    expect(YEARS[range.offset - 1]).toBe(2019);
  });

  it("covers a full block of repeated years, not just the first entry", () => {
    const years = [1985, 1995, 1995, 1995, 2001];

    const range = findDecadeRange(years, "1990s");

    expect(range).toEqual({ offset: 1, count: 3 });
    expect(slice(years, range)).toEqual([1995, 1995, 1995]);
  });

  it("counts the unknown-year block only under 'all'", () => {
    const years = [0, 0, 0];

    expect(findDecadeRange(years, "all")).toEqual({ offset: 0, count: 3 });

    const decadeCounts = ALL_DECADES.filter((decade) => decade !== "all").map(
      (decade) => findDecadeRange(years, decade).count,
    );

    expect(decadeCounts).toEqual([0, 0, 0, 0, 0]);
  });

  it("returns an empty range inside the array for a decade without albums", () => {
    const years = [0, 0, 1985, 2005];

    const range = findDecadeRange(years, "1990s");

    expect(range).toEqual({ offset: 3, count: 0 });
    expect(slice(years, range)).toEqual([]);
    expect(range.offset).toBeLessThanOrEqual(years.length);
  });

  it("returns an empty range for a decade past the newest album", () => {
    const years = [1985, 1995];

    const range = findDecadeRange(years, "2020s");

    expect(range).toEqual({ offset: 2, count: 0 });
    expect(slice(years, range)).toEqual([]);
  });

  it("returns an empty range for every filter on an empty library", () => {
    const ranges = ALL_DECADES.map((decade) => findDecadeRange([], decade));

    expect(ranges).toEqual(ALL_DECADES.map(() => ({ offset: 0, count: 0 })));
  });

  it("splits the library into decades that tile it without gaps or overlap", () => {
    const decades: readonly DecadeFilter[] = [
      "older",
      "1990s",
      "2000s",
      "2010s",
      "2020s",
    ];

    const covered = decades.flatMap((decade) =>
      slice(YEARS, findDecadeRange(YEARS, decade)),
    );

    expect(covered).toEqual([
      1969, 1989, 1990, 1999, 2000, 2009, 2010, 2019, 2020, 2031,
    ]);
  });
});
