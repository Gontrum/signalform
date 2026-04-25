/**
 * Radio Mode — Service Unit Tests
 *
 * No mocks needed — pure functions only.
 * Covers all helper functions and filterByContext with edge cases.
 */

import { describe, test, expect } from "vitest";
import {
  filterByContext,
  passesEraFilter,
  passesGenreFilter,
  areGenresRelated,
} from "./service.js";
import type { CandidateTrack, RadioContext } from "./types.js";
import { DEFAULT_FILTER_CONFIG } from "./types.js";

// ---------------------------------------------------------------------------
// Test Helper
// ---------------------------------------------------------------------------

const makeCandidate = (
  overrides: Partial<CandidateTrack> = {},
): CandidateTrack => ({
  name: "Test Track",
  artist: "Test Artist",
  match: 0.8,
  url: "https://www.last.fm/music/test",
  ...overrides,
});

// ---------------------------------------------------------------------------
// areGenresRelated
// ---------------------------------------------------------------------------

describe("areGenresRelated", () => {
  test("exact same genre (case-sensitive match) → true", () => {
    expect(areGenresRelated("Jazz", "Jazz")).toBe(true);
  });

  test("same genre different case → true (case-insensitive)", () => {
    expect(areGenresRelated("JAZZ", "jazz")).toBe(true);
    expect(areGenresRelated("Jazz", "JAZZ")).toBe(true);
  });

  test("Jazz and Cool Jazz → true (same group)", () => {
    expect(areGenresRelated("Jazz", "Cool Jazz")).toBe(true);
  });

  test("Jazz and Bebop → true (same group)", () => {
    expect(areGenresRelated("Jazz", "Bebop")).toBe(true);
  });

  test("Jazz and Modal Jazz → true (same group)", () => {
    expect(areGenresRelated("jazz", "modal jazz")).toBe(true);
  });

  test("Jazz and Pop → false (different groups)", () => {
    expect(areGenresRelated("Jazz", "Pop")).toBe(false);
  });

  test("Jazz and Rock → false (different groups)", () => {
    expect(areGenresRelated("Jazz", "Rock")).toBe(false);
  });

  test("Classical and Baroque → true (same group)", () => {
    expect(areGenresRelated("Classical", "Baroque")).toBe(true);
  });

  test("Rock and Metal → false (different groups)", () => {
    expect(areGenresRelated("Rock", "Metal")).toBe(false);
  });

  test("Hip-Hop and Rap → true (same group)", () => {
    expect(areGenresRelated("Hip-Hop", "Rap")).toBe(true);
  });

  test("Reggae and Ska → true (same group)", () => {
    expect(areGenresRelated("Reggae", "Ska")).toBe(true);
  });

  test("Jazz and Unknown Genre → false (unknown not in any group)", () => {
    expect(areGenresRelated("Jazz", "Unknown Genre")).toBe(false);
  });

  test("empty string genres → false (not in any group)", () => {
    expect(areGenresRelated("Jazz", "")).toBe(false);
    expect(areGenresRelated("", "")).toBe(true); // identical strings always match
  });
});

// ---------------------------------------------------------------------------
// passesEraFilter (AC1, AC5)
// ---------------------------------------------------------------------------

describe("passesEraFilter", () => {
  test("candidate within ±20 years of seed → passes (AC1)", () => {
    const candidate = makeCandidate({ year: 1965 });
    expect(passesEraFilter(candidate, 1959, 20)).toBe(true);
  });

  test("candidate outside ±20 years of seed → fails (AC1)", () => {
    const candidate = makeCandidate({ year: 2020 });
    expect(passesEraFilter(candidate, 1959, 20)).toBe(false);
  });

  test("candidate with no year → always passes (AC5 graceful degradation)", () => {
    const candidate = makeCandidate({ year: undefined });
    expect(passesEraFilter(candidate, 1959, 20)).toBe(true);
  });

  test("no seedYear → all candidates pass (AC5)", () => {
    const candidate = makeCandidate({ year: 2020 });
    expect(passesEraFilter(candidate, undefined, 20)).toBe(true);
  });

  test("exactly at boundary (±20 years) → passes", () => {
    const candidate = makeCandidate({ year: 1939 }); // 1959 - 20 = 1939
    expect(passesEraFilter(candidate, 1959, 20)).toBe(true);
  });

  test("exactly at upper boundary (±20 years) → passes", () => {
    const candidate = makeCandidate({ year: 1979 }); // 1959 + 20 = 1979
    expect(passesEraFilter(candidate, 1959, 20)).toBe(true);
  });

  test("one year outside lower boundary → fails", () => {
    const candidate = makeCandidate({ year: 1938 }); // 1959 - 21 = 1938
    expect(passesEraFilter(candidate, 1959, 20)).toBe(false);
  });

  test("one year outside upper boundary → fails", () => {
    const candidate = makeCandidate({ year: 1980 }); // 1959 + 21 = 1980
    expect(passesEraFilter(candidate, 1959, 20)).toBe(false);
  });

  test("seedYear and candidate same year → passes", () => {
    const candidate = makeCandidate({ year: 1959 });
    expect(passesEraFilter(candidate, 1959, 20)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// passesGenreFilter (AC2, AC5)
// ---------------------------------------------------------------------------

describe("passesGenreFilter", () => {
  test("Jazz seed, Cool Jazz candidate → passes (same group, AC2)", () => {
    const candidate = makeCandidate({ genres: ["Cool Jazz"] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(true);
  });

  test("Jazz seed, Bebop candidate → passes (same group, AC2)", () => {
    const candidate = makeCandidate({ genres: ["Bebop"] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(true);
  });

  test("Jazz seed, Pop candidate → fails (different group, AC2)", () => {
    const candidate = makeCandidate({ genres: ["Pop"] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(false);
  });

  test("Jazz seed, Rock candidate → fails (different group, AC2)", () => {
    const candidate = makeCandidate({ genres: ["Rock"] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(false);
  });

  test("candidate with no genres → always passes (AC5)", () => {
    const candidate = makeCandidate({ genres: undefined });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(true);
  });

  test("candidate with empty genres array → always passes (AC5)", () => {
    const candidate = makeCandidate({ genres: [] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(true);
  });

  test("no seedGenres → all candidates pass (AC5)", () => {
    const candidate = makeCandidate({ genres: ["Pop"] });
    expect(passesGenreFilter(candidate, undefined)).toBe(true);
  });

  test("empty seedGenres → all candidates pass (AC5)", () => {
    const candidate = makeCandidate({ genres: ["Pop"] });
    expect(passesGenreFilter(candidate, [])).toBe(true);
  });

  test("multiple seed genres — candidate matches one → passes", () => {
    const candidate = makeCandidate({ genres: ["Bebop"] });
    expect(passesGenreFilter(candidate, ["Jazz", "Classical"])).toBe(true);
  });

  test("multiple candidate genres — one matches seed → passes", () => {
    const candidate = makeCandidate({ genres: ["Pop", "Cool Jazz"] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(true);
  });

  test("candidate with empty-string genre → fails genre filter (not same as genres:undefined)", () => {
    // genres:[""] has length 1 → does NOT trigger the empty-array pass-through
    // areGenresRelated("", "Jazz") → false → candidate fails filter
    // This is the documented behavior: only genres:undefined or genres:[] get free pass
    const candidate = makeCandidate({ genres: [""] });
    expect(passesGenreFilter(candidate, ["Jazz"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterByContext (AC1–AC6)
// ---------------------------------------------------------------------------

describe("filterByContext — combined filtering", () => {
  test("era + genre filter: only matching candidates pass", () => {
    const candidates = [
      makeCandidate({ year: 1965, genres: ["Jazz"] }), // passes both
      makeCandidate({ name: "Pop2020", year: 2020, genres: ["Pop"] }), // fails both
      makeCandidate({ name: "Jazz2020", year: 2020, genres: ["Jazz"] }), // fails era
      makeCandidate({ name: "Pop1960", year: 1960, genres: ["Pop"] }), // fails genre
    ];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context);

    expect(
      result.some((t) => t.year === 1965 && t.genres?.includes("Jazz")),
    ).toBe(true);
    expect(result.some((t) => t.name === "Pop2020")).toBe(false);
    expect(result.some((t) => t.name === "Jazz2020")).toBe(false);
    expect(result.some((t) => t.name === "Pop1960")).toBe(false);
  });

  test("only era filter (no seedGenres) → genre not filtered", () => {
    const candidates = [
      makeCandidate({ year: 1965, genres: ["Pop"] }), // era passes, genre not filtered
      makeCandidate({ year: 2020, genres: ["Jazz"] }), // era fails
    ];
    const context: RadioContext = { seedYear: 1959 };
    const result = filterByContext(candidates, context);

    expect(result).toHaveLength(1);
    expect(result[0]?.year).toBe(1965);
  });

  test("only genre filter (no seedYear) → era not filtered", () => {
    const candidates = [
      makeCandidate({ year: 2020, genres: ["Jazz"] }), // genre passes, era not filtered
      makeCandidate({ year: 1950, genres: ["Pop"] }), // genre fails
    ];
    const context: RadioContext = { seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context);

    expect(result).toHaveLength(1);
    expect(result[0]?.genres).toContain("Jazz");
  });

  test("no context (neither seedYear nor seedGenres) → all pass through", () => {
    const candidates = [
      makeCandidate({ year: 1960, genres: ["Jazz"] }),
      makeCandidate({ year: 2020, genres: ["Pop"] }),
      makeCandidate({ year: undefined, genres: undefined }),
    ];
    const context: RadioContext = {};
    const result = filterByContext(candidates, context);

    expect(result).toHaveLength(3);
  });

  test("empty candidates → returns empty array", () => {
    const result = filterByContext([], {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });
    expect(result).toHaveLength(0);
  });

  test("all candidates fail filters → returns empty array (not error)", () => {
    const candidates = [
      makeCandidate({ year: 2020, genres: ["Pop"] }),
      makeCandidate({ year: 2021, genres: ["Rock"] }),
    ];
    const result = filterByContext(candidates, {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterByContext — era window expansion (AC4)
// ---------------------------------------------------------------------------

describe("filterByContext — era window expansion (AC4)", () => {
  test("expands era window when fewer than minResults found", () => {
    // 5 candidates within ±20 years, 5 more within ±30 years → total 10 after expansion
    const within20 = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({ name: `Jazz ${i}`, year: 1959 + i, genres: ["Jazz"] }),
    );
    const within30 = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({
        name: `Early Jazz ${i}`,
        year: 1929 + i,
        genres: ["Jazz"],
      }),
    );
    const candidates = [...within20, ...within30];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context);

    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  test("does not expand beyond maxEraWindow", () => {
    // Only 2 candidates total — both in ±50 years (beyond maxEraWindow of 40)
    const config = { ...DEFAULT_FILTER_CONFIG, maxEraWindow: 40 };
    const candidates = [
      makeCandidate({ year: 1910, genres: ["Jazz"] }), // 49 years from 1959 → beyond max window
      makeCandidate({ year: 2010, genres: ["Jazz"] }), // 51 years from 1959 → beyond max window
    ];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context, config);

    // Max window 40 → neither candidate passes → returns empty (not infinite loop)
    expect(result).toHaveLength(0);
  });

  test("returns results when exactly minResults found at initial window", () => {
    const exactly10 = Array.from({ length: 10 }, (_, i) =>
      makeCandidate({ year: 1959 + i, genres: ["Jazz"] }),
    );
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(exactly10, context);

    expect(result.length).toBe(10);
  });

  test("custom config — uses provided minResults threshold", () => {
    const config = { ...DEFAULT_FILTER_CONFIG, minResults: 3 };
    const candidates = Array.from({ length: 3 }, (_, i) =>
      makeCandidate({ year: 1959 + i, genres: ["Jazz"] }),
    );
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context, config);

    // 3 >= minResults(3) → no expansion needed
    expect(result.length).toBe(3);
  });

  test("reaches maxEraWindow → returns current results even if below minResults", () => {
    const config = {
      minResults: 10,
      initialEraWindow: 20,
      eraExpansionStep: 10,
      maxEraWindow: 20, // same as initial → no expansion possible
    };
    const candidates = [
      makeCandidate({ year: 1960, genres: ["Jazz"] }), // only 1 candidate
    ];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context, config);

    // Only 1 result, but maxEraWindow reached → returns what we have
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// filterByContext — eraExpansionStep edge cases
// ---------------------------------------------------------------------------

describe("filterByContext — eraExpansionStep edge cases", () => {
  test("eraExpansionStep = 0 → no infinite recursion, returns first-pass results", () => {
    const config = {
      minResults: 10,
      initialEraWindow: 20,
      eraExpansionStep: 0, // guard must prevent infinite recursion
      maxEraWindow: 40,
    };
    const candidates = [makeCandidate({ year: 1960, genres: ["Jazz"] })];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context, config);

    // Guard kicks in (nextWindow <= eraWindow) → returns what we have (no stack overflow)
    expect(result).toHaveLength(1);
  });

  test("negative eraExpansionStep → no infinite recursion, returns first-pass results", () => {
    const config = {
      minResults: 10,
      initialEraWindow: 20,
      eraExpansionStep: -5, // guard must prevent infinite recursion
      maxEraWindow: 40,
    };
    const candidates = [makeCandidate({ year: 1960, genres: ["Jazz"] })];
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context, config);

    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// filterByContext — minimum results and graceful degradation (AC3, AC5)
// ---------------------------------------------------------------------------

describe("filterByContext — graceful degradation (AC5)", () => {
  test("candidates with no year pass era filter (graceful degradation)", () => {
    const candidates = [
      makeCandidate({ year: undefined, genres: ["Jazz"] }),
      makeCandidate({ year: undefined, genres: ["Jazz"] }),
    ];
    const result = filterByContext(candidates, {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });
    expect(result).toHaveLength(2);
  });

  test("candidates with no genres pass genre filter (graceful degradation)", () => {
    const candidates = [
      makeCandidate({ year: 1960, genres: undefined }),
      makeCandidate({ year: 1961, genres: undefined }),
    ];
    const result = filterByContext(candidates, {
      seedYear: 1959,
      seedGenres: ["Jazz"],
    });
    expect(result).toHaveLength(2);
  });

  test("candidates < minResults all passing → returns all (AC3)", () => {
    // Only 5 candidates, all pass → return all 5 even though minResults=10
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({ year: 1959 + i, genres: ["Jazz"] }),
    );
    const context: RadioContext = { seedYear: 1959, seedGenres: ["Jazz"] };
    const result = filterByContext(candidates, context);

    // Cannot get more than what we have → returns exactly all 5 that pass
    expect(result).toHaveLength(5);
    expect(result.every((t) => t.genres?.includes("Jazz"))).toBe(true);
  });
});
