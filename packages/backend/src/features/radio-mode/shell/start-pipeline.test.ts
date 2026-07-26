/**
 * Radio Mode — Start pipeline (imperative shell) — integration-style tests
 *
 * Fakes only the network-touching LMS methods (search/play/addToQueue) on
 * top of a real `createLmsClient` instance, following this repo's shell-test
 * convention (see e.g. genre-radio/shell/route.integration.test.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { ok } from "@signalform/shared";
import type { AudioQuality } from "@signalform/shared";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import { resolvePlayableUrls, playAndQueue } from "./start-pipeline.js";
import type { StartPipelineDeps } from "./start-pipeline.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  search: vi
    .fn<LmsClient["search"]>()
    .mockResolvedValue(ok({ tracks: [], tidalAvailable: true })),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
});

const makeSearchResult = (
  overrides: Partial<SearchResult> = {},
): SearchResult => ({
  id: "1",
  title: "Track",
  artist: "Test Artist",
  album: "Album",
  url: "file:///track.flac",
  source: "local",
  type: "track",
  ...overrides,
});

const flacHiRes: AudioQuality = {
  format: "FLAC",
  bitrate: 4608,
  sampleRate: 96000,
  bitDepth: 24,
  lossless: true,
};

const mp3Low: AudioQuality = {
  format: "MP3",
  bitrate: 128,
  sampleRate: 44100,
  lossless: false,
};

describe("resolvePlayableUrls", () => {
  it("resolves candidates up to maxTracks, ignoring extras once the cap is hit", async () => {
    const mockLmsClient = createMockLmsClient();
    const urls = ["file:///a.flac", "file:///b.flac", "file:///c.flac"];
    let callCount = 0;
    mockLmsClient.search.mockImplementation(async () => {
      const url = urls[callCount] ?? urls[0]!;
      callCount++;
      return ok({
        tracks: [makeSearchResult({ url, artist: "Artist" })],
        tidalAvailable: true,
      });
    });
    const deps: StartPipelineDeps = { lmsClient: mockLmsClient };

    const result = await resolvePlayableUrls(
      deps,
      [
        { artist: "Artist", name: "Song A" },
        { artist: "Artist", name: "Song B" },
        { artist: "Artist", name: "Song C" },
      ],
      2,
    );

    expect(result.playableUrls).toEqual(["file:///a.flac", "file:///b.flac"]);
    // The third candidate is never even searched — the cap check runs before the LMS call.
    expect(mockLmsClient.search).toHaveBeenCalledTimes(2);
  });

  it("skips candidates whose LMS search results don't artist-match", async () => {
    const mockLmsClient = createMockLmsClient();
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult({ artist: "Someone Else" })],
        tidalAvailable: true,
      }),
    );
    const deps: StartPipelineDeps = { lmsClient: mockLmsClient };

    const result = await resolvePlayableUrls(
      deps,
      [{ artist: "Wanted Artist", name: "Song" }],
      8,
    );

    expect(result.playableUrls).toEqual([]);
  });

  it("skips a candidate if the best URL found is already in the accumulated list", async () => {
    const mockLmsClient = createMockLmsClient();
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [
          makeSearchResult({ url: "file:///dup.flac", artist: "Artist" }),
        ],
        tidalAvailable: true,
      }),
    );
    const deps: StartPipelineDeps = { lmsClient: mockLmsClient };

    const result = await resolvePlayableUrls(
      deps,
      [
        { artist: "Artist", name: "Song A" },
        { artist: "Artist", name: "Song B" },
      ],
      8,
    );

    expect(result.playableUrls).toEqual(["file:///dup.flac"]);
  });

  it("picks the higher-quality match when a candidate has multiple matching results (quality-aware selection)", async () => {
    const mockLmsClient = createMockLmsClient();
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [
          // Local source with poor quality — the old source-rank-only
          // pickBestResult would have chosen this (local > qobuz > tidal),
          // ignoring audio quality entirely.
          makeSearchResult({
            url: "file:///low-quality-local.mp3",
            artist: "Artist",
            source: "local",
            audioQuality: mp3Low,
          }),
          // Qobuz source with hi-res lossless quality — the quality-aware
          // selectBestTrackUrl must choose this one instead.
          makeSearchResult({
            url: "qobuz:///hires.flac",
            artist: "Artist",
            source: "qobuz",
            audioQuality: flacHiRes,
          }),
        ],
        tidalAvailable: true,
      }),
    );
    const deps: StartPipelineDeps = { lmsClient: mockLmsClient };

    const result = await resolvePlayableUrls(
      deps,
      [{ artist: "Artist", name: "Song" }],
      8,
    );

    expect(result.playableUrls).toEqual(["qobuz:///hires.flac"]);
  });

  it("returns an empty playableUrls array when there are zero matching candidates", async () => {
    const mockLmsClient = createMockLmsClient();
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );
    const deps: StartPipelineDeps = { lmsClient: mockLmsClient };

    const result = await resolvePlayableUrls(
      deps,
      [
        { artist: "Artist A", name: "Song A" },
        { artist: "Artist B", name: "Song B" },
      ],
      8,
    );

    expect(result.playableUrls).toEqual([]);
  });
});

describe("playAndQueue", () => {
  it("calls lmsClient.play with the first URL, then addToQueue for the rest in order", async () => {
    const mockLmsClient = createMockLmsClient();
    const deps: StartPipelineDeps = { lmsClient: mockLmsClient };

    await playAndQueue(deps, [
      "file:///first.flac",
      "file:///second.flac",
      "file:///third.flac",
    ]);

    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.play).toHaveBeenCalledWith("file:///first.flac");
    // addToQueue's own call order reflects the sequential reduce over the tail.
    expect(mockLmsClient.addToQueue.mock.calls).toEqual([
      ["file:///second.flac"],
      ["file:///third.flac"],
    ]);
    // play happens before any addToQueue call — not just "called at some point".
    const playOrder = mockLmsClient.play.mock.invocationCallOrder[0]!;
    const firstAddToQueueOrder =
      mockLmsClient.addToQueue.mock.invocationCallOrder[0]!;
    expect(playOrder).toBeLessThan(firstAddToQueueOrder);
  });
});
