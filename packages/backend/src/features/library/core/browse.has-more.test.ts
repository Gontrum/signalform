import { describe, it, expect } from "vitest";
import { hasMoreAfter } from "./browse.js";

const PAGE_SIZE = 60;

describe("hasMoreAfter", () => {
  it("reports no further albums when the window covers the library exactly", () => {
    expect(hasMoreAfter(60, 0, PAGE_SIZE)).toBe(false);
  });

  it("reports further albums for a single album beyond the window", () => {
    expect(hasMoreAfter(61, 0, PAGE_SIZE)).toBe(true);
  });

  it("reports further albums while whole pages remain", () => {
    expect(hasMoreAfter(799, 0, PAGE_SIZE)).toBe(true);
    expect(hasMoreAfter(799, 600, PAGE_SIZE)).toBe(true);
    expect(hasMoreAfter(799, 720, PAGE_SIZE)).toBe(true);
    expect(hasMoreAfter(799, 780, PAGE_SIZE)).toBe(false);
  });

  it("reports no further albums for the last partial page", () => {
    expect(hasMoreAfter(70, 60, PAGE_SIZE)).toBe(false);
  });

  it("reports no further albums for a window past the end", () => {
    expect(hasMoreAfter(60, 120, PAGE_SIZE)).toBe(false);
  });

  it("reports further albums when a zero limit delivered nothing", () => {
    expect(hasMoreAfter(60, 0, 0)).toBe(true);
  });

  it("reports no further albums when a zero limit sits past the end", () => {
    expect(hasMoreAfter(60, 60, 0)).toBe(false);
  });

  it("reports no further albums for an empty library", () => {
    expect(hasMoreAfter(0, 0, PAGE_SIZE)).toBe(false);
    expect(hasMoreAfter(0, 0, 0)).toBe(false);
  });

  it("treats a negative offset as the start of the library", () => {
    expect(hasMoreAfter(60, -10, PAGE_SIZE)).toBe(false);
    expect(hasMoreAfter(61, -10, PAGE_SIZE)).toBe(true);
  });

  it("treats a negative limit as delivering nothing", () => {
    expect(hasMoreAfter(60, 0, -60)).toBe(true);
    expect(hasMoreAfter(60, 60, -60)).toBe(false);
  });

  it("reports no further albums for a negative total", () => {
    expect(hasMoreAfter(-5, 0, PAGE_SIZE)).toBe(false);
    expect(hasMoreAfter(-5, -5, -5)).toBe(false);
  });
});
