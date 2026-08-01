import { describe, expect, it } from "vitest";
import { ordersByYearFirst } from "./libraryOrdering.js";
import type { DecadeFilter, SortOption } from "./types/library.js";

type Combination = readonly [SortOption, DecadeFilter, boolean];

const COMBINATIONS: readonly Combination[] = [
  ["artist-az", "all", false],
  ["artist-az", "2020s", true],
  ["artist-az", "2010s", true],
  ["artist-az", "2000s", true],
  ["artist-az", "1990s", true],
  ["artist-az", "older", true],
  ["title-az", "all", false],
  ["title-az", "2020s", true],
  ["title-az", "2010s", true],
  ["title-az", "2000s", true],
  ["title-az", "1990s", true],
  ["title-az", "older", true],
  ["year-newest", "all", true],
  ["year-newest", "2020s", true],
  ["year-newest", "2010s", true],
  ["year-newest", "2000s", true],
  ["year-newest", "1990s", true],
  ["year-newest", "older", true],
  ["recently-added", "all", false],
  // The route answers 400 for these, but the function still has to be total.
  ["recently-added", "2020s", true],
  ["recently-added", "2010s", true],
  ["recently-added", "2000s", true],
  ["recently-added", "1990s", true],
  ["recently-added", "older", true],
];

describe("ordersByYearFirst", () => {
  it.each(COMBINATIONS)(
    "answers %s combined with %s",
    (sort, decade, expected) => {
      expect(ordersByYearFirst(sort, decade)).toBe(expected);
    },
  );

  it("covers every sort and decade of the two unions", () => {
    const sorts = new Set(COMBINATIONS.map(([sort]) => sort));
    const decades = new Set(COMBINATIONS.map(([, decade]) => decade));

    expect(sorts.size).toBe(4);
    expect(decades.size).toBe(6);
    expect(COMBINATIONS).toHaveLength(24);
  });

  it("orders by year first for a title sort under a decade filter", () => {
    expect(ordersByYearFirst("title-az", "1990s")).toBe(true);
  });

  it("leaves an unfiltered title sort ordered by title", () => {
    expect(ordersByYearFirst("title-az", "all")).toBe(false);
  });
});
