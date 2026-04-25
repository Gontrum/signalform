/**
 * Search Deduplication Acceptance Tests (Story 3.2)
 *
 * BDD-style tests covering user-facing scenarios for deduplication.
 * Fluent Given/When/Then API.
 */

import { describe, test, expect } from "vitest";
import type { SearchResult as LmsSearchResult } from "../../adapters/lms-client/index.js";
import { deduplicateTracks } from "./core/service.js";

// ============================================================================
// Fluent BDD helpers
// ============================================================================

const givenLmsTracksFromSources = (
  title: string,
  artist: string,
  album: string,
  sources: ReadonlyArray<"local" | "qobuz" | "tidal">,
): readonly LmsSearchResult[] =>
  sources.map((source) => ({
    id: `${source}-${title}`,
    title,
    artist,
    album,
    url: `${source}://tracks/${title.toLowerCase().replace(/ /g, "-")}`,
    source,
    type: "track" as const,
  }));

const givenMixedLmsTracks = (
  tracks: ReadonlyArray<{
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly source: "local" | "qobuz" | "tidal";
  }>,
): readonly LmsSearchResult[] =>
  tracks.map((t) => ({
    id: `${t.source}-${t.title}`,
    title: t.title,
    artist: t.artist,
    album: t.album,
    url: `${t.source}://tracks/${t.title.toLowerCase()}`,
    source: t.source,
    type: "track" as const,
  }));

const thenResultCount = (
  results: ReturnType<typeof deduplicateTracks>,
  expected: number,
): void => {
  expect(results).toHaveLength(expected);
};

const thenResultHasSelectedSource = (
  results: ReturnType<typeof deduplicateTracks>,
  index: number,
  expectedSource: "local" | "qobuz" | "tidal" | "unknown",
): void => {
  expect(results[index]?.source).toBe(expectedSource);
};

const thenResultHasAvailableSourceCount = (
  results: ReturnType<typeof deduplicateTracks>,
  index: number,
  expectedCount: number,
): void => {
  expect(results[index]?.availableSources).toHaveLength(expectedCount);
};

// ============================================================================
// Acceptance scenarios
// ============================================================================

describe("Story 3.2: Deduplicate Search Results Across Sources", () => {
  test("User searches 'Money' available from local, Qobuz, Tidal → 1 result with local selected", () => {
    const lmsResults = givenLmsTracksFromSources(
      "Money",
      "Pink Floyd",
      "Dark Side of the Moon",
      ["local", "qobuz", "tidal"],
    );

    const results = deduplicateTracks(lmsResults);

    thenResultCount(results, 1);
    thenResultHasSelectedSource(results, 0, "local");
    thenResultHasAvailableSourceCount(results, 0, 3);
    expect(results[0]?.title).toBe("Money");
  });

  test("User searches 'Money' only on Qobuz and Tidal → 1 result with Qobuz selected", () => {
    const lmsResults = givenLmsTracksFromSources(
      "Money",
      "Pink Floyd",
      "Dark Side of the Moon",
      ["qobuz", "tidal"],
    );

    const results = deduplicateTracks(lmsResults);

    thenResultCount(results, 1);
    thenResultHasSelectedSource(results, 0, "qobuz");
    thenResultHasAvailableSourceCount(results, 0, 2);
  });

  test("User searches 'Exclusive' only on Tidal → 1 result with Tidal selected", () => {
    const lmsResults = givenLmsTracksFromSources(
      "Exclusive",
      "Some Artist",
      "Some Album",
      ["tidal"],
    );

    const results = deduplicateTracks(lmsResults);

    thenResultCount(results, 1);
    thenResultHasSelectedSource(results, 0, "tidal");
    thenResultHasAvailableSourceCount(results, 0, 1);
  });

  test("User searches mixed query → unique tracks not merged, duplicates deduplicated", () => {
    // "Money" from all 3 sources (should merge to 1)
    // "Time" only from local (stays as 1)
    // "Comfortably Numb" from local + qobuz (should merge to 1)
    const lmsResults: readonly LmsSearchResult[] = [
      ...givenLmsTracksFromSources("Money", "Pink Floyd", "Dark Side", [
        "local",
        "qobuz",
        "tidal",
      ]),
      ...givenLmsTracksFromSources("Time", "Pink Floyd", "Dark Side", [
        "local",
      ]),
      ...givenLmsTracksFromSources(
        "Comfortably Numb",
        "Pink Floyd",
        "The Wall",
        ["local", "qobuz"],
      ),
    ];

    const results = deduplicateTracks(lmsResults);

    thenResultCount(results, 3);
    // Money: local selected (best priority)
    const money = results.find((r) => r.title === "Money");
    expect(money?.source).toBe("local");
    expect(money?.availableSources).toHaveLength(3);
    // Time: local only
    const time = results.find((r) => r.title === "Time");
    expect(time?.source).toBe("local");
    expect(time?.availableSources).toHaveLength(1);
    // Comfortably Numb: local preferred over qobuz
    const numb = results.find((r) => r.title === "Comfortably Numb");
    expect(numb?.source).toBe("local");
    expect(numb?.availableSources).toHaveLength(2);
  });

  test("Deduplication normalizes case differences (MONEY vs Money)", () => {
    const lmsResults: readonly LmsSearchResult[] = [
      {
        id: "local-1",
        title: "MONEY",
        artist: "PINK FLOYD",
        album: "DARK SIDE OF THE MOON",
        url: "local://tracks/money",
        source: "local",
        type: "track",
      },
      {
        id: "qobuz-1",
        title: "Money",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        url: "qobuz://tracks/money",
        source: "qobuz",
        type: "track",
      },
    ];

    const results = deduplicateTracks(lmsResults);

    thenResultCount(results, 1);
    thenResultHasSelectedSource(results, 0, "local");
    thenResultHasAvailableSourceCount(results, 0, 2);
  });

  test("Two different tracks are not merged", () => {
    const lmsResults = givenMixedLmsTracks([
      {
        title: "Money",
        artist: "Pink Floyd",
        album: "Dark Side",
        source: "local",
      },
      {
        title: "Comfortably Numb",
        artist: "Pink Floyd",
        album: "The Wall",
        source: "local",
      },
    ]);

    const results = deduplicateTracks(lmsResults);

    thenResultCount(results, 2);
  });

  test("Empty LMS results returns empty array", () => {
    const results = deduplicateTracks([]);

    thenResultCount(results, 0);
  });

  test("availableSources contains url for each source", () => {
    const lmsResults = givenLmsTracksFromSources(
      "Money",
      "Pink Floyd",
      "Dark Side of the Moon",
      ["local", "qobuz"],
    );

    const results = deduplicateTracks(lmsResults);

    expect(results[0]?.availableSources).toHaveLength(2);
    const sources = results[0]!.availableSources;
    const sourceTypes = sources.map((s) => s.source);
    expect(sourceTypes).toContain("local");
    expect(sourceTypes).toContain("qobuz");
    sources.forEach((s) => {
      expect(typeof s.url).toBe("string");
      expect(s.url.length).toBeGreaterThan(0);
    });
  });
});
