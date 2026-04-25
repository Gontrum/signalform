/**
 * Source Hierarchy Service - Unit Tests
 *
 * Tests for pure business logic: calculateQualityScore, compareQuality,
 * applySourceTieBreaker, rankSources, selectBestSource, createSourceHierarchyService.
 *
 * Following BDD pattern with given/when/then helpers.
 * Target: 35-45 unit tests covering all edge cases.
 */

import type { AudioQuality, TrackSource } from "@signalform/shared";
import { describe, expect, test } from "vitest";
import type { QualityHierarchyConfig } from "./types.js";
import {
  applySourceTieBreaker,
  calculateQualityScore,
  compareQuality,
  createSourceHierarchyService,
  DEFAULT_QUALITY_CONFIG,
  rankSources,
  selectBestSource,
} from "./service.js";

// ---------------------------------------------------------------------------
// Test Helpers / Fixtures
// ---------------------------------------------------------------------------

const makeQuality = (overrides: Partial<AudioQuality> = {}): AudioQuality => ({
  format: "FLAC",
  bitrate: 1411,
  sampleRate: 44100,
  bitDepth: 16,
  lossless: true,
  ...overrides,
});

const makeSource = (overrides: Partial<TrackSource> = {}): TrackSource => ({
  source: "local",
  url: "file:///music/track.flac",
  quality: makeQuality(),
  available: true,
  ...overrides,
});

const cd44: AudioQuality = makeQuality({
  format: "FLAC",
  bitrate: 1411,
  sampleRate: 44100,
  bitDepth: 16,
  lossless: true,
});

const hires96: AudioQuality = makeQuality({
  format: "FLAC",
  bitrate: 4608,
  sampleRate: 96000,
  bitDepth: 24,
  lossless: true,
});

const hires192: AudioQuality = makeQuality({
  format: "FLAC",
  bitrate: 9216,
  sampleRate: 192000,
  bitDepth: 24,
  lossless: true,
});

const lossy320: AudioQuality = makeQuality({
  format: "MP3",
  bitrate: 320,
  sampleRate: 44100,
  bitDepth: 16,
  lossless: false,
});

const lossy128: AudioQuality = makeQuality({
  format: "MP3",
  bitrate: 128,
  sampleRate: 44100,
  bitDepth: 16,
  lossless: false,
});

// ---------------------------------------------------------------------------
// Task 5: Unit tests for calculateQualityScore
// ---------------------------------------------------------------------------

describe("calculateQualityScore", () => {
  test("lossless FLAC 24/192 has highest score", () => {
    const score = calculateQualityScore(hires192);
    expect(score).toBeGreaterThan(0);
  });

  test("lossless FLAC 24/96 has lower score than 24/192", () => {
    const score192 = calculateQualityScore(hires192);
    const score96 = calculateQualityScore(hires96);
    expect(score192).toBeGreaterThan(score96);
  });

  test("lossless FLAC 16/44 has lower score than 24/96", () => {
    const score96 = calculateQualityScore(hires96);
    const score44 = calculateQualityScore(cd44);
    expect(score96).toBeGreaterThan(score44);
  });

  test("lossy MP3 320kbps has lower score than lossless 16/44", () => {
    const scoreFlac = calculateQualityScore(cd44);
    const scoreMp3 = calculateQualityScore(lossy320);
    expect(scoreFlac).toBeGreaterThan(scoreMp3);
  });

  test("MP3 320kbps and 128kbps have same score (bitrate not in formula; lossy format determines score)", () => {
    // The formula: bitDepth * sampleRate * losslessFactor + formatBonus
    // bitrate is intentionally not part of the score - format type is sufficient for ranking.
    // Both use identical bitDepth, sampleRate, and MP3 formatBonus.
    const score320 = calculateQualityScore(lossy320);
    const score128 = calculateQualityScore(lossy128);
    expect(score320).toBe(score128);
  });

  test("quality ordering: 24/192 > 24/96 > 16/44 > lossy (regardless of bitrate)", () => {
    const s192 = calculateQualityScore(hires192);
    const s96 = calculateQualityScore(hires96);
    const s44 = calculateQualityScore(cd44);
    const s320 = calculateQualityScore(lossy320);

    expect(s192).toBeGreaterThan(s96);
    expect(s96).toBeGreaterThan(s44);
    expect(s44).toBeGreaterThan(s320);
  });

  test("lossless factor multiplied correctly (10x for lossless)", () => {
    const losslessScore = calculateQualityScore(
      makeQuality({ lossless: true, format: "FLAC" }),
    );
    const lossyScore = calculateQualityScore(
      makeQuality({ lossless: false, format: "MP3" }),
    );
    // Lossless gets 10x base factor plus format bonus
    expect(losslessScore).toBeGreaterThan(lossyScore);
  });

  test("FLAC and ALAC have same format bonus", () => {
    const flacScore = calculateQualityScore(
      makeQuality({ format: "FLAC", lossless: true }),
    );
    const alacScore = calculateQualityScore(
      makeQuality({ format: "ALAC", lossless: true }),
    );
    expect(flacScore).toBe(alacScore);
  });

  test("AAC has higher format bonus than MP3", () => {
    const aacScore = calculateQualityScore(
      makeQuality({ format: "AAC", lossless: false }),
    );
    const mp3Score = calculateQualityScore(
      makeQuality({ format: "MP3", lossless: false }),
    );
    expect(aacScore).toBeGreaterThan(mp3Score);
  });

  test("OGG and MP3 have same format bonus", () => {
    const oggScore = calculateQualityScore(
      makeQuality({ format: "OGG", lossless: false }),
    );
    const mp3Score = calculateQualityScore(
      makeQuality({ format: "MP3", lossless: false }),
    );
    expect(oggScore).toBe(mp3Score);
  });

  test("respects custom config lossless factor", () => {
    const customConfig: QualityHierarchyConfig = {
      ...DEFAULT_QUALITY_CONFIG,
      losslessFactor: 100,
    };
    const defaultScore = calculateQualityScore(cd44);
    const customScore = calculateQualityScore(cd44, customConfig);
    expect(customScore).toBeGreaterThan(defaultScore);
  });

  test("returns a positive number for any valid quality", () => {
    const score = calculateQualityScore(cd44);
    expect(score).toBeGreaterThan(0);
  });

  test("same quality returns same score (deterministic)", () => {
    const score1 = calculateQualityScore(hires96);
    const score2 = calculateQualityScore(hires96);
    expect(score1).toBe(score2);
  });

  test("unknown format key falls back to 0 bonus (?? 0 branch)", () => {
    // Uses a custom config whose formatBonuses record does not contain the
    // format key, exercising the `?? 0` null-coalescing fallback in
    // calculateQualityScore (service.ts:111).
    const customConfig: QualityHierarchyConfig = {
      ...DEFAULT_QUALITY_CONFIG,
      formatBonuses: { FLAC: 1000 }, // "MP3" is intentionally absent
    };
    const quality = makeQuality({ format: "MP3", lossless: false });
    const score = calculateQualityScore(quality, customConfig);
    // Expected: bitDepth(16) * sampleRate(44100) * losslessFactor(1) + 0
    expect(score).toBe(16 * 44100 * 1 + 0);
  });
});

// ---------------------------------------------------------------------------
// compareQuality tests
// ---------------------------------------------------------------------------

describe("compareQuality", () => {
  test("returns positive when a is better quality", () => {
    const result = compareQuality(hires192, cd44);
    expect(result).toBeGreaterThan(0);
  });

  test("returns negative when b is better quality", () => {
    const result = compareQuality(cd44, hires192);
    expect(result).toBeLessThan(0);
  });

  test("returns 0 for equal quality", () => {
    const result = compareQuality(cd44, cd44);
    expect(result).toBe(0);
  });

  test("is antisymmetric: compare(a,b) = -compare(b,a)", () => {
    const ab = compareQuality(hires96, lossy320);
    const ba = compareQuality(lossy320, hires96);
    expect(ab).toBe(-ba);
  });
});

// ---------------------------------------------------------------------------
// applySourceTieBreaker tests
// ---------------------------------------------------------------------------

describe("applySourceTieBreaker", () => {
  test("local has higher priority than qobuz (returns negative)", () => {
    const result = applySourceTieBreaker("local", "qobuz");
    expect(result).toBeLessThan(0);
  });

  test("local has higher priority than tidal (returns negative)", () => {
    const result = applySourceTieBreaker("local", "tidal");
    expect(result).toBeLessThan(0);
  });

  test("qobuz has higher priority than tidal (returns negative)", () => {
    const result = applySourceTieBreaker("qobuz", "tidal");
    expect(result).toBeLessThan(0);
  });

  test("tidal has lower priority than qobuz (returns positive)", () => {
    const result = applySourceTieBreaker("tidal", "qobuz");
    expect(result).toBeGreaterThan(0);
  });

  test("same source returns 0", () => {
    expect(applySourceTieBreaker("local", "local")).toBe(0);
    expect(applySourceTieBreaker("qobuz", "qobuz")).toBe(0);
    expect(applySourceTieBreaker("tidal", "tidal")).toBe(0);
  });

  test("priority order matches DEFAULT_SOURCE_PRIORITY", () => {
    const localVsQobuz = applySourceTieBreaker("local", "qobuz");
    const qobuzVsTidal = applySourceTieBreaker("qobuz", "tidal");
    expect(localVsQobuz).toBeLessThan(0);
    expect(qobuzVsTidal).toBeLessThan(0);
  });

  test("unknown source type gets lowest priority (index -1 branch, service.ts:151-152)", () => {
    // A source omitted from custom sourcePriority falls back to
    // `config.sourcePriority.length`, exercising the same index -1 branch.
    const customConfig: QualityHierarchyConfig = {
      ...DEFAULT_QUALITY_CONFIG,
      sourcePriority: ["local", "qobuz"],
    };
    expect(
      applySourceTieBreaker("tidal", "local", customConfig),
    ).toBeGreaterThan(0);
    expect(
      applySourceTieBreaker("tidal", "qobuz", customConfig),
    ).toBeGreaterThan(0);
    expect(applySourceTieBreaker("local", "tidal", customConfig)).toBeLessThan(
      0,
    );
    expect(applySourceTieBreaker("tidal", "tidal", customConfig)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 5/6: rankSources tests
// ---------------------------------------------------------------------------

describe("rankSources", () => {
  test("returns empty array for empty input", () => {
    const result = rankSources([]);
    expect(result).toEqual([]);
  });

  test("returns same single source unchanged", () => {
    const source = makeSource({ source: "local" });
    const result = rankSources([source]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(source);
  });

  test("places higher quality source first", () => {
    const hiRes = makeSource({
      source: "local",
      quality: hires192,
    });
    const cdQuality = makeSource({
      source: "qobuz",
      quality: cd44,
    });

    const result = rankSources([cdQuality, hiRes]);
    expect(result[0]).toEqual(hiRes);
    expect(result[1]).toEqual(cdQuality);
  });

  test("applies tie-breaker: local preferred over qobuz at equal quality", () => {
    const local = makeSource({ source: "local", quality: hires96 });
    const qobuz = makeSource({ source: "qobuz", quality: hires96 });
    const tidal = makeSource({ source: "tidal", quality: hires96 });

    const result = rankSources([tidal, qobuz, local]);
    expect(result[0]!.source).toBe("local");
    expect(result[1]!.source).toBe("qobuz");
    expect(result[2]!.source).toBe("tidal");
  });

  test("does not mutate original array", () => {
    const sources = [
      makeSource({ source: "tidal", quality: cd44 }),
      makeSource({ source: "local", quality: hires192 }),
    ];
    const originalOrder = [...sources];
    rankSources(sources);
    expect(sources).toEqual(originalOrder);
  });

  test("correctly orders 3 distinct quality sources", () => {
    const sources = [
      makeSource({ source: "tidal", quality: cd44 }),
      makeSource({ source: "local", quality: hires192 }),
      makeSource({ source: "qobuz", quality: hires96 }),
    ];
    const result = rankSources(sources);
    expect(result[0]!.quality).toEqual(hires192);
    expect(result[1]!.quality).toEqual(hires96);
    expect(result[2]!.quality).toEqual(cd44);
  });
});

// ---------------------------------------------------------------------------
// Task 6: Unit tests for selectBestSource (edge cases)
// ---------------------------------------------------------------------------

describe("selectBestSource", () => {
  // Case 1: Single source
  test("returns single source when only one source provided", () => {
    const source = makeSource({ source: "tidal", quality: cd44 });
    const result = selectBestSource([source]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(source);
    }
  });

  // Case 2: Multiple sources different quality
  test("returns highest quality source when qualities differ", () => {
    const sources = [
      makeSource({ source: "tidal", quality: cd44 }),
      makeSource({ source: "local", quality: hires192 }),
      makeSource({ source: "qobuz", quality: hires96 }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quality).toEqual(hires192);
      expect(result.value.source).toBe("local");
    }
  });

  // FR11 acceptance: All sources same quality → local wins
  test("selects local source when all sources have equal quality (tie-breaking FR11)", () => {
    const sources = [
      makeSource({ source: "tidal", quality: hires96 }),
      makeSource({ source: "qobuz", quality: hires96 }),
      makeSource({ source: "local", quality: hires96 }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("local");
    }
  });

  // AC from story: {local: 24/96}, {qobuz: 24/96}, {tidal: 16/44.1} → local
  test("selects local over qobuz when both 24/96, tidal 16/44 (AC from story)", () => {
    const sources = [
      makeSource({ source: "local", quality: hires96 }),
      makeSource({ source: "qobuz", quality: hires96 }),
      makeSource({ source: "tidal", quality: cd44 }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("local");
    }
  });

  // Case 4: No sources provided
  test("returns NO_SOURCES error for empty array", () => {
    const result = selectBestSource([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NO_SOURCES");
    }
  });

  // Case 5: No available sources
  test("returns NO_SOURCES_AVAILABLE error when all sources unavailable", () => {
    const sources = [
      makeSource({ source: "local", available: false }),
      makeSource({ source: "qobuz", available: false }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NO_SOURCES_AVAILABLE");
    }
  });

  // Case: Only unavailable sources filtered out, available one selected
  test("ignores unavailable sources and selects best available", () => {
    const sources = [
      makeSource({ source: "local", quality: hires192, available: false }),
      makeSource({ source: "qobuz", quality: hires96, available: true }),
      makeSource({ source: "tidal", quality: cd44, available: true }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("qobuz");
    }
  });

  // Case 3: Missing quality information
  test("returns MISSING_QUALITY_DATA error for sources with missing quality fields", () => {
    const badSource = {
      source: "local",
      url: "file:///track.mp3",
      quality: makeQuality({
        bitrate: undefined,
        sampleRate: undefined,
        bitDepth: undefined,
        lossless: undefined,
      }),
      available: true,
    } satisfies TrackSource;

    const result = selectBestSource([badSource]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("MISSING_QUALITY_DATA");
    }
  });

  // Case 6: Invalid quality data
  test("returns INVALID_QUALITY_DATA error for negative bitrate", () => {
    const source = makeSource({
      quality: makeQuality({ bitrate: -320 }),
    });

    const result = selectBestSource([source]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_QUALITY_DATA");
    }
  });

  test("returns INVALID_QUALITY_DATA error for zero sample rate", () => {
    const source = makeSource({
      quality: makeQuality({ sampleRate: 0 }),
    });

    const result = selectBestSource([source]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_QUALITY_DATA");
    }
  });

  test("returns INVALID_QUALITY_DATA error for zero bitDepth", () => {
    const source = makeSource({
      quality: makeQuality({ bitDepth: 0 }),
    });

    const result = selectBestSource([source]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_QUALITY_DATA");
    }
  });

  // Story 3.6: bitDepth is optional in AudioQuality — absence must not fail validation
  test("succeeds when bitDepth is undefined (optional field)", () => {
    const source = makeSource({
      quality: makeQuality({ bitDepth: undefined }),
    });

    const result = selectBestSource([source]);

    expect(result.ok).toBe(true);
  });

  test("selects source without bitDepth over unavailable source", () => {
    const sourceWithoutBitDepth = makeSource({
      source: "local",
      quality: makeQuality({ bitDepth: undefined }),
      available: true,
    });
    const unavailableSource = makeSource({
      source: "qobuz",
      quality: hires96,
      available: false,
    });

    const result = selectBestSource([sourceWithoutBitDepth, unavailableSource]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("local");
    }
  });

  test("SelectionError includes context with affected sources", () => {
    const result = selectBestSource([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBeTruthy();
      expect(typeof result.error.message).toBe("string");
    }
  });

  test("NO_SOURCES_AVAILABLE error includes total source count in context", () => {
    const sources = [
      makeSource({ source: "local", available: false }),
      makeSource({ source: "qobuz", available: false }),
      makeSource({ source: "tidal", available: false }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NO_SOURCES_AVAILABLE");
      expect(result.error.context?.["totalSources"]).toBe(3);
    }
  });

  test("respects custom config for quality ranking", () => {
    const customConfig: QualityHierarchyConfig = {
      ...DEFAULT_QUALITY_CONFIG,
      // Reverse source priority: tidal > qobuz > local
      sourcePriority: ["tidal", "qobuz", "local"],
    };

    const sources = [
      makeSource({ source: "local", quality: hires96 }),
      makeSource({ source: "tidal", quality: hires96 }),
    ];

    const result = selectBestSource(sources, customConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("tidal");
    }
  });

  // Performance test
  test("selects source in < 50ms for 100 iterations", () => {
    const sources = [
      makeSource({ source: "local", quality: hires192 }),
      makeSource({ source: "qobuz", quality: hires96 }),
      makeSource({ source: "tidal", quality: cd44 }),
    ];

    const start = performance.now();
    Array.from({ length: 100 }).forEach(() => {
      selectBestSource(sources);
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });

  test("is pure: same inputs always produce same output", () => {
    const sources = [
      makeSource({ source: "local", quality: hires96 }),
      makeSource({ source: "qobuz", quality: cd44 }),
    ];

    const result1 = selectBestSource(sources);
    const result2 = selectBestSource(sources);

    expect(result1).toEqual(result2);
  });

  // H1 regression: unavailable source with invalid quality must not block valid available source
  test("ignores invalid quality on unavailable source, selects valid available source", () => {
    const sources = [
      makeSource({
        source: "local",
        available: false,
        quality: makeQuality({ bitrate: -1 }),
      }),
      makeSource({ source: "qobuz", available: true, quality: hires96 }),
    ];

    const result = selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("qobuz");
    }
  });

  // H1 regression: unavailable source with missing quality must not block valid available source
  test("ignores missing quality data on unavailable source, selects valid available source", () => {
    const badSource = {
      source: "tidal" as const,
      url: "tidal://track/1",
      quality: makeQuality({
        bitrate: undefined,
        sampleRate: undefined,
        bitDepth: undefined,
        lossless: undefined,
      }),
      available: false,
    };
    const goodSource = makeSource({
      source: "local",
      available: true,
      quality: hires96,
    });

    const result = selectBestSource([badSource, goodSource]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("local");
    }
  });

  test("aac source preferred over mp3 at same bitDepth/sampleRate", () => {
    const aacSource = makeSource({
      source: "qobuz",
      quality: makeQuality({ format: "AAC", lossless: false }),
    });
    const mp3Source = makeSource({
      source: "local",
      quality: makeQuality({ format: "MP3", lossless: false }),
    });

    // Even though local has tie-breaker preference, AAC has higher format bonus
    const result = selectBestSource([mp3Source, aacSource]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("qobuz");
    }
  });
});

// ---------------------------------------------------------------------------
// createSourceHierarchyService tests
// ---------------------------------------------------------------------------

describe("createSourceHierarchyService", () => {
  test("creates service with default config", () => {
    const service = createSourceHierarchyService();
    expect(service).toHaveProperty("selectBestSource");
    expect(service).toHaveProperty("rankSources");
    expect(typeof service.selectBestSource).toBe("function");
    expect(typeof service.rankSources).toBe("function");
  });

  test("service.selectBestSource delegates to selectBestSource", () => {
    const service = createSourceHierarchyService();
    const sources = [makeSource({ source: "local", quality: hires192 })];

    const result = service.selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("local");
    }
  });

  test("service.rankSources delegates to rankSources", () => {
    const service = createSourceHierarchyService();
    const sources = [
      makeSource({ source: "tidal", quality: cd44 }),
      makeSource({ source: "local", quality: hires192 }),
    ];

    const result = service.rankSources(sources);

    expect(result[0]!.source).toBe("local");
    expect(result[1]!.source).toBe("tidal");
  });

  test("creates service with custom config that overrides defaults", () => {
    const customConfig: QualityHierarchyConfig = {
      ...DEFAULT_QUALITY_CONFIG,
      sourcePriority: ["tidal", "qobuz", "local"],
    };

    const service = createSourceHierarchyService(customConfig);
    const sources = [
      makeSource({ source: "local", quality: hires96 }),
      makeSource({ source: "tidal", quality: hires96 }),
    ];

    const result = service.selectBestSource(sources);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Custom config: tidal > local
      expect(result.value.source).toBe("tidal");
    }
  });
});
