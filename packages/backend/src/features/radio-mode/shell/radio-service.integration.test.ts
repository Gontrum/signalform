/**
 * Radio Mode — Unit Tests (Story 6.4)
 *
 * Tests for the radio-service imperative shell.
 * All external dependencies are mocked.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { Server } from "socket.io";
import { ok } from "@signalform/shared";
import {
  createLmsClient,
  type LmsClient,
  type SearchResult,
} from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import type {
  ClientToServerEvents,
  QueueUpdatedPayload,
  RadioStartedPayload,
  ServerToClientEvents,
} from "@signalform/shared";
import { createRadioEngine } from "./radio-service.js";
import {
  getRadioQueueState,
  resetRadioRuntimeState,
  setRadioModeEnabledState,
  setRadioQueueEntries,
} from "./radio-state.js";
import {
  getQueueTrackRepeatKey,
  getQueueTrackSignature,
} from "../core/identity.js";

// --- Test helpers -----------------------------------------------------------

const makeSimilarTrack = (
  artist: string,
  name: string,
  match = 0.9,
): {
  readonly name: string;
  readonly artist: string;
  readonly mbid: string;
  readonly match: number;
  readonly duration: number;
  readonly url: string;
} => ({
  name,
  artist,
  mbid: "",
  match,
  duration: 240,
  url: `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(name)}`,
});

const makeLmsSearchResult = (
  artist: string,
  title: string,
  lossless = false,
  bitrate = lossless ? 1411000 : 320000,
): SearchResult => ({
  id: `${artist}-${title}`,
  title,
  artist,
  album: "Test Album",
  url: `file:///music/${encodeURIComponent(artist)}/${encodeURIComponent(title)}.${lossless ? "flac" : "mp3"}`,
  source: "local" as const,
  type: "track" as const,
  audioQuality: {
    format: lossless ? ("FLAC" as const) : ("MP3" as const),
    bitrate,
    sampleRate: 44100,
    lossless,
  },
});

// --- Fixtures ---------------------------------------------------------------

type LogFn = (msg: string, meta?: Readonly<Record<string, unknown>>) => void;

const mockLogger = {
  info: vi.fn<LogFn>(),
  warn: vi.fn<LogFn>(),
  error: vi.fn<LogFn>(),
};

const TEST_LMS_CONFIG = {
  host: "localhost",
  port: 9000,
  playerId: "player-1",
  timeout: 1000,
  retryBaseDelayMs: 0,
} as const;

type MockLastFmClient = LastFmClient & {
  readonly getSimilarTracks: ReturnType<
    typeof vi.fn<LastFmClient["getSimilarTracks"]>
  >;
  readonly getSimilarArtists: ReturnType<
    typeof vi.fn<LastFmClient["getSimilarArtists"]>
  >;
  readonly getArtistInfo: ReturnType<
    typeof vi.fn<LastFmClient["getArtistInfo"]>
  >;
  readonly getAlbumInfo: ReturnType<typeof vi.fn<LastFmClient["getAlbumInfo"]>>;
  readonly getCircuitState: ReturnType<
    typeof vi.fn<LastFmClient["getCircuitState"]>
  >;
};

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
  readonly getQueue: ReturnType<typeof vi.fn<LmsClient["getQueue"]>>;
  readonly getStatus: ReturnType<typeof vi.fn<LmsClient["getStatus"]>>;
  readonly removeFromQueue: ReturnType<
    typeof vi.fn<LmsClient["removeFromQueue"]>
  >;
  readonly resume: ReturnType<typeof vi.fn<LmsClient["resume"]>>;
  readonly nextTrack: ReturnType<typeof vi.fn<LmsClient["nextTrack"]>>;
};

type MockIo = {
  readonly io: TypedSocketIOServer;
  readonly emit: ReturnType<typeof vi.fn>;
  readonly to: ReturnType<typeof vi.fn>;
};

type TestFixtures = {
  readonly mockEmit: MockIo["emit"];
  readonly mockIo: MockIo;
  readonly mockLastFmClient: MockLastFmClient;
  readonly mockLmsClient: MockLmsClient;
};

const isRadioStartedCall = (
  call: readonly unknown[],
): call is readonly ["player.radio.started", RadioStartedPayload] => {
  return call[0] === "player.radio.started";
};

const isQueueUpdatedCall = (
  call: readonly unknown[],
): call is readonly ["player.queue.updated", QueueUpdatedPayload] => {
  return call[0] === "player.queue.updated";
};

const createMockLastFmClient = (): MockLastFmClient => ({
  getSimilarTracks: vi.fn<LastFmClient["getSimilarTracks"]>(),
  getSimilarArtists: vi.fn<LastFmClient["getSimilarArtists"]>(),
  getArtistInfo: vi.fn<LastFmClient["getArtistInfo"]>(),
  getAlbumInfo: vi.fn<LastFmClient["getAlbumInfo"]>(),
  getCircuitState: vi
    .fn<LastFmClient["getCircuitState"]>()
    .mockReturnValue("CLOSED"),
});

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
  search: vi.fn<LmsClient["search"]>(),
  addToQueue: vi.fn<LmsClient["addToQueue"]>(),
  getQueue: vi.fn<LmsClient["getQueue"]>().mockResolvedValue({
    ok: true,
    value: [],
  }),
  getStatus: vi.fn<LmsClient["getStatus"]>().mockResolvedValue({
    ok: true,
    value: {
      mode: "play",
      time: 120,
      duration: 240,
      volume: 50,
      currentTrack: null,
      queuePreview: [],
    },
  }),
  removeFromQueue: vi
    .fn<LmsClient["removeFromQueue"]>()
    .mockResolvedValue(ok(undefined)),
  resume: vi.fn<LmsClient["resume"]>().mockResolvedValue(ok(undefined)),
  nextTrack: vi.fn<LmsClient["nextTrack"]>().mockResolvedValue(ok(undefined)),
});

const createMockIo = (): MockIo => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>();
  const emit = vi.fn();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockImplementation((event, ...args) => {
    emit(event, ...args);
    return true;
  });
  const to = vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return {
    io,
    emit,
    to,
  };
};

const resetMockLastFmClient = (mockLastFmClient: MockLastFmClient): void => {
  mockLastFmClient.getSimilarTracks.mockReset();
  mockLastFmClient.getSimilarArtists.mockReset();
  mockLastFmClient.getArtistInfo.mockReset();
  mockLastFmClient.getAlbumInfo.mockReset();
  mockLastFmClient.getCircuitState.mockReset().mockReturnValue("CLOSED");
};

const resetMockLmsClient = (mockLmsClient: MockLmsClient): void => {
  mockLmsClient.search.mockReset();
  mockLmsClient.addToQueue.mockReset();
  mockLmsClient.getQueue.mockReset().mockResolvedValue({
    ok: true,
    value: [],
  });
  mockLmsClient.getStatus.mockReset().mockResolvedValue({
    ok: true,
    value: {
      mode: "play",
      time: 120,
      duration: 240,
      volume: 50,
      currentTrack: null,
      queuePreview: [],
    },
  });
  mockLmsClient.removeFromQueue.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.resume.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.nextTrack.mockReset().mockResolvedValue(ok(undefined));
};

const resetMockIo = (mockIo: MockIo): void => {
  mockIo.emit.mockReset();
  mockIo.to.mockClear();
};

const createFixtures = (): TestFixtures => {
  const mockIo = createMockIo();
  return {
    mockEmit: mockIo.emit,
    mockIo,
    mockLastFmClient: createMockLastFmClient(),
    mockLmsClient: createMockLmsClient(),
  };
};

const fixtures = createFixtures();

beforeEach(() => {
  vi.clearAllMocks();
  resetMockIo(fixtures.mockIo);
  resetMockLastFmClient(fixtures.mockLastFmClient);
  resetMockLmsClient(fixtures.mockLmsClient);
  resetRadioRuntimeState();
});
// --- 5.1: getSimilarTracks called with seed -----------------------------------

describe("5.1: handleQueueEnd calls getSimilarTracks(seedArtist, seedTitle, 50)", () => {
  test("calls getSimilarTracks with exact arguments", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [],
    });
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockLastFmClient.getSimilarTracks).toHaveBeenCalledOnce();
    expect(fixtures.mockLastFmClient.getSimilarTracks).toHaveBeenCalledWith(
      "Miles Davis",
      "Kind of Blue",
      50,
    );
  });
});

// --- 5.2: last.fm failure → no crash ----------------------------------------

describe("5.2: last.fm failure → logs warning, no crash, no queue modification", () => {
  test("network error: logs warn and returns early", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "Connection refused" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await expect(
      engine.handleQueueEnd("Miles Davis", "Kind of Blue"),
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.search).not.toHaveBeenCalled();
  });

  test("timeout error: logs warn and returns early", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: false,
      error: { type: "TimeoutError", message: "Request timed out" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await expect(
      engine.handleQueueEnd("Miles Davis", "Kind of Blue"),
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });
});

// --- 5.3: no candidates in LMS → no event emitted ----------------------------

describe("5.3: no candidates found in LMS → logs warning, no event emitted", () => {
  test("all LMS searches return empty → no radio.started event", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Artist", "Track")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      "player.radio.started",
      expect.anything(),
    );
  });

  test("falls back to alternate query shapes before giving up", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("The Hives", "Walk Idiot Walk")],
    });
    fixtures.mockLmsClient.search
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: [makeLmsSearchResult("The Hives", "Walk Idiot Walk", true)],
      });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockLmsClient.search).toHaveBeenNthCalledWith(
      1,
      "The Hives Walk Idiot Walk",
    );
    expect(fixtures.mockLmsClient.search).toHaveBeenNthCalledWith(
      2,
      "Walk Idiot Walk The Hives",
    );
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      "player.radio.started",
      expect.objectContaining({ tracksAdded: 1 }),
    );
  });
});

// --- 5.4: tracks added → player.radio.started emitted -----------------------

describe("5.4: tracks added → player.radio.started emitted with correct payload", () => {
  test("emits player.radio.started with playerId, seedTrack, tracksAdded, timestamp", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-42",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    const radioStartedCall =
      fixtures.mockEmit.mock.calls.find(isRadioStartedCall);
    expect(radioStartedCall).toBeDefined();
    const [, payload] = radioStartedCall!;
    expect(payload.playerId).toBe("player-42");
    expect(payload.seedTrack).toEqual({
      artist: "Miles Davis",
      title: "So What",
    });
    expect(payload.tracksAdded).toBe(1);
    expect(typeof payload.timestamp).toBe("number");
    expect(payload.timestamp).toBeGreaterThan(0);
  });
});

// --- 5.5: tracks added → player.queue.updated emitted -----------------------

describe("5.5: tracks added → player.queue.updated emitted", () => {
  test("emits player.queue.updated after adding tracks", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    // getQueue called three times: pre-radio, freshness re-check, post-radio refresh
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({ ok: true, value: [] }) // pre-radio: no prior tracks
      .mockResolvedValueOnce({ ok: true, value: [] }) // freshness check: still empty
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "1",
            position: 1,
            title: "Watermelon Man",
            artist: "Herbie Hancock",
            album: "Head Hunters",
            duration: 257,
            isCurrent: false,
          },
        ],
      }); // post-radio: updated queue

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();
    const [, payload] = queueUpdatedCall!;
    expect(payload.playerId).toBe("player-1");
    expect(Array.isArray(payload.tracks)).toBe(true);
    expect(typeof payload.timestamp).toBe("number");
    expect(payload.radioBoundaryIndex).toBe(0);
  });
});

// --- 5.6: best quality track selected -----------------------------------------

describe("5.6: best-quality track selected (lossless preferred over MP3)", () => {
  test("selects FLAC over MP3 when both are returned by LMS search", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Kind Artist", "Cool Track")],
    });

    const mp3Track = makeLmsSearchResult(
      "Kind Artist",
      "Cool Track",
      false,
      320000,
    );
    const flacTrack = makeLmsSearchResult(
      "Kind Artist",
      "Cool Track",
      true,
      1411000,
    );
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [mp3Track, flacTrack], // MP3 first, FLAC second
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // addToQueue should be called with the FLAC URL, not the MP3 URL
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      flacTrack.url,
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalledWith(
      mp3Track.url,
    );
  });

  test("selects higher sampleRate MP3 when no lossless available (score: sampleRate × format)", async () => {
    // Note: The quality scoring formula is (bitDepth ?? 1) × sampleRate × losslessFactor + formatBonus.
    // Bitrate is intentionally excluded (design decision in source-hierarchy service).
    // For lossy tracks, sampleRate and format determine the score.
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Kind Artist", "Cool Track")],
    });

    // Two MP3 tracks with different sampleRates — higher sampleRate wins via score formula
    const lowSampleRate = {
      id: "low-sr",
      title: "Cool Track",
      artist: "Kind Artist",
      album: "Test Album",
      url: "file:///music/Kind%20Artist/Cool%20Track-44khz.mp3",
      source: "local" as const,
      type: "track" as const,
      audioQuality: {
        format: "MP3" as const,
        bitrate: 320000,
        sampleRate: 44100,
        lossless: false,
      },
    };
    const highSampleRate = {
      id: "high-sr",
      title: "Cool Track",
      artist: "Kind Artist",
      album: "Test Album",
      url: "file:///music/Kind%20Artist/Cool%20Track-48khz.mp3",
      source: "local" as const,
      type: "track" as const,
      audioQuality: {
        format: "MP3" as const,
        bitrate: 128000,
        sampleRate: 48000, // higher sampleRate → higher score despite lower bitrate
        lossless: false,
      },
    };
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [lowSampleRate, highSampleRate],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // score(44100 MP3) = 1×44100×1+250 = 44350
    // score(48000 MP3) = 1×48000×1+250 = 48250 → 48kHz wins
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      highSampleRate.url,
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalledWith(
      lowSampleRate.url,
    );
  });
});

// --- NFR3: tracks added within 2 seconds (M2 code review) --------------------

describe("NFR3: handleQueueEnd completes within 2000ms", () => {
  test("executes with 50 candidates and 5 adds within 2000ms (unit — mocks resolve instantly)", async () => {
    // NFR3: up to 5 tracks must be added within 2 seconds.
    // With instant mocks this validates no algorithmic bottleneck (O(n) sequential reduce).
    // Real network-bound timing must be verified via integration tests against live LMS.
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: Array.from({ length: 50 }, (_, i) =>
        makeSimilarTrack(`Artist ${i}`, `Track ${i}`, 0.9 - i * 0.01),
      ),
    });
    // Return a result whose artist matches the candidate — artist-match check requires this.
    fixtures.mockLmsClient.search.mockImplementation(async (query: string) => ({
      ok: true,
      // Extract first two words as artist (candidates are "Artist N Track N")
      value: [
        makeLmsSearchResult(
          `${query.split(" ")[0]!} ${query.split(" ")[1]!}`,
          query.split(" ").slice(2).join(" ") || "Track",
        ),
      ],
    }));
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    const start = Date.now();
    await engine.handleQueueEnd("Miles Davis", "So What");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(5); // RADIO_BATCH_SIZE
  });
});

// --- artistMatches edge cases (M2/L3 fix: module-level, NFD Unicode normalization) ------------

describe("artistMatches edge cases (via handleQueueEnd)", () => {
  test("Unicode diacritics: 'Björk' candidate matches 'bjork' LMS result (NFD normalization)", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Björk", "Human Behaviour")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("bjork", "Human Behaviour", true)],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // NFD normalization: "Björk" (ö = o + \u0308) normalized to "bjork" matches "bjork"
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledOnce();
  });

  test("feat. suffix: 'Olivia Rodrigo' candidate matches 'Olivia Rodrigo feat. Rosalía' LMS result", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Olivia Rodrigo", "Good 4 U")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [
        makeLmsSearchResult("Olivia Rodrigo feat. Rosalía", "Good 4 U", true),
      ],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // Bidirectional includes: "olivia rodrigo feat. rosalia".includes("olivia rodrigo") → true
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledOnce();
  });
});

// --- Unexpected exception handling (C3 code review) --------------------------

describe("C3: Unexpected JS exception in handleQueueEnd does not propagate", () => {
  test("getSimilarTracks throws (not Result error) → logs error, resolves cleanly", async () => {
    // Validates top-level try/catch: handleQueueEnd is called with void() from status-poller.
    // An unhandled rejection would be fatal in Node.js 15+.
    fixtures.mockLastFmClient.getSimilarTracks.mockRejectedValue(
      new Error("Network socket destroyed unexpectedly"),
    );

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await expect(
      engine.handleQueueEnd("Miles Davis", "Kind of Blue"),
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Radio: unexpected error in replenish flow — radio aborted",
      expect.objectContaining({
        error: "Network socket destroyed unexpectedly",
        seedArtist: "Miles Davis",
        seedTitle: "Kind of Blue",
        trigger: "queue-end",
      }),
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });
});

// --- 6.5 AC2: queue-end stop advances into first radio track -----------------

describe("6.5 AC2: queue-end stop advances into first radio track", () => {
  test("nextTrack() called when getStatus() returns stop after queue-end radio adds tracks", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });
    fixtures.mockLmsClient.getStatus.mockResolvedValue({
      ok: true,
      value: {
        mode: "stop" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockLmsClient.nextTrack).toHaveBeenCalledOnce();
    expect(fixtures.mockLmsClient.resume).not.toHaveBeenCalled();
  });

  test("getStatus() failure — warn logged, nextTrack() not called", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });
    fixtures.mockLmsClient.getStatus.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "Connection refused" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockLmsClient.nextTrack).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.resume).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Radio: could not check player status for auto-resume — skipping",
      expect.objectContaining({ seedArtist: "Miles Davis" }),
    );
  });

  test("nextTrack() NOT called when getStatus() returns play", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });
    // getStatus already returns play (default beforeEach mock)

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockLmsClient.nextTrack).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.resume).not.toHaveBeenCalled();
  });
});

// --- 6.5 AC3: duplicate artist prevention in batch ---------------------------

describe("6.5 AC3: duplicate artist prevention — same artist skipped within one batch", () => {
  test("second candidate from same artist skips LMS search entirely", async () => {
    // Three candidates all from same artist → only first should reach lmsClient.search
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Herbie Hancock", "Watermelon Man", 0.9),
        makeSimilarTrack("Herbie Hancock", "Maiden Voyage", 0.8),
        makeSimilarTrack("Herbie Hancock", "Chameleon", 0.7),
      ],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    // Only 1 search — 2nd and 3rd candidates skipped before reaching LMS search
    expect(fixtures.mockLmsClient.search).toHaveBeenCalledTimes(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: skipping duplicate artist in batch — artist already queued in this batch",
      expect.objectContaining({
        artist: "Herbie Hancock",
        title: "Maiden Voyage",
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: skipping duplicate artist in batch — artist already queued in this batch",
      expect.objectContaining({ artist: "Herbie Hancock", title: "Chameleon" }),
    );
  });

  test("duplicate check is case-insensitive", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Herbie Hancock", "Watermelon Man", 0.9),
        makeSimilarTrack("herbie hancock", "Maiden Voyage", 0.8), // lowercase
      ],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockLmsClient.search).toHaveBeenCalledTimes(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
  });
});

// --- 5.7: diversity filter prevents same artist twice -------------------------

describe("5.7: diversity filter prevents same artist from appearing twice", () => {
  test("across two handleQueueEnd calls, same artist not added twice", async () => {
    // First call: add "Artist A"
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Artist A", "Track A")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Artist A", "Track A")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    // First trigger: adds Artist A to sliding window
    await engine.handleQueueEnd("Miles Davis", "So What");
    const firstAddCount = fixtures.mockLmsClient.addToQueue.mock.calls.length;
    expect(firstAddCount).toBe(1);

    // Second trigger: same Artist A offered → diversity filter should reject it
    vi.clearAllMocks();
    fixtures.mockEmit.mockClear();
    fixtures.mockIo.to.mockReset().mockReturnValue({
      emit: fixtures.mockEmit,
    });
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Artist A", "Another Track")], // same artist
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Artist A", "Another Track")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [],
    });

    await engine.handleQueueEnd("Herbie Hancock", "Watermelon Man");

    // Artist A is in the sliding window — diversity filter should prevent re-adding
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });
});

// --- 6.6 AC1: selectBestSource() selects by score (sampleRate×bitDepth wins over raw bitrate) ---

describe("6.6 AC1: selectBestSource() score formula — 24/96 FLAC wins over 16/44.1 FLAC even with lower bitrate", () => {
  test("FLAC 24/96 selected over FLAC 16/44.1 when 16/44.1 has higher bitrate", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Artist", "Track")],
    });

    // 16/44.1 FLAC with artificially high bitrate — wins with old reduce() logic
    const flac1644 = {
      id: "flac-1644",
      title: "Track",
      artist: "Artist",
      album: "Album",
      url: "file:///music/track-1644.flac",
      source: "local" as const,
      type: "track" as const,
      audioQuality: {
        format: "FLAC" as const,
        bitrate: 5000000, // higher raw bitrate
        sampleRate: 44100,
        bitDepth: 16,
        lossless: true,
      },
    };

    // 24/96 FLAC with lower bitrate — wins with selectBestSource score formula
    // score = 24 × 96000 × 10 + 1000 = 23,041,000 (vs 16 × 44100 × 10 + 1000 = 7,057,000)
    const flac2496 = {
      id: "flac-2496",
      title: "Track",
      artist: "Artist",
      album: "Album",
      url: "file:///music/track-2496.flac",
      source: "local" as const,
      type: "track" as const,
      audioQuality: {
        format: "FLAC" as const,
        bitrate: 2000000, // lower raw bitrate but superior quality
        sampleRate: 96000,
        bitDepth: 24,
        lossless: true,
      },
    };

    // 16/44.1 first so old reduce() would pick it (higher bitrate = wins reduce)
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [flac1644, flac2496],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // selectBestSource score: 24×96000×10+1000=23,041,000 > 16×44100×10+1000=7,057,000
    // → 24/96 FLAC wins. Old reduce() would pick 16/44.1 (higher bitrate 5000000 > 2000000).
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      flac2496.url,
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalledWith(
      flac1644.url,
    );
  });
});

// --- 6.6 AC3: tie-breaking — local wins over Qobuz for equal quality score ---

describe("6.6 AC3: tie-breaking — local source wins over Qobuz when quality score is equal", () => {
  test("local URL selected over Qobuz URL for identical FLAC quality", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Artist", "Track")],
    });

    const qobuzTrack = {
      id: "qobuz-1",
      title: "Track",
      artist: "Artist",
      album: "Album",
      url: "qobuz://track/123",
      source: "qobuz" as const,
      type: "track" as const,
      audioQuality: {
        format: "FLAC" as const,
        bitrate: 1411000,
        sampleRate: 44100,
        lossless: true,
      },
    };
    const localTrack = {
      id: "local-1",
      title: "Track",
      artist: "Artist",
      album: "Album",
      url: "file:///music/track.flac",
      source: "local" as const,
      type: "track" as const,
      audioQuality: {
        format: "FLAC" as const,
        bitrate: 1411000,
        sampleRate: 44100,
        lossless: true,
      },
    };

    // Qobuz first — old reduce() would return qobuz (equal bitrate → keeps first/best)
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [qobuzTrack, localTrack],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // selectBestSource tie-breaks: local > Qobuz → local URL selected
    // Old reduce() returns best=qobuz (first element, equal bitrate keeps best)
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      localTrack.url,
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalledWith(
      qobuzTrack.url,
    );
  });
});

// --- 6.7 AC5: player.queue.updated emitted with radioBoundaryIndex: 0 -----------

describe("6.7 AC5: player.queue.updated emitted with radioBoundaryIndex: 0 after radio adds tracks to empty queue", () => {
  test("radioBoundaryIndex: 0 present in player.queue.updated payload", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    // getQueue called three times: pre-radio, freshness re-check, post-radio refresh
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({ ok: true, value: [] }) // pre-radio: empty
      .mockResolvedValueOnce({ ok: true, value: [] }) // freshness check: still empty
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "1",
            position: 1,
            title: "Watermelon Man",
            artist: "Herbie Hancock",
            album: "Head Hunters",
            duration: 257,
            isCurrent: false,
          },
        ],
      }); // post-radio

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        radioBoundaryIndex: 0,
      }),
    );
  });
});

// --- 6.7 AC5b: radioBoundaryIndex reflects pre-radio queue length (non-empty queue) ---

describe("6.7 AC5b: radioBoundaryIndex equals pre-radio queue length when queue had prior tracks", () => {
  test("radioBoundaryIndex: 2 when 2 user tracks existed before radio added tracks", async () => {
    // Reproduces the real bug: LMS keeps played tracks in queue after mode→stop.
    // Pre-radio queue has 2 tracks (e.g. "1000 Liter" + "Alte Lieder" already played).
    // Radio adds 1 track → boundary must be at index 2, not 0.
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    // pre-radio: 2 existing tracks (already played, still in LMS queue)
    // post-radio: same 2 + 1 newly added radio track
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "prev-1",
            position: 1,
            title: "1000 Liter",
            artist: "Verlorene Jungs",
            album: "Album",
            duration: 200,
            isCurrent: false,
          },
          {
            id: "prev-2",
            position: 2,
            title: "Alte Lieder",
            artist: "Verlorene Jungs",
            album: "Album",
            duration: 210,
            isCurrent: false,
          },
        ],
      }) // pre-radio: 2 prior tracks
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "prev-1",
            position: 1,
            title: "1000 Liter",
            artist: "Verlorene Jungs",
            album: "Album",
            duration: 200,
            isCurrent: false,
          },
          {
            id: "prev-2",
            position: 2,
            title: "Alte Lieder",
            artist: "Verlorene Jungs",
            album: "Album",
            duration: 210,
            isCurrent: false,
          },
        ],
      }) // freshness check: queue unchanged before radio adds
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "prev-1",
            position: 1,
            title: "1000 Liter",
            artist: "Verlorene Jungs",
            album: "Album",
            duration: 200,
            isCurrent: false,
          },
          {
            id: "prev-2",
            position: 2,
            title: "Alte Lieder",
            artist: "Verlorene Jungs",
            album: "Album",
            duration: 210,
            isCurrent: false,
          },
          {
            id: "radio-1",
            position: 3,
            title: "Watermelon Man",
            artist: "Herbie Hancock",
            album: "Head Hunters",
            duration: 257,
            isCurrent: false,
          },
        ],
      }); // post-radio: 2 prior + 1 radio

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Verlorene Jungs", "Alte Lieder");

    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        radioBoundaryIndex: 2, // boundary after the 2 pre-existing tracks
      }),
    );
  });
});

// --- 6.6 AC6: fallback — track still added when all results lack audioQuality ---

describe("6.6 AC6: fallback — addToQueue called even when all search results have no audioQuality", () => {
  test("track added via fallback when audioQuality is undefined on all results", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Artist", "Track")],
    });

    const trackNoQuality = {
      id: "no-quality",
      title: "Track",
      artist: "Artist",
      album: "Album",
      url: "file:///music/track.flac",
      source: "local" as const,
      type: "track" as const,
      audioQuality: undefined,
    };

    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [trackNoQuality],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // Even without quality data, track must be added (fallback picks first/only result)
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      trackNoQuality.url,
    );
  });
});

// --- 6.8 AC3: CircuitOpenError → emit player.radio.unavailable ---------------

describe("6.8 AC3: CircuitOpenError from getSimilarTracks → player.radio.unavailable emitted", () => {
  test("emits player.radio.unavailable when getSimilarTracks returns CircuitOpenError", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: false,
      error: { type: "CircuitOpenError", message: "Circuit breaker is open" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-42",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    expect(fixtures.mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      "player.radio.unavailable",
      expect.objectContaining({
        playerId: "player-42",
        message: "Radio mode temporarily unavailable",
        timestamp: expect.any(Number),
      }),
    );
    // Radio aborts — no LMS calls
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.search).not.toHaveBeenCalled();
  });

  test("non-CB error (NetworkError) does NOT emit player.radio.unavailable", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "Connection refused" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "Kind of Blue");

    // warn logged (existing behavior), but NOT player.radio.unavailable
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Radio: last.fm fetch failed — radio aborted",
      expect.anything(),
    );
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      "player.radio.unavailable",
      expect.anything(),
    );
  });
});

// --- 9.17 AC4: intra-batch artist dedup — max 1 track per artist per batch ---

describe("9.17 AC4: intra-batch artist dedup — only 1 track per artist in a single radio batch", () => {
  test("when last.fm returns 3 candidates from same artist, only 1 is added to queue", async () => {
    // last.fm gives 3 candidates all by "Adele" + 1 by "Elton John"
    const candidates = [
      makeSimilarTrack("Adele", "Hello"),
      makeSimilarTrack("Adele", "Rolling in the Deep"),
      makeSimilarTrack("Adele", "Someone Like You"),
      makeSimilarTrack("Elton John", "Rocket Man"),
    ];

    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: candidates,
    });

    fixtures.mockLmsClient.search.mockImplementation(async (query: string) => {
      const artist = query.split(" ")[0]!;
      const title = query.split(" ").slice(1).join(" ") || "Track";
      return { ok: true, value: [makeLmsSearchResult(artist, title)] };
    });

    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "seed-artist",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // Only 1 Adele track should be added (not 3), plus 1 Elton John = 2 total
    const addCalls = fixtures.mockLmsClient.addToQueue.mock.calls.map(
      ([url]) => url,
    );
    const adeleAdded = addCalls.filter((url) =>
      url.toLowerCase().includes("adele"),
    );
    expect(adeleAdded).toHaveLength(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
  });

  test("collaboration variant 'Adele feat. James Brown' treated as same artist as 'Adele'", async () => {
    // last.fm can return both "Adele" and "Adele feat. James Brown" as separate candidates.
    // artistMatches() must prevent both from landing in the same batch.
    const candidates = [
      makeSimilarTrack("Adele", "Hello"),
      makeSimilarTrack("Adele feat. James Brown", "Mash-Up"),
      makeSimilarTrack("Elton John", "Rocket Man"),
    ];

    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: candidates,
    });

    fixtures.mockLmsClient.search.mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes("adele feat")) {
        return {
          ok: true,
          value: [makeLmsSearchResult("Adele feat. James Brown", "Mash-Up")],
        };
      }
      const artist = query.split(" ")[0]!;
      const title = query.split(" ").slice(1).join(" ") || "Track";
      return { ok: true, value: [makeLmsSearchResult(artist, title)] };
    });

    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "seed-artist",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // Only 1 Adele track (not 2) + 1 Elton John = 2 total
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
  });
});

// C.1: URL-dedup — different last.fm candidates that resolve to the same LMS file
describe("intra-batch URL deduplication — same file URL not added twice", () => {
  test("when two candidates resolve to the same LMS URL, only the first is added", async () => {
    const sharedUrl = "file:///music/Radiohead/Creep.flac";

    // Two candidates from different artists — each would pass artist-dedup independently.
    // But both happen to resolve to the exact same file on disk (e.g. a compilation track
    // that appears under two different artist tags in LMS).
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Radiohead", "Creep"),
        makeSimilarTrack("Thom Yorke", "Creep"), // different artist, same track file
      ],
    });

    // Both search calls return results pointing to the same physical URL.
    // The artists in the results match their respective candidates.
    fixtures.mockLmsClient.search.mockImplementation(
      async (
        query: string,
      ): Promise<{
        readonly ok: true;
        readonly value: readonly SearchResult[];
      }> => {
        const isThomYorke = query.toLowerCase().includes("thom");
        return {
          ok: true,
          value: [
            {
              ...makeLmsSearchResult(
                isThomYorke ? "Thom Yorke" : "Radiohead",
                "Creep",
                true,
              ),
              url: sharedUrl,
            },
          ],
        };
      },
    );

    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue.mockResolvedValue({ ok: true, value: [] });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // Only the first candidate's URL should be added — the duplicate must be skipped
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(sharedUrl);

    // The duplicate-URL skip must be logged as a warning
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Radio: skipping duplicate URL — track already in queue batch",
      expect.objectContaining({ event: "radio.duplicate_url_skipped" }),
    );
  });
});

describe("recent queue repeat protection", () => {
  test("skips a candidate when the same URL is already in the queue even if queue metadata is incomplete", async () => {
    const duplicateUrl = "tidal://58990486.flc";

    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Radiohead", "Creep"),
        makeSimilarTrack("Beck", "Loser"),
      ],
    });

    fixtures.mockLmsClient.search.mockImplementation(
      async (
        query,
      ): Promise<{
        readonly ok: true;
        readonly value: readonly SearchResult[];
      }> => {
        if (query.toLowerCase().includes("radiohead")) {
          return {
            ok: true,
            value: [
              {
                ...makeLmsSearchResult("Radiohead", "Creep"),
                url: duplicateUrl,
                source: "tidal",
              },
            ],
          };
        }

        return {
          ok: true,
          value: [makeLmsSearchResult("Beck", "Loser")],
        };
      },
    );

    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "queue-1",
          position: 1,
          title: "Creep",
          artist: "",
          album: "Pablo Honey",
          duration: 239,
          isCurrent: true,
          source: "tidal",
          url: duplicateUrl,
        },
      ],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Nirvana", "Come as You Are");

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      "file:///music/Beck/Loser.mp3",
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalledWith(
      duplicateUrl,
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: skipping recent duplicate track",
      expect.objectContaining({
        event: "radio.recent_duplicate_skipped",
        artist: "Radiohead",
        title: "Creep",
      }),
    );
  });

  test("skips a candidate when the same artist and title already appear in the recent queue tail", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Stacey Q", "Two of Hearts"),
        makeSimilarTrack("Whitney Houston", "How Will I Know"),
      ],
    });

    fixtures.mockLmsClient.search.mockImplementation(
      async (
        query,
      ): Promise<{
        readonly ok: true;
        readonly value: readonly SearchResult[];
      }> => {
        if (query.toLowerCase().includes("stacey q")) {
          return {
            ok: true,
            value: [makeLmsSearchResult("Stacey Q", "Two of Hearts")],
          };
        }

        return {
          ok: true,
          value: [makeLmsSearchResult("Whitney Houston", "How Will I Know")],
        };
      },
    );

    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "queue-1",
          position: 1,
          title: "Two of Hearts",
          artist: "Stacey Q",
          album: "Better Than Heaven",
          duration: 240,
          isCurrent: true,
          source: "tidal",
        },
      ],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Madonna", "Vogue");

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      "file:///music/Whitney%20Houston/How%20Will%20I%20Know.mp3",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: skipping recent duplicate track",
      expect.objectContaining({
        event: "radio.recent_duplicate_skipped",
        artist: "Stacey Q",
        title: "Two of Hearts",
      }),
    );
  });

  test("skips a candidate when the same artist and title already exist earlier in the queue", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Stacey Q", "Two of Hearts"),
        makeSimilarTrack("Whitney Houston", "How Will I Know"),
      ],
    });

    fixtures.mockLmsClient.search.mockImplementation(
      async (
        query,
      ): Promise<{
        readonly ok: true;
        readonly value: readonly SearchResult[];
      }> => {
        if (query.toLowerCase().includes("stacey q")) {
          return {
            ok: true,
            value: [makeLmsSearchResult("Stacey Q", "Two of Hearts")],
          };
        }

        return {
          ok: true,
          value: [makeLmsSearchResult("Whitney Houston", "How Will I Know")],
        };
      },
    );

    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "queue-1",
          position: 1,
          title: "Two of Hearts",
          artist: "Stacey Q",
          album: "Better Than Heaven",
          duration: 240,
          isCurrent: false,
          source: "tidal",
        },
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `queue-tail-${index + 2}`,
          position: index + 2,
          title: `Tail Track ${index + 1}`,
          artist: `Tail Artist ${index + 1}`,
          album: "Tail Album",
          duration: 200,
          isCurrent: index === 9,
          source: "tidal" as const,
        })),
      ],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("Madonna", "Vogue");

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledWith(
      "file:///music/Whitney%20Houston/How%20Will%20I%20Know.mp3",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: skipping recent duplicate track",
      expect.objectContaining({
        event: "radio.recent_duplicate_skipped",
        artist: "Stacey Q",
        title: "Two of Hearts",
      }),
    );
  });
});

// --- M3 concurrency guard: second handleQueueEnd call dropped while first in progress ---

describe("M3 concurrency guard: second handleQueueEnd call dropped while first is in progress", () => {
  test("concurrent trigger logs info and returns without calling getSimilarTracks again", async () => {
    // isProcessing=true is set synchronously before the first await in handleQueueEnd.
    // JS await always suspends (even for already-resolved promises), so calling
    // handleQueueEnd twice in sequence guarantees the second sees isProcessing=true.
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "aborted for test" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    // First call: sets isProcessing=true synchronously before first await point
    const first = engine.handleQueueEnd("Miles Davis", "So What");
    // Second call: isProcessing=true → dropped immediately (before reaching getSimilarTracks)
    const second = engine.handleQueueEnd("John Coltrane", "A Love Supreme");

    await Promise.all([first, second]);

    // getSimilarTracks called only once — second call was dropped before reaching it
    expect(fixtures.mockLastFmClient.getSimilarTracks).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: replenish skipped — radio operation already in progress",
      expect.objectContaining({
        seedArtist: "John Coltrane",
        trigger: "queue-end",
      }),
    );
  });
});

describe("queue-remove replenish flow", () => {
  test("handleQueueEnd skips stale replenish when the queue is refilled before radio adds tracks", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("The Police", "Message in a Bottle")],
    });
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "Drowned World",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 300,
            isCurrent: true,
          },
          {
            id: "user-2",
            position: 2,
            title: "Ray of Light",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 320,
            isCurrent: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "Drowned World",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 300,
            isCurrent: true,
          },
          {
            id: "user-2",
            position: 2,
            title: "Ray of Light",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 320,
            isCurrent: false,
          },
          {
            id: "user-3",
            position: 3,
            title: "Skin",
            artist: "Madonna",
            album: "Veronica Electronica",
            duration: 319,
            isCurrent: false,
          },
        ],
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    const result = await engine.handleQueueEnd("Madonna", "Ray of Light");

    expect(result).toBeUndefined();
    expect(fixtures.mockLmsClient.search).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      "player.queue.updated",
      expect.anything(),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: queue-end replenish skipped because queue was refilled",
      expect.objectContaining({
        event: "radio.queue_refilled_before_replenish",
        preRadioQueueLength: 2,
        refreshedQueueLength: 3,
      }),
    );
  });

  test("handleQueueEnd marks only the explicitly added radio track when manual tracks appear before the post-refresh", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("The Police", "Message in a Bottle")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("The Police", "Message in a Bottle")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "Drowned World",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 300,
            isCurrent: true,
          },
          {
            id: "user-2",
            position: 2,
            title: "Ray of Light",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 320,
            isCurrent: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "Drowned World",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 300,
            isCurrent: true,
          },
          {
            id: "user-2",
            position: 2,
            title: "Ray of Light",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 320,
            isCurrent: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "Drowned World",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 300,
            isCurrent: true,
          },
          {
            id: "user-2",
            position: 2,
            title: "Ray of Light",
            artist: "Madonna",
            album: "Ray of Light",
            duration: 320,
            isCurrent: false,
          },
          {
            id: "user-3",
            position: 3,
            title: "Skin",
            artist: "Madonna",
            album: "Veronica Electronica",
            duration: 319,
            isCurrent: false,
          },
          {
            id: "user-4",
            position: 4,
            title: "Nothing Really Matters",
            artist: "Madonna",
            album: "Veronica Electronica",
            duration: 314,
            isCurrent: false,
          },
          {
            id: "radio-5",
            position: 5,
            title: "Message in a Bottle",
            artist: "The Police",
            album: "Reggatta de Blanc",
            duration: 251,
            isCurrent: false,
            source: "tidal",
          },
        ],
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    await engine.handleQueueEnd("A-ha", "Take on Me");

    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();

    const [, payload] = queueUpdatedCall!;
    expect(
      payload.tracks.map(
        (track: (typeof payload.tracks)[number]) => track.addedBy,
      ),
    ).toEqual(["user", "user", "user", "user", "radio"]);
    expect(payload.radioBoundaryIndex).toBe(4);
  });

  test("replenishAfterRemoval adds one replacement track, emits queue update, and skips radio.started", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [
        makeSimilarTrack("Herbie Hancock", "Watermelon Man"),
        makeSimilarTrack("The Hives", "Enough Is Enough"),
        makeSimilarTrack("The Sounds", "Painted By Numbers"),
      ],
    });

    fixtures.mockLmsClient.search.mockImplementation(async (query: string) => {
      if (query.includes("Watermelon Man")) {
        return ok([makeLmsSearchResult("Herbie Hancock", "Watermelon Man")]);
      }
      if (query.includes("Enough Is Enough")) {
        return ok([makeLmsSearchResult("The Hives", "Enough Is Enough")]);
      }
      return ok([makeLmsSearchResult("The Sounds", "Painted By Numbers")]);
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "User Track",
            artist: "User Artist",
            album: "User Album",
            duration: 200,
            isCurrent: true,
          },
          {
            id: "radio-1",
            position: 2,
            title: "Old Radio Track",
            artist: "Old Artist",
            album: "Old Album",
            duration: 210,
            isCurrent: false,
            source: "tidal",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "User Track",
            artist: "User Artist",
            album: "User Album",
            duration: 200,
            isCurrent: true,
          },
          {
            id: "radio-2",
            position: 2,
            title: "Watermelon Man",
            artist: "Herbie Hancock",
            album: "Head Hunters",
            duration: 257,
            isCurrent: false,
            source: "tidal",
          },
        ],
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    const result = await engine.replenishAfterRemoval(
      "Seed Artist",
      "Seed Track",
    );

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "success",
      tracksAdded: 1,
    });
    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        playerId: "player-1",
        radioBoundaryIndex: 1,
      }),
    );
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      "player.radio.started",
      expect.anything(),
    );
  });

  test("replenishAfterRemoval succeeds and emits queue.updated with correct radioBoundaryIndex", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Fresh Artist", "Fresh Track")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Fresh Artist", "Fresh Track")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "User Track",
            artist: "User Artist",
            album: "User Album",
            duration: 200,
            isCurrent: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "user-1",
            position: 1,
            title: "User Track",
            artist: "User Artist",
            album: "User Album",
            duration: 200,
            isCurrent: true,
          },
          {
            id: "radio-2",
            position: 2,
            title: "Fresh Track",
            artist: "Fresh Artist",
            album: "Fresh Album",
            duration: 215,
            isCurrent: false,
          },
        ],
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    const result = await engine.replenishAfterRemoval(
      "Radio Artist",
      "Removed Radio Track",
    );

    expect(result).toMatchObject({
      status: "success",
      tracksAdded: 1,
    });
    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        radioBoundaryIndex: 1,
        playerId: "player-1",
      }),
    );
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      "player.radio.started",
      expect.anything(),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio replenish succeeded",
      expect.objectContaining({
        trigger: "queue-remove",
        radioBoundaryIndex: 1,
      }),
    );
  });

  test("replenishAfterRemoval keeps the surviving duplicate user track unmarked when a matching radio track remains", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Madonna", "Vogue")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Madonna", "Vogue")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "duplicate-track",
            position: 1,
            title: "Two of Hearts",
            artist: "Stacey Q",
            album: "Better Than Heaven",
            duration: 240,
            isCurrent: true,
            source: "tidal",
          },
          {
            id: "duplicate-track",
            position: 2,
            title: "Two of Hearts",
            artist: "Stacey Q",
            album: "Better Than Heaven",
            duration: 240,
            isCurrent: false,
            source: "tidal",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "duplicate-track",
            position: 1,
            title: "Two of Hearts",
            artist: "Stacey Q",
            album: "Better Than Heaven",
            duration: 240,
            isCurrent: true,
            source: "tidal",
          },
          {
            id: "duplicate-track",
            position: 2,
            title: "Two of Hearts",
            artist: "Stacey Q",
            album: "Better Than Heaven",
            duration: 240,
            isCurrent: false,
            source: "tidal",
          },
          {
            id: "radio-2",
            position: 3,
            title: "Vogue",
            artist: "Madonna",
            album: "Test Album",
            duration: 240,
            isCurrent: false,
            source: "local",
          },
        ],
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    setRadioQueueEntries([
      {
        position: 2,
        repeatKey: getQueueTrackRepeatKey({
          title: "Two of Hearts",
          artist: "Stacey Q",
        }),
        signature: getQueueTrackSignature({
          id: "duplicate-track",
          position: 2,
          title: "Two of Hearts",
          artist: "Stacey Q",
          album: "Better Than Heaven",
          duration: 240,
          isCurrent: false,
          source: "tidal",
          addedBy: "radio",
        }),
      },
    ]);

    await engine.replenishAfterRemoval("Stacey Q", "Two of Hearts");

    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();

    const [, payload] = queueUpdatedCall!;
    expect(
      payload.tracks.map(
        (track: (typeof payload.tracks)[number]) => track.addedBy,
      ),
    ).toEqual(["user", "radio", "radio"]);
    expect(payload.radioBoundaryIndex).toBe(1);
  });

  test("replenishAfterRemoval returns failed when post-add queue refresh returns NetworkError", async () => {
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Fresh Artist", "Fresh Track")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Fresh Artist", "Fresh Track")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: false,
        error: { type: "NetworkError", message: "queue refresh failed" },
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    const result = await engine.replenishAfterRemoval(
      "Radio Artist",
      "Removed Radio Track",
    );

    expect(result).toEqual({
      status: "failed",
      reason: "queue-fetch-failed",
      error: "queue refresh failed",
    });
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      "player.queue.updated",
      expect.anything(),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Radio: could not fetch updated queue — replenish failed after add",
      expect.objectContaining({
        trigger: "queue-remove",
      }),
    );
  });
});

// ── Edge Cases: busy state, concurrent triggers, state reset ───────────────

describe("busy state cleared after failure", () => {
  test("isProcessing is cleared even when getSimilarTracks rejects with an exception", async () => {
    // Simulate an unexpected error (not a Result err, but a thrown exception)
    fixtures.mockLastFmClient.getSimilarTracks.mockRejectedValue(
      new Error("Unexpected network timeout"),
    );

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    // First call: throws, but isProcessing should be cleared in finally block.
    // handleQueueEnd returns void — verify it completes without throwing.
    await engine.handleQueueEnd("Miles Davis", "So What");

    // The error should have been logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Radio: unexpected error"),
      expect.any(Object),
    );

    // Second call: should NOT be blocked by isProcessing=true.
    // If isProcessing was stuck, getSimilarTracks would NOT be called again.
    fixtures.mockLastFmClient.getSimilarTracks.mockResolvedValue({
      ok: true,
      value: [makeSimilarTrack("Herbie Hancock", "Cantaloupe Island")],
    });
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Herbie Hancock", "Cantaloupe Island")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    await engine.handleQueueEnd("Miles Davis", "So What");

    // getSimilarTracks called twice proves isProcessing was cleared after the first failure
    expect(fixtures.mockLastFmClient.getSimilarTracks).toHaveBeenCalledTimes(2);
  });
});

describe("replenishAfterRemoval vs handleQueueEnd concurrency", () => {
  test("handleQueueEnd is dropped when replenishAfterRemoval is in progress", async () => {
    // replenishAfterRemoval uses the same isProcessing guard
    fixtures.mockLastFmClient.getSimilarTracks.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                value: [makeSimilarTrack("Wayne Shorter", "Footprints")],
              }),
            50,
          );
        }),
    );
    fixtures.mockLmsClient.search.mockResolvedValue({
      ok: true,
      value: [makeLmsSearchResult("Wayne Shorter", "Footprints")],
    });
    fixtures.mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    // Start replenishAfterRemoval (acquires isProcessing synchronously)
    const removalPromise = engine.replenishAfterRemoval(
      "Miles Davis",
      "So What",
    );

    // While that is in progress, fire handleQueueEnd — should be dropped.
    // handleQueueEnd returns void, so we verify via logger and getSimilarTracks call count.
    await engine.handleQueueEnd("John Coltrane", "A Love Supreme");

    await removalPromise;

    // The dropped handleQueueEnd should have logged the "already in progress" message
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: replenish skipped — radio operation already in progress",
      expect.objectContaining({
        seedArtist: "John Coltrane",
        trigger: "queue-end",
      }),
    );

    // getSimilarTracks called only once (by replenishAfterRemoval, not by handleQueueEnd)
    expect(fixtures.mockLastFmClient.getSimilarTracks).toHaveBeenCalledOnce();
  });
});

describe("resetRadioRuntimeState clears radioBoundaryIndex", () => {
  test("radioBoundaryIndex is null after reset", async () => {
    const {
      getRadioQueueState,
      setRadioBoundaryIndex,
      resetRadioRuntimeState,
    } = await import("./radio-state.js");

    // Set a non-null boundary
    setRadioBoundaryIndex(5);
    expect(getRadioQueueState().radioBoundaryIndex).toBe(5);

    // Reset should clear it
    resetRadioRuntimeState();
    expect(getRadioQueueState().radioBoundaryIndex).toBeNull();
    expect(getRadioQueueState().isProcessing).toBe(false);
    expect(getRadioQueueState().recentArtists).toEqual([]);
  });
});

describe("radio mode lifecycle", () => {
  test("handleQueueEnd skips replenishment while radio mode is disabled", async () => {
    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );
    setRadioModeEnabledState(false);

    await engine.handleQueueEnd("Miles Davis", "So What");

    expect(fixtures.mockLastFmClient.getSimilarTracks).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: queue-end trigger ignored because radio mode is disabled",
      expect.objectContaining({
        event: "radio.queue_end_skipped_disabled",
      }),
    );
  });

  test("setModeEnabled(false) cancels an in-flight replenish before it can add tracks", async () => {
    let resolveSimilarTracks:
      | ((value: Awaited<ReturnType<LastFmClient["getSimilarTracks"]>>) => void)
      | undefined;

    fixtures.mockLastFmClient.getSimilarTracks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSimilarTracks = resolve;
        }),
    );
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "user-1",
          position: 1,
          title: "So What",
          artist: "Miles Davis",
          album: "Kind of Blue",
          duration: 560,
          isCurrent: true,
        },
      ],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );

    const replenishPromise = engine.handleQueueEnd("Miles Davis", "So What");

    const disableResult = await engine.setModeEnabled(false);

    expect(disableResult).toEqual(
      expect.objectContaining({
        status: "success",
      }),
    );
    expect(getRadioQueueState().isEnabled).toBe(false);

    resolveSimilarTracks?.({
      ok: true,
      value: [makeSimilarTrack("Wayne Shorter", "Footprints")],
    });
    await replenishPromise;

    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
    expect(
      fixtures.mockEmit.mock.calls.filter(isQueueUpdatedCall),
    ).toHaveLength(1);
    expect(fixtures.mockEmit.mock.calls.some(isRadioStartedCall)).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio: replenish aborted because radio mode was disabled",
      expect.objectContaining({
        event: "radio.replenish_aborted_disabled",
        trigger: "queue-end",
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Radio mode toggled",
      expect.objectContaining({
        event: "radio.disabled_during_replenish",
        enabled: false,
      }),
    );
  });

  test("setModeEnabled(false) removes upcoming radio tracks and emits inactive queue snapshot", async () => {
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "radio-current",
            position: 1,
            title: "Current Radio",
            artist: "Radio Artist",
            album: "Radio Album",
            duration: 180,
            isCurrent: true,
            source: "tidal",
          },
          {
            id: "radio-next",
            position: 2,
            title: "Next Radio",
            artist: "Radio Artist",
            album: "Radio Album",
            duration: 180,
            isCurrent: false,
            source: "tidal",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "radio-current",
            position: 1,
            title: "Current Radio",
            artist: "Radio Artist",
            album: "Radio Album",
            duration: 180,
            isCurrent: true,
            source: "tidal",
          },
        ],
      });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );
    setRadioQueueEntries([
      {
        position: 1,
        repeatKey: getQueueTrackRepeatKey({
          title: "Current Radio",
          artist: "Radio Artist",
        }),
        signature: getQueueTrackSignature({
          id: "radio-current",
          position: 1,
          title: "Current Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: true,
          addedBy: "radio",
          source: "tidal",
        }),
      },
      {
        position: 2,
        repeatKey: getQueueTrackRepeatKey({
          title: "Next Radio",
          artist: "Radio Artist",
        }),
        signature: getQueueTrackSignature({
          id: "radio-next",
          position: 2,
          title: "Next Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: false,
          addedBy: "radio",
          source: "tidal",
        }),
      },
    ]);

    const result = await engine.setModeEnabled(false);

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
      }),
    );
    expect(fixtures.mockLmsClient.removeFromQueue).toHaveBeenCalledWith(1);

    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();
    expect(queueUpdatedCall?.[1]).toEqual(
      expect.objectContaining({
        radioModeActive: false,
        radioBoundaryIndex: undefined,
      }),
    );
  });

  test("setModeEnabled(false) blocks new radio triggers before cleanup finishes without committing disabled state early", async () => {
    let resolveRemoval: (() => void) | undefined;

    fixtures.mockLmsClient.getQueue.mockResolvedValueOnce({
      ok: true,
      value: [
        {
          id: "radio-current",
          position: 1,
          title: "Current Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: true,
          source: "tidal",
        },
        {
          id: "radio-next",
          position: 2,
          title: "Next Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: false,
          source: "tidal",
        },
      ],
    });
    fixtures.mockLmsClient.removeFromQueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemoval = (): void => resolve(ok(undefined));
        }),
    );
    fixtures.mockLmsClient.getQueue.mockResolvedValueOnce({
      ok: true,
      value: [
        {
          id: "radio-current",
          position: 1,
          title: "Current Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: true,
          source: "tidal",
        },
      ],
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );
    setRadioQueueEntries([
      {
        position: 1,
        repeatKey: getQueueTrackRepeatKey({
          title: "Current Radio",
          artist: "Radio Artist",
        }),
        signature: getQueueTrackSignature({
          id: "radio-current",
          position: 1,
          title: "Current Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: true,
          addedBy: "radio",
          source: "tidal",
        }),
      },
      {
        position: 2,
        repeatKey: getQueueTrackRepeatKey({
          title: "Next Radio",
          artist: "Radio Artist",
        }),
        signature: getQueueTrackSignature({
          id: "radio-next",
          position: 2,
          title: "Next Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: false,
          addedBy: "radio",
          source: "tidal",
        }),
      },
    ]);

    const disablePromise = engine.setModeEnabled(false);
    await Promise.resolve();

    expect(getRadioQueueState().isEnabled).toBe(true);

    await engine.handleQueueEnd("Miles Davis", "So What");

    expect(fixtures.mockLastFmClient.getSimilarTracks).not.toHaveBeenCalled();

    resolveRemoval?.();
    await disablePromise;
    expect(getRadioQueueState().isEnabled).toBe(false);
  });

  test("setModeEnabled(false) keeps radio mode enabled when radio track removal fails", async () => {
    fixtures.mockLmsClient.getQueue.mockResolvedValueOnce({
      ok: true,
      value: [
        {
          id: "radio-current",
          position: 1,
          title: "Current Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: true,
          source: "tidal",
        },
        {
          id: "radio-next",
          position: 2,
          title: "Next Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: false,
          source: "tidal",
        },
      ],
    });
    fixtures.mockLmsClient.removeFromQueue.mockResolvedValue({
      ok: false,
      error: {
        type: "NetworkError",
        message: "could not remove radio track",
      },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );
    setRadioQueueEntries([
      {
        position: 1,
        repeatKey: getQueueTrackRepeatKey({
          title: "Current Radio",
          artist: "Radio Artist",
        }),
        signature: getQueueTrackSignature({
          id: "radio-current",
          position: 1,
          title: "Current Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: true,
          addedBy: "radio",
          source: "tidal",
        }),
      },
      {
        position: 2,
        repeatKey: getQueueTrackRepeatKey({
          title: "Next Radio",
          artist: "Radio Artist",
        }),
        signature: getQueueTrackSignature({
          id: "radio-next",
          position: 2,
          title: "Next Radio",
          artist: "Radio Artist",
          album: "Radio Album",
          duration: 180,
          isCurrent: false,
          addedBy: "radio",
          source: "tidal",
        }),
      },
    ]);

    const result = await engine.setModeEnabled(false);

    expect(result).toEqual({
      status: "failed",
      reason: "queue-update-failed",
      error: "could not remove radio track",
    });
    expect(getRadioQueueState().isEnabled).toBe(true);
  });

  test("setModeEnabled(true) keeps radio mode disabled when queue fetch fails", async () => {
    fixtures.mockLmsClient.getQueue.mockResolvedValueOnce({
      ok: false,
      error: { type: "NetworkError", message: "connection refused" },
    });

    const engine = createRadioEngine(
      fixtures.mockLmsClient,
      fixtures.mockLastFmClient,
      fixtures.mockIo.io,
      "player-1",
      mockLogger,
    );
    setRadioModeEnabledState(false);

    const result = await engine.setModeEnabled(true);

    expect(result).toEqual({
      status: "failed",
      reason: "queue-fetch-failed",
      error: "connection refused",
    });
    expect(getRadioQueueState().isEnabled).toBe(false);
  });
});
