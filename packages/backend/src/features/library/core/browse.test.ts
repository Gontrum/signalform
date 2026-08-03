import { describe, expect, it } from "vitest";
import {
  RECENTLY_ADDED_ALBUM_LIMIT,
  type DecadeFilter,
  type SortOption,
} from "@signalform/shared";
import {
  countAcrossYears,
  mapOffsetAcrossYears,
  mapSortToLmsQuery,
  resolvePagination,
  selectDecadeYears,
  type YearCount,
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

  // The client shows "this is the cap, not the end of your library" at exactly
  // this many albums, so a cap the server no longer applies would make it lie.
  it("caps recently-added at the limit the client explains", () => {
    expect(mapSortToLmsQuery("recently-added").hardLimit).toBe(
      RECENTLY_ADDED_ALBUM_LIMIT,
    );
  });

  it("never produces the non-existent sort:artist", () => {
    const sortValues = ALL_SORTS.map((sort) => mapSortToLmsQuery(sort).lmsSort);

    expect(sortValues).toEqual(["artistalbum", "album", "yearalbum", "new"]);
    expect(sortValues).not.toContain("artist");
  });
});

// Distinct years as the LMS `years` command returns them: no order guaranteed,
// 0 for albums without a year, and 200 as a real-world typo that stays a typo.
const DISTINCT_YEARS: readonly number[] = [
  2010, 0, 1995, 2031, 1989, 2020, 200, 2009, 1990, 2000, 1999, 2019, 2015, 0,
  1969, 2025, 2005,
];

describe("selectDecadeYears", () => {
  it("asks for no year filter at all for 'all'", () => {
    expect(selectDecadeYears(DISTINCT_YEARS, "all")).toBeUndefined();
  });

  it("includes 1989 and the broken year 200 but not 1990 in 'older'", () => {
    expect(selectDecadeYears(DISTINCT_YEARS, "older")).toEqual([
      1989, 1969, 200,
    ]);
  });

  it("excludes the unknown year 0 from 'older'", () => {
    const older = selectDecadeYears(DISTINCT_YEARS, "older");

    expect(older).not.toContain(0);
    expect(older?.at(-1)).toBe(200);
  });

  it("includes 1990 and 1999 but not 2000 in '1990s'", () => {
    expect(selectDecadeYears(DISTINCT_YEARS, "1990s")).toEqual([
      1999, 1995, 1990,
    ]);
  });

  it("includes 2000 and 2009 but not 2010 in '2000s'", () => {
    expect(selectDecadeYears(DISTINCT_YEARS, "2000s")).toEqual([
      2009, 2005, 2000,
    ]);
  });

  it("includes 2010 and 2019 but not 2020 in '2010s'", () => {
    expect(selectDecadeYears(DISTINCT_YEARS, "2010s")).toEqual([
      2019, 2015, 2010,
    ]);
  });

  it("includes 2020 and stays open ended upwards for '2020s'", () => {
    expect(selectDecadeYears(DISTINCT_YEARS, "2020s")).toEqual([
      2031, 2025, 2020,
    ]);
  });

  it("sorts newest first regardless of the order the years arrive in", () => {
    const shuffled = [1990, 1999, 1995];

    expect(selectDecadeYears(shuffled, "1990s")).toEqual([1999, 1995, 1990]);
    expect(selectDecadeYears([...shuffled].reverse(), "1990s")).toEqual([
      1999, 1995, 1990,
    ]);
  });

  it("leaves the input untouched", () => {
    const years = [1990, 1999, 1995];

    selectDecadeYears(years, "1990s");

    expect(years).toEqual([1990, 1999, 1995]);
  });

  it("returns nothing for a decade without a single year", () => {
    expect(selectDecadeYears([0, 1985, 2005], "1990s")).toEqual([]);
    expect(selectDecadeYears([0, 1985, 2005], "2020s")).toEqual([]);
  });

  it("returns nothing for every decade of an empty library", () => {
    const perDecade = ALL_DECADES.filter((decade) => decade !== "all").map(
      (decade) => selectDecadeYears([], decade),
    );

    expect(perDecade).toEqual([[], [], [], [], []]);
  });

  it("assigns every known year to exactly one decade and year 0 to none", () => {
    const decades: readonly DecadeFilter[] = [
      "2020s",
      "2010s",
      "2000s",
      "1990s",
      "older",
    ];

    const covered = decades.flatMap(
      (decade) => selectDecadeYears(DISTINCT_YEARS, decade) ?? [],
    );

    expect(covered).toEqual([
      2031, 2025, 2020, 2019, 2015, 2010, 2009, 2005, 2000, 1999, 1995, 1990,
      1989, 1969, 200,
    ]);
    expect(covered).not.toContain(0);
  });
});

describe("mapOffsetAcrossYears", () => {
  const YEAR_COUNTS: readonly YearCount[] = [
    { year: 2015, count: 9 },
    { year: 2014, count: 5 },
    { year: 2013, count: 20 },
  ];

  it("stays inside one year when the page ends before the year does", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 3, 4)).toEqual([
      { year: 2015, offset: 3, limit: 4 },
    ]);
  });

  it("continues in the next year when the page crosses a year boundary", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 7, 6)).toEqual([
      { year: 2015, offset: 7, limit: 2 },
      { year: 2014, offset: 0, limit: 4 },
    ]);
  });

  it("spans a whole year that is shorter than the page", () => {
    const shortMiddleYear: readonly YearCount[] = [
      { year: 2015, count: 9 },
      { year: 2014, count: 2 },
      { year: 2013, count: 20 },
    ];

    expect(mapOffsetAcrossYears(shortMiddleYear, 8, 6)).toEqual([
      { year: 2015, offset: 8, limit: 1 },
      { year: 2014, offset: 0, limit: 2 },
      { year: 2013, offset: 0, limit: 3 },
    ]);
  });

  it("starts at the top of the next year when the offset sits on a boundary", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 9, 3)).toEqual([
      { year: 2014, offset: 0, limit: 3 },
    ]);
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 14, 2)).toEqual([
      { year: 2013, offset: 0, limit: 2 },
    ]);
  });

  it("skips empty years instead of emitting empty sections", () => {
    const withEmptyYears: readonly YearCount[] = [
      { year: 2016, count: 0 },
      { year: 2015, count: 3 },
      { year: 2014, count: 0 },
      { year: 2013, count: 4 },
    ];

    expect(mapOffsetAcrossYears(withEmptyYears, 1, 5)).toEqual([
      { year: 2015, offset: 1, limit: 2 },
      { year: 2013, offset: 0, limit: 3 },
    ]);
  });

  it("skips an empty year the offset lands on", () => {
    const withEmptyYear: readonly YearCount[] = [
      { year: 2016, count: 2 },
      { year: 2015, count: 0 },
      { year: 2014, count: 3 },
    ];

    expect(mapOffsetAcrossYears(withEmptyYear, 2, 2)).toEqual([
      { year: 2014, offset: 0, limit: 2 },
    ]);
  });

  it("shortens the last section instead of reading past the end", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 30, 6)).toEqual([
      { year: 2013, offset: 16, limit: 4 },
    ]);
  });

  it("returns nothing past the end of all years", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 34, 6)).toEqual([]);
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 500, 6)).toEqual([]);
  });

  it("returns nothing for an empty year list", () => {
    expect(mapOffsetAcrossYears([], 0, 50)).toEqual([]);
  });

  it("returns nothing for a non-positive limit", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 3, 0)).toEqual([]);
    expect(mapOffsetAcrossYears(YEAR_COUNTS, 3, -5)).toEqual([]);
  });

  it("returns nothing for a negative offset", () => {
    expect(mapOffsetAcrossYears(YEAR_COUNTS, -1, 5)).toEqual([]);
    expect(mapOffsetAcrossYears(YEAR_COUNTS, -50, 5)).toEqual([]);
  });

  it("visits every album of every year exactly once and in order", () => {
    const pageSize = 4;
    const totalCount = YEAR_COUNTS.reduce((sum, { count }) => sum + count, 0);
    const pageCount = Math.ceil(totalCount / pageSize) + 1;

    const visited = Array.from({ length: pageCount }, (_unused, page) =>
      mapOffsetAcrossYears(YEAR_COUNTS, page * pageSize, pageSize),
    )
      .flat()
      .flatMap(({ year, offset, limit }) =>
        Array.from(
          { length: limit },
          (_row, index) => `${year}#${offset + index}`,
        ),
      );

    const expected = YEAR_COUNTS.flatMap(({ year, count }) =>
      Array.from({ length: count }, (_album, index) => `${year}#${index}`),
    );

    expect(visited).toEqual(expected);
  });
});

describe("countAcrossYears", () => {
  it("returns 0 for an empty year list", () => {
    expect(countAcrossYears([])).toBe(0);
  });

  it("sums the counts of all years", () => {
    expect(
      countAcrossYears([
        { year: 2015, count: 9 },
        { year: 2014, count: 5 },
        { year: 2013, count: 20 },
      ]),
    ).toBe(34);
  });

  it("adds nothing for years without albums", () => {
    const withEmptyYears: readonly YearCount[] = [
      { year: 2016, count: 0 },
      { year: 2015, count: 7 },
      { year: 2014, count: 0 },
    ];

    expect(countAcrossYears(withEmptyYears)).toBe(7);
    expect(countAcrossYears([{ year: 2016, count: 0 }])).toBe(0);
  });

  it("ignores negative counts instead of subtracting them", () => {
    expect(
      countAcrossYears([
        { year: 2015, count: 4 },
        { year: 2014, count: -3 },
      ]),
    ).toBe(4);
  });

  it("matches the number of albums the pages actually hand out", () => {
    const yearCounts: readonly YearCount[] = [
      { year: 2015, count: 9 },
      { year: 2014, count: 0 },
      { year: 2013, count: 5 },
    ];
    const total = countAcrossYears(yearCounts);

    const handedOut = Array.from({ length: total + 2 }, (_unused, page) =>
      mapOffsetAcrossYears(yearCounts, page * 3, 3),
    )
      .flat()
      .reduce((sum, slice) => sum + slice.limit, 0);

    expect(total).toBe(14);
    expect(handedOut).toBe(total);
  });
});

describe("resolvePagination", () => {
  it("keeps the plain sort mapping when no decade is selected", () => {
    expect(resolvePagination("artist-az", "all")).toEqual({
      ok: true,
      value: { lmsSort: "artistalbum", paginateBackward: false },
    });
    expect(resolvePagination("title-az", "all")).toEqual({
      ok: true,
      value: { lmsSort: "album", paginateBackward: false },
    });
    expect(resolvePagination("year-newest", "all")).toEqual({
      ok: true,
      value: { lmsSort: "yearalbum", paginateBackward: true },
    });
    expect(resolvePagination("recently-added", "all")).toEqual({
      ok: true,
      value: { lmsSort: "new", paginateBackward: false, hardLimit: 100 },
    });
  });

  it("never diverges from the sort table for 'all'", () => {
    const plans = ALL_SORTS.map((sort) => resolvePagination(sort, "all"));

    expect(plans).toEqual(
      ALL_SORTS.map((sort) => ({ ok: true, value: mapSortToLmsQuery(sort) })),
    );
  });

  it("passes artist and title sorts through unchanged inside a decade", () => {
    expect(resolvePagination("artist-az", "2010s")).toEqual({
      ok: true,
      value: { lmsSort: "artistalbum", paginateBackward: false },
    });
    expect(resolvePagination("title-az", "1990s")).toEqual({
      ok: true,
      value: { lmsSort: "album", paginateBackward: false },
    });
  });

  it("orders by album title inside a decade instead of by year", () => {
    expect(resolvePagination("year-newest", "2020s")).toEqual({
      ok: true,
      value: { lmsSort: "album", paginateBackward: false },
    });
    expect(resolvePagination("year-newest", "older")).toEqual({
      ok: true,
      value: { lmsSort: "album", paginateBackward: false },
    });
  });

  it("rejects recently-added for every decade", () => {
    const decades = ALL_DECADES.filter((decade) => decade !== "all");

    const rejected = decades.map(
      (decade) => resolvePagination("recently-added", decade).ok,
    );

    expect(rejected).toEqual([false, false, false, false, false]);
  });

  it("explains why recently-added and a decade cannot be combined", () => {
    const result = resolvePagination("recently-added", "2000s");
    const message = result.ok ? "" : result.error.message;

    expect(result.ok).toBe(false);
    expect(message).toContain("recently-added");
    expect(message).toContain("2000s");
    expect(message).toContain("100");
  });

  it("paginates backward for year-newest without a decade filter only", () => {
    const backwardCombinations = ALL_SORTS.flatMap((sort) =>
      ALL_DECADES.map((decade) => ({
        sort,
        decade,
        plan: resolvePagination(sort, decade),
      })),
    )
      .filter(({ plan }) => plan.ok && plan.value.paginateBackward)
      .map(({ sort, decade }) => [sort, decade]);

    expect(backwardCombinations).toEqual([["year-newest", "all"]]);
  });

  it("keeps the recently-added cap only where the sort survives", () => {
    const capped = ALL_SORTS.flatMap((sort) =>
      ALL_DECADES.map((decade) => ({
        sort,
        decade,
        plan: resolvePagination(sort, decade),
      })),
    )
      .filter(({ plan }) => plan.ok && plan.value.hardLimit !== undefined)
      .map(({ sort, decade }) => [sort, decade]);

    expect(capped).toEqual([["recently-added", "all"]]);
  });
});
