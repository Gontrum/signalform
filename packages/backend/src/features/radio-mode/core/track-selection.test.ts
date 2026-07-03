/**
 * Radio Mode — Track Selection (functional core) — Unit Tests
 *
 * Pure synchronous tests, no mocks: fixtures in, values out.
 */

import { describe, expect, test } from "vitest";
import type { AudioQuality } from "@signalform/shared";
import type { SearchResult } from "../../../adapters/lms-client/index.js";
import {
  artistMatches,
  buildRadioSearchQueries,
  computeFallbackUrl,
  selectBestTrackUrl,
  uniqueQueries,
} from "./track-selection.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const flacCd: AudioQuality = {
  format: "FLAC",
  bitrate: 1411,
  sampleRate: 44100,
  bitDepth: 16,
  lossless: true,
};

const flacHiRes: AudioQuality = {
  format: "FLAC",
  bitrate: 4608,
  sampleRate: 96000,
  bitDepth: 24,
  lossless: true,
};

const mp3High: AudioQuality = {
  format: "MP3",
  bitrate: 320,
  sampleRate: 44100,
  lossless: false,
};

const mp3Low: AudioQuality = {
  format: "MP3",
  bitrate: 128,
  sampleRate: 44100,
  lossless: false,
};

const makeResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  id: "1",
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  url: "file:///music/test.flac",
  source: "local",
  type: "track",
  ...overrides,
});

// ---------------------------------------------------------------------------
// computeFallbackUrl
// ---------------------------------------------------------------------------

describe("computeFallbackUrl", () => {
  test("returns undefined for empty results", () => {
    expect(computeFallbackUrl([])).toBeUndefined();
  });

  test("prefers lossless over higher-bitrate lossy", () => {
    const results = [
      makeResult({ url: "lossy://high", audioQuality: mp3High }),
      makeResult({ url: "lossless://cd", audioQuality: flacCd }),
    ];
    // MP3 320 has a higher... no: FLAC 1411 > 320, so flip bitrates to prove
    // lossless wins regardless of bitrate ordering.
    const lossyHigherBitrate = [
      makeResult({
        url: "lossy://very-high",
        audioQuality: { ...mp3High, bitrate: 9999 },
      }),
      makeResult({ url: "lossless://cd", audioQuality: flacCd }),
    ];
    expect(computeFallbackUrl(results)).toBe("lossless://cd");
    expect(computeFallbackUrl(lossyHigherBitrate)).toBe("lossless://cd");
  });

  test("among lossless results picks the higher bitrate", () => {
    const results = [
      makeResult({ url: "lossless://cd", audioQuality: flacCd }),
      makeResult({ url: "lossless://hires", audioQuality: flacHiRes }),
    ];
    expect(computeFallbackUrl(results)).toBe("lossless://hires");
  });

  test("treats results without audioQuality as bitrate 0", () => {
    const results = [
      makeResult({ url: "unknown://no-quality", audioQuality: undefined }),
      makeResult({ url: "lossy://low", audioQuality: mp3Low }),
    ];
    expect(computeFallbackUrl(results)).toBe("lossy://low");
  });
});

// ---------------------------------------------------------------------------
// selectBestTrackUrl
// ---------------------------------------------------------------------------

describe("selectBestTrackUrl", () => {
  test("uses selectBestSource for results with audioQuality and known source", () => {
    const results = [
      makeResult({ url: "local://cd", source: "local", audioQuality: flacCd }),
      makeResult({
        url: "qobuz://hires",
        source: "qobuz",
        audioQuality: flacHiRes,
      }),
    ];
    const result = selectBestTrackUrl(results);
    expect(result.url).toBe("qobuz://hires");
    expect(result.selectionError).toBeUndefined();
  });

  test("falls back to computeFallbackUrl when all sources are unknown or lack audioQuality", () => {
    const results = [
      makeResult({ url: "no-quality://a", audioQuality: undefined }),
      makeResult({
        url: "unknown://lossless",
        source: "unknown",
        audioQuality: flacCd,
      }),
      makeResult({
        url: "unknown://lossy",
        source: "unknown",
        audioQuality: mp3High,
      }),
    ];
    const result = selectBestTrackUrl(results);
    expect(result.url).toBe(computeFallbackUrl(results));
    expect(result.url).toBe("unknown://lossless");
  });

  test("returns undefined url for empty results", () => {
    const result = selectBestTrackUrl([]);
    expect(result.url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// artistMatches
// ---------------------------------------------------------------------------

describe("artistMatches", () => {
  test("matches identical artist names", () => {
    expect(artistMatches("Olivia Rodrigo", "Olivia Rodrigo")).toBe(true);
  });

  test("matches case-insensitively", () => {
    expect(artistMatches("OLIVIA RODRIGO", "olivia rodrigo")).toBe(true);
  });

  test("matches featuring variants bidirectionally", () => {
    expect(artistMatches("Olivia Rodrigo feat. X", "Olivia Rodrigo")).toBe(
      true,
    );
    expect(artistMatches("Olivia Rodrigo", "Olivia Rodrigo feat. X")).toBe(
      true,
    );
  });

  test("matches across diacritics via NFD normalization", () => {
    expect(artistMatches("Björk", "bjork")).toBe(true);
    expect(artistMatches("bjork", "Björk")).toBe(true);
  });

  test("returns false for a clear non-match", () => {
    expect(artistMatches("Various Artists", "Metallica")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// uniqueQueries
// ---------------------------------------------------------------------------

describe("uniqueQueries", () => {
  test("trims queries", () => {
    expect(uniqueQueries(["  hello world  "])).toEqual(["hello world"]);
  });

  test("drops empty and whitespace-only queries", () => {
    expect(uniqueQueries(["", "   ", "a"])).toEqual(["a"]);
  });

  test("deduplicates queries after trimming", () => {
    expect(uniqueQueries(["a", " a ", "b", "a"])).toEqual(["a", "b"]);
  });

  test("preserves first-seen order", () => {
    expect(uniqueQueries(["c", "a", "b", "a", "c"])).toEqual(["c", "a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// buildRadioSearchQueries
// ---------------------------------------------------------------------------

describe("buildRadioSearchQueries", () => {
  test("returns artist+title permutations and title variants", () => {
    const queries = buildRadioSearchQueries("Artist", "Song (Live)");
    expect(queries).toEqual([
      "Artist Song (Live)",
      "Song (Live) Artist",
      "Song (Live)",
      "Song",
      "Artist Song",
      "Song Artist",
    ]);
  });

  test("strips parenthetical suffixes from the normalized title", () => {
    const queries = buildRadioSearchQueries("Artist", "Song (Remastered 2011)");
    expect(queries).toContain("Song");
    expect(queries).toContain("Artist Song");
    expect(queries).toContain("Song Artist");
  });

  test("deduplicates when normalized title equals the title", () => {
    const queries = buildRadioSearchQueries("Artist", "Song");
    expect(queries).toEqual(["Artist Song", "Song Artist", "Song"]);
  });
});
