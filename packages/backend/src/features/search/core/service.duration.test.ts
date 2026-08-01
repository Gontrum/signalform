/**
 * Duration propagation through deduplicateTracks.
 *
 * Kept out of service.test.ts (60 KB) so future duration cases do not force the
 * whole monolith into context.
 */

import { describe, it, expect } from "vitest";
import { deduplicateTracks } from "./service.js";
import type { SearchResult as LmsSearchResult } from "../../../adapters/lms-client/index.js";
import type { AudioQuality } from "@signalform/shared";

const hiResFlac: AudioQuality = {
  format: "FLAC",
  lossless: true,
  bitrate: 4608000,
  sampleRate: 96000,
  bitDepth: 24,
};

const lossyMp3: AudioQuality = {
  format: "MP3",
  lossless: false,
  bitrate: 320000,
  sampleRate: 44100,
  bitDepth: 16,
};

const track = (
  source: "local" | "qobuz" | "tidal",
  overrides: Partial<LmsSearchResult> = {},
): LmsSearchResult => ({
  id: `${source}-money`,
  title: "Money",
  artist: "Pink Floyd",
  album: "Dark Side of the Moon",
  url: `${source}://tracks/money`,
  source,
  type: "track",
  ...overrides,
});

describe("deduplicateTracks — duration", () => {
  it("keeps the duration of a single source", () => {
    const result = deduplicateTracks([track("local", { duration: 382 })]);

    expect(result[0]?.duration).toBe(382);
  });

  it("prefers the best source's duration over an earlier, worse source's", () => {
    // qobuz first, local second — a naive "first duration in group" would return 400.
    const result = deduplicateTracks([
      track("qobuz", { duration: 400 }),
      track("local", { duration: 382 }),
    ]);

    expect(result[0]?.source).toBe("local");
    expect(result[0]?.duration).toBe(382);
  });

  it("falls back to a duplicate's duration when the best source has none", () => {
    // Hi-res Tidal outranks the lossy local copy on quality, but Tidal browse
    // results carry no duration — the local duplicate's 382 s must survive.
    const result = deduplicateTracks([
      track("local", { duration: 382, audioQuality: lossyMp3 }),
      track("tidal", { audioQuality: hiResFlac }),
    ]);

    expect(result[0]?.source).toBe("tidal");
    expect(result[0]?.duration).toBe(382);
  });

  it("reports undefined when no source in the group has a duration", () => {
    const result = deduplicateTracks([track("tidal"), track("qobuz")]);

    expect(result[0]?.duration).toBeUndefined();
  });
});
