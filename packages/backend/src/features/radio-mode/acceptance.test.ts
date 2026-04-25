/**
 * Context-Aware Filter — Acceptance Tests (BDD)
 *
 * Written FIRST (Task 0) so they fail RED before implementation.
 * Covers ACs 1–6 via real user scenarios.
 *
 * BDD helper pattern: givenCandidates → whenFilteringWithContext → assertions
 */

import { describe, test, expect } from "vitest";
import { filterByContext } from "./core/service.js";
import type { CandidateTrack, RadioContext } from "./core/types.js";

// ---------------------------------------------------------------------------
// BDD Helpers
// ---------------------------------------------------------------------------

const whenFilteringWithContext = (
  candidates: readonly CandidateTrack[],
  context: RadioContext,
  config?: Parameters<typeof filterByContext>[2],
): readonly CandidateTrack[] => filterByContext(candidates, context, config);

// ---------------------------------------------------------------------------
// Acceptance Scenarios (AC 1–6)
// ---------------------------------------------------------------------------

describe("Context-Aware Filter — Acceptance Tests", () => {
  test("Scenario 1 (AC1+AC2): 50s Jazz seed — keeps Jazz 1939-1979, removes 2020 Pop", () => {
    const candidates: readonly CandidateTrack[] = [
      {
        name: "Autumn Leaves",
        artist: "Miles Davis",
        match: 0.9,
        url: "",
        year: 1958,
        genres: ["Jazz"],
      },
      {
        name: "So What",
        artist: "Miles Davis",
        match: 0.85,
        url: "",
        year: 1959,
        genres: ["Modal Jazz"],
      },
      {
        name: "Shape of You",
        artist: "Ed Sheeran",
        match: 0.3,
        url: "",
        year: 2017,
        genres: ["Pop"],
      },
      {
        name: "Blinding Lights",
        artist: "The Weeknd",
        match: 0.25,
        url: "",
        year: 2020,
        genres: ["Synth Pop"],
      },
    ];

    const result = whenFilteringWithContext(candidates, {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });

    expect(result.some((t) => t.name === "Autumn Leaves")).toBe(true);
    expect(result.some((t) => t.name === "So What")).toBe(true);
    expect(result.some((t) => t.name === "Shape of You")).toBe(false);
    expect(result.some((t) => t.name === "Blinding Lights")).toBe(false);
  });

  test("Scenario 2 (AC5): Candidate with no year is always kept (graceful degradation)", () => {
    const candidates: readonly CandidateTrack[] = [
      {
        name: "Unknown Era Track",
        artist: "Unknown Artist",
        match: 0.7,
        url: "",
        year: undefined,
        genres: ["Jazz"],
      },
    ];

    const result = whenFilteringWithContext(candidates, {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Unknown Era Track");
  });

  test("Scenario 3 (AC5): No seedYear → genre filter only, no era filter applied", () => {
    const candidates: readonly CandidateTrack[] = [
      {
        name: "Future Jazz",
        artist: "Modern Artist",
        match: 0.8,
        url: "",
        year: 2020,
        genres: ["Jazz"],
      },
      {
        name: "Future Pop",
        artist: "Pop Artist",
        match: 0.6,
        url: "",
        year: 2020,
        genres: ["Pop"],
      },
    ];

    const result = whenFilteringWithContext(candidates, {
      seedGenres: ["Jazz"],
    });

    // No era filter → Future Jazz (2020) stays; Pop removed by genre filter
    expect(result.some((t) => t.name === "Future Jazz")).toBe(true);
    expect(result.some((t) => t.name === "Future Pop")).toBe(false);
  });

  test("Scenario 4 (AC4): Era window expands when fewer than 10 tracks found", () => {
    // 5 Jazz tracks in ±20 window (1939-1979), 3 more Jazz tracks in ±30 window (1929-1989)
    const within20 = Array.from(
      { length: 5 },
      (_, i) =>
        ({
          name: `Jazz ${i}`,
          artist: "Artist",
          match: 0.8,
          url: "",
          year: 1959 + i,
          genres: ["Jazz"],
        }) satisfies CandidateTrack,
    );
    const within30only = Array.from(
      { length: 3 },
      (_, i) =>
        ({
          name: `Early Jazz ${i}`,
          artist: "Artist",
          match: 0.7,
          url: "",
          year: 1929 + i,
          genres: ["Jazz"],
        }) satisfies CandidateTrack,
    );

    const result = whenFilteringWithContext([...within20, ...within30only], {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });

    // 5 + 3 = 8 results after expansion (still < 10, keeps expanding → returns all 8 at maxEraWindow)
    expect(result.length).toBeGreaterThanOrEqual(8);
    // The early jazz tracks should now be included after expansion
    expect(result.some((t) => t.name === "Early Jazz 0")).toBe(true);
  });

  test("Scenario 5 (AC5): No metadata at all → all candidates pass through", () => {
    const candidates: readonly CandidateTrack[] = [
      {
        name: "Track A",
        artist: "Artist A",
        match: 0.8,
        url: "",
        year: undefined,
        genres: undefined,
      },
      {
        name: "Track B",
        artist: "Artist B",
        match: 0.7,
        url: "",
        year: undefined,
        genres: undefined,
      },
    ];

    const result = whenFilteringWithContext(candidates, {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });

    // Both have no metadata → both pass (graceful degradation)
    expect(result).toHaveLength(2);
  });

  test("Scenario 6 (AC6): Pure function — same input always returns same output", () => {
    const candidates: readonly CandidateTrack[] = [
      {
        name: "Take Five",
        artist: "Dave Brubeck",
        match: 0.95,
        url: "",
        year: 1959,
        genres: ["Jazz"],
      },
      {
        name: "So What",
        artist: "Miles Davis",
        match: 0.85,
        url: "",
        year: 1959,
        genres: ["Modal Jazz"],
      },
    ];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };

    const result1 = filterByContext(candidates, context);
    const result2 = filterByContext(candidates, context);
    const result3 = filterByContext(candidates, context);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
    expect(result1.length).toBe(result2.length);
  });
});
