/**
 * Tests for the Artist Diversity Filter pure functions (isArtistInWindow, filterByDiversity, addToSlidingWindow).
 * No mocks needed — pure functions only.
 */

import { describe, test, expect } from "vitest";
import {
  isArtistInWindow,
  filterByDiversity,
  addToSlidingWindow,
} from "./diversity-service.js";
import type { CandidateTrack } from "./types.js";

// Test helper — builds a minimal CandidateTrack
const makeCandidate = (
  overrides: Partial<CandidateTrack> = {},
): CandidateTrack => ({
  name: "Test Track",
  artist: "Test Artist",
  match: 0.8,
  url: "https://www.last.fm/music/test",
  ...overrides,
});

describe("isArtistInWindow", () => {
  test("artist in window → true", () => {
    expect(isArtistInWindow("Miles Davis", ["Miles Davis", "Coltrane"])).toBe(
      true,
    );
  });

  test("case-insensitive match (lower vs mixed) → true", () => {
    expect(isArtistInWindow("miles davis", ["Miles Davis"])).toBe(true);
  });

  test("case-insensitive match (upper vs lower) → true", () => {
    expect(isArtistInWindow("MILES DAVIS", ["miles davis"])).toBe(true);
  });

  test("artist not in window → false", () => {
    expect(isArtistInWindow("Miles Davis", ["Coltrane", "Monk"])).toBe(false);
  });

  test("empty window → false", () => {
    expect(isArtistInWindow("Miles Davis", [])).toBe(false);
  });
});

describe("filterByDiversity", () => {
  test("artist in window → excluded", () => {
    const candidates = [makeCandidate({ artist: "Miles Davis" })];
    const result = filterByDiversity(candidates, ["Miles Davis"]);
    expect(result).toHaveLength(0);
  });

  test("artist not in window → included", () => {
    const candidates = [makeCandidate({ artist: "Coltrane" })];
    const result = filterByDiversity(candidates, ["Miles Davis"]);
    expect(result).toHaveLength(1);
  });

  test("empty window → all candidates pass", () => {
    const candidates = [
      makeCandidate({ artist: "Miles Davis" }),
      makeCandidate({ artist: "Coltrane" }),
    ];
    const result = filterByDiversity(candidates, []);
    expect(result).toHaveLength(2);
  });

  test("all candidates in window → empty result", () => {
    const candidates = [
      makeCandidate({ artist: "Miles Davis" }),
      makeCandidate({ artist: "Coltrane" }),
    ];
    const result = filterByDiversity(candidates, ["Miles Davis", "Coltrane"]);
    expect(result).toHaveLength(0);
  });

  test("windowSize respected — only last N entries from recentArtists are checked", () => {
    // 11 entries in recentArtists, windowSize=10 → index 0 ("OldArtist") is dropped
    const recentArtists = [
      "OldArtist", // will be dropped (beyond windowSize=10)
      "Artist1",
      "Artist2",
      "Artist3",
      "Artist4",
      "Artist5",
      "Artist6",
      "Artist7",
      "Artist8",
      "Artist9",
      "Artist10",
    ];
    const candidates = [makeCandidate({ artist: "OldArtist" })];
    const result = filterByDiversity(candidates, recentArtists, {
      windowSize: 10,
    });
    expect(result).toHaveLength(1); // OldArtist not in last 10 → passes
  });

  test("multiple candidates — mixed result preserves order", () => {
    const window = ["Miles Davis", "Monk"];
    const candidates = [
      makeCandidate({ artist: "Miles Davis" }), // in window → excluded
      makeCandidate({ artist: "Coltrane" }), // not in window → included
      makeCandidate({ artist: "Monk" }), // in window → excluded
      makeCandidate({ artist: "Evans" }), // not in window → included
    ];
    const result = filterByDiversity(candidates, window);
    expect(result).toHaveLength(2);
    expect(result[0]?.artist).toBe("Coltrane");
    expect(result[1]?.artist).toBe("Evans");
  });

  test("case-insensitive window match", () => {
    const candidates = [makeCandidate({ artist: "miles davis" })];
    const result = filterByDiversity(candidates, ["Miles Davis"]);
    expect(result).toHaveLength(0);
  });

  test("windowSize: 0 → all candidates pass (consistent with empty window, no filtering)", () => {
    const candidates = [
      makeCandidate({ artist: "Miles Davis" }),
      makeCandidate({ artist: "Coltrane" }),
    ];
    const result = filterByDiversity(candidates, ["Miles Davis", "Coltrane"], {
      windowSize: 0,
    });
    expect(result).toHaveLength(2);
  });
});

describe("addToSlidingWindow", () => {
  test("adds artist to window", () => {
    const result = addToSlidingWindow(["Artist1"], "Artist2", 10);
    expect(result).toEqual(["Artist1", "Artist2"]);
  });

  test("drops oldest when at capacity", () => {
    const window = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]; // 10 entries
    const result = addToSlidingWindow(window, "K", 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("B"); // "A" dropped
    expect(result[9]).toBe("K"); // "K" added
  });

  test("window never exceeds windowSize (oversized input)", () => {
    const window = Array.from({ length: 15 }, (_, i) => `Artist${i}`);
    const result = addToSlidingWindow(window, "New", 10);
    expect(result).toHaveLength(10);
  });

  test("empty window → single entry", () => {
    const result = addToSlidingWindow([], "Miles Davis", 10);
    expect(result).toEqual(["Miles Davis"]);
  });

  test("does not mutate input window", () => {
    const original = ["Artist1", "Artist2"];
    const result = addToSlidingWindow(original, "Artist3", 10);
    expect(original).toHaveLength(2); // unchanged
    expect(result).toHaveLength(3);
  });

  test("windowSize: 0 → always returns empty (edge case)", () => {
    const result = addToSlidingWindow(["Artist1"], "Artist2", 0);
    expect(result).toHaveLength(0);
  });
});
