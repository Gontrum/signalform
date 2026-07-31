/**
 * Personal Radio — Artist Scorer Unit Tests
 *
 * No mocks needed — pure functions only.
 * Covers scoreArtistsFromHistory with all specified cases.
 */

import { describe, test, expect } from "vitest";
import { scoreArtistsFromHistory } from "./artist-scorer.js";

describe("scoreArtistsFromHistory", () => {
  test("only loved artists → correct scores (3 pts each, sorted desc)", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Radiohead", "Portishead", "Radiohead"],
      recentTopArtists: [],
      overallTopArtists: [],
    });
    // Radiohead: 3+3=6, Portishead: 3
    expect(result[0]).toBe("Radiohead");
    expect(result[1]).toBe("Portishead");
    expect(result).toHaveLength(2);
  });

  test("loved + recent overlapping artist → 3+3=6, before artist with only 3", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Massive Attack", "Bjork"],
      recentTopArtists: ["Massive Attack"],
      overallTopArtists: [],
    });
    // Massive Attack: 3+3=6, Bjork: 3
    expect(result[0]).toBe("Massive Attack");
    expect(result[1]).toBe("Bjork");
  });

  test("artist in all three sources → 3+3+1=7 pts", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Aphex Twin"],
      recentTopArtists: ["Aphex Twin"],
      overallTopArtists: ["Aphex Twin"],
    });
    // Aphex Twin: 3+3+1=7
    expect(result[0]).toBe("Aphex Twin");
    expect(result).toHaveLength(1);
  });

  test("limit default 8: returns at most 8 artists", () => {
    const artists: readonly string[] = [
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
      "A7",
      "A8",
      "A9",
      "A10",
      "A11",
      "A12",
    ];
    const result = scoreArtistsFromHistory({
      lovedArtists: artists,
      recentTopArtists: [],
      overallTopArtists: [],
    });
    expect(result).toHaveLength(8);
  });

  test("explicit limit 3: returns at most 3 artists", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["A", "B", "C", "D", "E"],
      recentTopArtists: [],
      overallTopArtists: [],
      limit: 3,
    });
    expect(result).toHaveLength(3);
  });

  test("empty inputs → empty array", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: [],
      recentTopArtists: [],
      overallTopArtists: [],
    });
    expect(result).toEqual([]);
  });

  test("case-insensitive matching: Radiohead + radiohead → one entry", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Radiohead"],
      recentTopArtists: ["radiohead"],
      overallTopArtists: [],
    });
    // One combined entry with 3+3=6 pts
    expect(result).toHaveLength(1);
    expect(result[0]?.toLowerCase()).toBe("radiohead");
  });

  test("name preservation: first occurrence spelling is kept", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Radiohead"],
      recentTopArtists: ["RADIOHEAD"],
      overallTopArtists: [],
    });
    // First occurrence was "Radiohead"
    expect(result[0]).toBe("Radiohead");
  });

  test("overall-only artists score lower than loved artists", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: [],
      recentTopArtists: [],
      overallTopArtists: ["A", "B", "C"],
    });
    expect(result).toEqual(["A", "B", "C"]);
  });

  test("sorting: higher score comes first across mixed sources", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Alpha"], // Alpha: 3
      recentTopArtists: ["Beta"], // Beta: 3
      overallTopArtists: ["Alpha", "Beta", "Gamma"], // Alpha +1=4, Beta +1=4, Gamma: 1
    });
    // Alpha: 4, Beta: 4, Gamma: 1
    expect(result).toContain("Alpha");
    expect(result).toContain("Beta");
    expect(result[result.length - 1]).toBe("Gamma");
  });

  test("merge bumps only the matching artist's score, not siblings", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["B", "A"], // both start at 3 pts; B is inserted first
      recentTopArtists: ["A"], // only A should be bumped to 6; B must stay at 3
      overallTopArtists: [],
      limit: 1,
    });
    // A must have strictly more points than B (6 vs 3) to win the limit:1 cutoff.
    // A broken merge that bumps every entry (or none) leaves A and B tied at
    // 6 or 3 — the stable sort would then keep B (inserted first) as the winner,
    // so this fails loudly instead of silently passing on order alone.
    expect(result).toEqual(["A"]);
  });

  test("sort is driven by score, not insertion order", () => {
    const result = scoreArtistsFromHistory({
      lovedArtists: ["Zeta"], // score 3, inserted first
      recentTopArtists: [],
      overallTopArtists: ["Alpha", "Alpha", "Alpha", "Alpha"], // score 4, inserted last
      limit: 1,
    });
    // Alpha (4) must outrank Zeta (3) despite being inserted later. A removed,
    // no-op, or reversed-arithmetic comparator falls back to insertion order
    // and would keep Zeta here instead.
    expect(result).toEqual(["Alpha"]);
  });
});
