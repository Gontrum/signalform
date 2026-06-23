import { describe, it, expect } from "vitest";
import { artistMatches, sourceRank, pickBestResult } from "./search-matcher.js";

describe("artistMatches", () => {
  it("matches identical strings", () => {
    expect(artistMatches("Madonna", "Madonna")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(artistMatches("MADONNA", "madonna")).toBe(true);
  });

  it("matches diacritics to base characters", () => {
    expect(artistMatches("Björk", "bjork")).toBe(true);
  });

  it("matches when candidate is a substring of result", () => {
    expect(artistMatches("The Beatles", "Beatles")).toBe(true);
  });

  it("matches when result is a substring of candidate", () => {
    expect(artistMatches("Beatles", "The Beatles")).toBe(true);
  });

  it("returns false for unrelated strings", () => {
    expect(artistMatches("Madonna", "Prince")).toBe(false);
  });
});

describe("sourceRank", () => {
  it("ranks local as 0", () => {
    expect(sourceRank("local")).toBe(0);
  });

  it("ranks qobuz as 1", () => {
    expect(sourceRank("qobuz")).toBe(1);
  });

  it("ranks tidal as 2", () => {
    expect(sourceRank("tidal")).toBe(2);
  });

  it("ranks unknown source as 3", () => {
    expect(sourceRank("spotify")).toBe(3);
  });
});

describe("pickBestResult", () => {
  it("returns undefined for empty array", () => {
    expect(pickBestResult([])).toBeUndefined();
  });

  it("returns the single element from a single-element array", () => {
    const item = { source: "tidal", id: "1" };
    expect(pickBestResult([item])).toBe(item);
  });

  it("returns the local result when mixed with tidal", () => {
    const local = { source: "local", id: "1" };
    const tidal = { source: "tidal", id: "2" };
    expect(pickBestResult([tidal, local])).toBe(local);
  });

  it("returns the highest-ranked source when all are streaming", () => {
    const qobuz = { source: "qobuz", id: "1" };
    const tidal = { source: "tidal", id: "2" };
    expect(pickBestResult([tidal, qobuz])).toBe(qobuz);
  });
});
