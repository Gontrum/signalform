import { describe, expect, it } from "vitest";
import type { DecadeFilter, SortOption } from "@signalform/shared";
import {
  computeBackwardPage,
  mapOffsetAcrossYears,
  mapSortToLmsQuery,
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
