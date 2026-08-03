import { describe, expect, it } from "vitest";
import { computeBackwardPage, pageIndexOf } from "./browse.js";

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

describe("pageIndexOf", () => {
  it("counts whole pages for an offset on the page grid", () => {
    expect(pageIndexOf(0, 50)).toBe(0);
    expect(pageIndexOf(50, 50)).toBe(1);
    expect(pageIndexOf(750, 50)).toBe(15);
  });

  it("names the page an offset inside a page belongs to", () => {
    expect(pageIndexOf(49, 50)).toBe(0);
    expect(pageIndexOf(60, 50)).toBe(1);
    expect(pageIndexOf(99, 50)).toBe(1);
  });

  it("reports the first page for a limit of zero instead of dividing by it", () => {
    expect(pageIndexOf(750, 0)).toBe(0);
    expect(pageIndexOf(0, 0)).toBe(0);
  });

  it("reports the first page for an offset of zero at any page size", () => {
    expect(pageIndexOf(0, 1)).toBe(0);
    expect(pageIndexOf(0, 200)).toBe(0);
  });
});

// The pairing the album route builds a backward page from.
describe("pageIndexOf feeding computeBackwardPage", () => {
  const backwardPageAt = (
    totalCount: number,
    offset: number,
    limit: number,
  ): ReturnType<typeof computeBackwardPage> =>
    computeBackwardPage(totalCount, limit, pageIndexOf(offset, limit));

  it("turns the first requested offset into the newest rows", () => {
    expect(backwardPageAt(799, 0, 50)).toEqual({ offset: 749, limit: 50 });
  });

  it("turns the second requested offset into the page behind it", () => {
    expect(backwardPageAt(799, 50, 50)).toEqual({ offset: 699, limit: 50 });
  });

  it("serves the containing page for an offset that sits mid-page", () => {
    expect(backwardPageAt(799, 60, 50)).toEqual({ offset: 699, limit: 50 });
  });

  it("keeps the ragged oldest page reachable through its offset", () => {
    expect(backwardPageAt(799, 750, 50)).toEqual({ offset: 0, limit: 49 });
  });

  it("returns an empty page for an offset past the library", () => {
    expect(backwardPageAt(799, 800, 50)).toEqual({ offset: 0, limit: 0 });
  });

  it("returns an empty page for a limit of zero", () => {
    expect(backwardPageAt(799, 750, 0)).toEqual({ offset: 0, limit: 0 });
  });
});
