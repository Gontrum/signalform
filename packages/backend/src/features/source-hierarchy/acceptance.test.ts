/**
 * Source Hierarchy Service - Acceptance Tests (BDD)
 *
 * User scenario tests using fluent API pattern:
 * givenTrackWithSources → whenSelectingSource → thenSelectedSourceIs
 *
 * Target: 8-10 acceptance tests covering real user scenarios.
 */

import { describe, test, expect } from "vitest";
import { selectBestSource } from "./core/service.js";
import type { TrackSource, AudioQuality } from "@signalform/shared";

// ---------------------------------------------------------------------------
// Fluent BDD Helpers
// ---------------------------------------------------------------------------

type SourceSpec = {
  readonly source: "local" | "qobuz" | "tidal";
  readonly quality: AudioQuality;
  readonly available?: boolean;
};

const givenTrackWithSources = (
  specs: readonly SourceSpec[],
): readonly TrackSource[] =>
  specs.map((spec) => ({
    source: spec.source,
    url: `${spec.source}:///music/track`,
    quality: spec.quality,
    available: spec.available ?? true,
  }));

const whenSelectingSource = (
  sources: readonly TrackSource[],
): ReturnType<typeof selectBestSource> => selectBestSource(sources);

const thenSelectedSourceIs = (
  result: ReturnType<typeof selectBestSource>,
  expectedSource: "local" | "qobuz" | "tidal",
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.source).toBe(expectedSource);
  }
};

const thenSelectionFailsWith = (
  result: ReturnType<typeof selectBestSource>,
  expectedErrorType: string,
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.type).toBe(expectedErrorType);
  }
};

// Quality presets matching story specification
const Q_24_96: AudioQuality = {
  format: "FLAC",
  bitrate: 4608,
  sampleRate: 96000,
  bitDepth: 24,
  lossless: true,
};

const Q_24_192: AudioQuality = {
  format: "FLAC",
  bitrate: 9216,
  sampleRate: 192000,
  bitDepth: 24,
  lossless: true,
};

const Q_16_44: AudioQuality = {
  format: "FLAC",
  bitrate: 1411,
  sampleRate: 44100,
  bitDepth: 16,
  lossless: true,
};

// ---------------------------------------------------------------------------
// Acceptance Scenarios (FR10, FR11)
// ---------------------------------------------------------------------------

describe("Source Hierarchy Service - Acceptance Tests", () => {
  test("Scenario 1: All 3 sources at 24/96 → selects local (FR11 tie-breaking)", () => {
    // AC: Given track with [{local: 24/96}, {qobuz: 24/96}, {tidal: 24/96}]
    // When  Service receives track with sources
    // Then  Returns local source (quality tie → local preference - FR11)
    const sources = givenTrackWithSources([
      { source: "local", quality: Q_24_96 },
      { source: "qobuz", quality: Q_24_96 },
      { source: "tidal", quality: Q_24_96 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "local");
  });

  test("Scenario 2: Qobuz 24/96, Tidal 16/44 → selects Qobuz (FR10 quality ranking)", () => {
    // AC: If qualities differ, highest bitrate/sample rate wins (24/192 > 24/96 > 16/44.1 - FR10)
    const sources = givenTrackWithSources([
      { source: "qobuz", quality: Q_24_96 },
      { source: "tidal", quality: Q_16_44 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "qobuz");
  });

  test("Scenario 3: Only Tidal available → selects Tidal despite low preference", () => {
    // Tidal should be selected even though it's last in hierarchy (no alternatives)
    const sources = givenTrackWithSources([
      { source: "tidal", quality: Q_16_44 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "tidal");
  });

  test("Scenario 4: Local 24/96, Qobuz 24/96, Tidal 16/44 → selects local (story AC exact match)", () => {
    // Story AC exact: {local: 24/96}, {qobuz: 24/96}, {tidal: 16/44.1} → local
    const sources = givenTrackWithSources([
      { source: "local", quality: Q_24_96 },
      { source: "qobuz", quality: Q_24_96 },
      { source: "tidal", quality: Q_16_44 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "local");
  });

  test("Scenario 5: Local unavailable, Qobuz 24/192 vs Tidal 24/96 → selects Qobuz", () => {
    // When local NAS is offline, streaming service with better quality wins
    const sources = givenTrackWithSources([
      { source: "local", quality: Q_24_96, available: false },
      { source: "qobuz", quality: Q_24_192 },
      { source: "tidal", quality: Q_24_96 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "qobuz");
  });

  test("Scenario 6: All sources unavailable → returns error", () => {
    // User's player should receive clear error, not crash
    const sources = givenTrackWithSources([
      { source: "local", quality: Q_24_96, available: false },
      { source: "qobuz", quality: Q_24_96, available: false },
      { source: "tidal", quality: Q_24_96, available: false },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectionFailsWith(result, "NO_SOURCES_AVAILABLE");
  });

  test("Scenario 7: Local 24/192 beats Qobuz 24/96 (quality over source preference)", () => {
    // Quality ranking takes precedence over source preference
    const sources = givenTrackWithSources([
      { source: "local", quality: Q_24_192 },
      { source: "qobuz", quality: Q_24_96 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "local");
  });

  test("Scenario 8: Tidal 24/192 beats local 16/44 (quality beats source preference)", () => {
    // Even low-priority Tidal wins when it has clearly superior quality
    const sources = givenTrackWithSources([
      { source: "local", quality: Q_16_44 },
      { source: "tidal", quality: Q_24_192 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "tidal");
  });

  test("Scenario 9: No sources provided → returns error with clear message", () => {
    // Defensive: service handles empty source list gracefully
    const sources = givenTrackWithSources([]);

    const result = whenSelectingSource(sources);

    thenSelectionFailsWith(result, "NO_SOURCES");
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  test("Scenario 10: Qobuz 24/96 vs Tidal 24/96 → selects Qobuz (tie-breaking hierarchy)", () => {
    // When quality is tied between streaming services, Qobuz has priority over Tidal
    const sources = givenTrackWithSources([
      { source: "tidal", quality: Q_24_96 },
      { source: "qobuz", quality: Q_24_96 },
    ]);

    const result = whenSelectingSource(sources);

    thenSelectedSourceIs(result, "qobuz");
  });
});
