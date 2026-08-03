import { describe, expect, it } from "vitest";
import { capTotal, clampPage, mapSortToLmsQuery } from "./browse.js";

const RECENTLY_ADDED_CAP = 100;

describe("clampPage", () => {
  it("passes the page through untouched without a hard limit", () => {
    expect(clampPage(0, 50)).toEqual({ offset: 0, limit: 50 });
    expect(clampPage(5000, 50)).toEqual({ offset: 5000, limit: 50 });
  });

  it("leaves a page that fits inside the hard limit alone", () => {
    expect(clampPage(0, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 50,
    });
    expect(clampPage(50, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 50,
      limit: 50,
    });
  });

  it("trims a page that reaches past the hard limit to the remainder", () => {
    expect(clampPage(95, 20, RECENTLY_ADDED_CAP)).toEqual({
      offset: 95,
      limit: 5,
    });
    expect(clampPage(60, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 60,
      limit: 40,
    });
  });

  it("still returns a single row on the last row before the cap", () => {
    expect(clampPage(99, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 99,
      limit: 1,
    });
  });

  it("returns an empty page starting exactly on the cap", () => {
    expect(clampPage(100, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 0,
    });
  });

  it("returns an empty page well past the cap instead of a negative limit", () => {
    expect(clampPage(120, 20, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 0,
    });
    expect(clampPage(5000, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 0,
    });
  });

  it("returns an empty page for a non-positive limit, capped or not", () => {
    expect(clampPage(10, 0, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 0,
    });
    expect(clampPage(10, -5, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 0,
    });
    expect(clampPage(10, 0)).toEqual({ offset: 0, limit: 0 });
  });

  it("returns an empty page for a negative offset, capped or not", () => {
    expect(clampPage(-1, 50, RECENTLY_ADDED_CAP)).toEqual({
      offset: 0,
      limit: 0,
    });
    expect(clampPage(-50, 50)).toEqual({ offset: 0, limit: 0 });
  });

  it("returns an empty page for a cap of zero", () => {
    expect(clampPage(0, 50, 0)).toEqual({ offset: 0, limit: 0 });
  });

  it("caps the recently-added sort at the rows LMS actually serves", () => {
    const { hardLimit } = mapSortToLmsQuery("recently-added");

    expect(clampPage(80, 50, hardLimit)).toEqual({ offset: 80, limit: 20 });
    expect(clampPage(100, 50, hardLimit)).toEqual({ offset: 0, limit: 0 });
  });

  it("yields exactly the capped rows across all pages, none of them twice", () => {
    const pageSize = 30;
    const pages = Array.from({ length: 6 }, (_unused, page) =>
      clampPage(page * pageSize, pageSize, RECENTLY_ADDED_CAP),
    );

    expect(pages).toEqual([
      { offset: 0, limit: 30 },
      { offset: 30, limit: 30 },
      { offset: 60, limit: 30 },
      { offset: 90, limit: 10 },
      { offset: 0, limit: 0 },
      { offset: 0, limit: 0 },
    ]);

    const visitedRows = pages.flatMap(({ offset, limit }) =>
      Array.from({ length: limit }, (_row, index) => offset + index),
    );

    expect(visitedRows).toHaveLength(RECENTLY_ADDED_CAP);
    expect(new Set(visitedRows).size).toBe(RECENTLY_ADDED_CAP);
    expect(visitedRows[0]).toBe(0);
    expect(visitedRows.at(-1)).toBe(RECENTLY_ADDED_CAP - 1);
  });
});

describe("capTotal", () => {
  it("reports the full count without a hard limit", () => {
    expect(capTotal(4000)).toBe(4000);
    expect(capTotal(0)).toBe(0);
  });

  it("reports the full count when the hard limit is above it", () => {
    expect(capTotal(37, RECENTLY_ADDED_CAP)).toBe(37);
  });

  it("reports the hard limit when the count exceeds it", () => {
    expect(capTotal(4000, RECENTLY_ADDED_CAP)).toBe(RECENTLY_ADDED_CAP);
  });

  it("reports the hard limit when it equals the count", () => {
    expect(capTotal(RECENTLY_ADDED_CAP, RECENTLY_ADDED_CAP)).toBe(
      RECENTLY_ADDED_CAP,
    );
  });

  it("caps a recently-added library at the rows LMS actually serves", () => {
    const { hardLimit } = mapSortToLmsQuery("recently-added");

    expect(capTotal(12_000, hardLimit)).toBe(RECENTLY_ADDED_CAP);
  });

  it("reports nothing for a hard limit of zero", () => {
    expect(capTotal(4000, 0)).toBe(0);
  });
});
