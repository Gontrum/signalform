/**
 * Radio Mode — Acceptance Tests
 *
 * BDD-style acceptance tests — one scenario per user-visible behaviour.
 * Written BEFORE implementation (red-green-refactor).
 * All tests MUST fail RED before any implementation code is written.
 */

import fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, test, expect, vi } from "vitest";
import { Server } from "socket.io";
import { ok } from "@signalform/shared";
import {
  createLmsClient,
  type LmsClient,
  type SearchResult,
} from "../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../adapters/lastfm-client/index.js";
import type { TypedSocketIOServer } from "../../infrastructure/websocket/index.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@signalform/shared";

import { createRadioEngine } from "./shell/radio-service.js";
import {
  clearRadioQueueRuntimeState,
  setSuppressedQueueEnd,
} from "./shell/radio-state.js";

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
  readonly resume: ReturnType<typeof vi.fn<LmsClient["resume"]>>;
  readonly nextTrack: ReturnType<typeof vi.fn<LmsClient["nextTrack"]>>;
};

type StatusResult = Awaited<ReturnType<LmsClient["getStatus"]>>;

type EmitFn = (event: string, ...args: readonly unknown[]) => void;
type LogFn = (msg: string, meta?: Readonly<Record<string, unknown>>) => void;

type MockEmit = ReturnType<typeof vi.fn<EmitFn>>;

beforeEach(() => {
  clearRadioQueueRuntimeState();
});

type MockIo = {
  readonly io: TypedSocketIOServer;
  readonly emit: MockEmit;
  readonly sockets?: { readonly sockets: { readonly size: number } };
};

const makeMockEmit = (): MockEmit => vi.fn<EmitFn>();

const makeMockIo = (
  mockEmit: MockEmit = makeMockEmit(),
  options?: Pick<MockIo, "sockets">,
): MockIo => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockImplementation((event, ...args) => {
    mockEmit(event, ...args);
    return true;
  });
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return {
    io,
    emit: mockEmit,
    sockets: options?.sockets,
  };
};

const createMockLastFmClient = (
  overrides: Partial<MockLastFmClient> = {},
): MockLastFmClient => ({
  getSimilarTracks: vi.fn<LastFmClient["getSimilarTracks"]>(),
  getSimilarArtists: vi.fn<LastFmClient["getSimilarArtists"]>(),
  getArtistInfo: vi.fn<LastFmClient["getArtistInfo"]>(),
  getAlbumInfo: vi.fn<LastFmClient["getAlbumInfo"]>(),
  getArtistTopTracks: vi.fn<LastFmClient["getArtistTopTracks"]>(),
  getArtistTopAlbums: vi.fn<LastFmClient["getArtistTopAlbums"]>(),
  getTagTopTracks: vi.fn<LastFmClient["getTagTopTracks"]>(),
  searchTags: vi.fn<LastFmClient["searchTags"]>(),
  getUserTopArtists: vi.fn<LastFmClient["getUserTopArtists"]>(),
  getUserTopTracks: vi.fn<LastFmClient["getUserTopTracks"]>(),
  getUserLovedTracks: vi.fn<LastFmClient["getUserLovedTracks"]>(),
  getUserRecentTracks: vi.fn<LastFmClient["getUserRecentTracks"]>(),
  getUserNeighbours: vi.fn<LastFmClient["getUserNeighbours"]>(),
  getRecommendedTracks: vi.fn<LastFmClient["getRecommendedTracks"]>(),
  nowPlaying: vi.fn<LastFmClient["nowPlaying"]>(),
  scrobble: vi.fn<LastFmClient["scrobble"]>(),
  love: vi.fn(),
  unlove: vi.fn(),
  getCircuitState: vi
    .fn<LastFmClient["getCircuitState"]>()
    .mockReturnValue("CLOSED"),
  ...overrides,
});

const createMockLmsClient = (
  overrides: Partial<MockLmsClient> = {},
): MockLmsClient => ({
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
      playerConnected: true,
      shuffle: "off" as const,
      repeat: "off" as const,
      time: 120,
      duration: 240,
      volume: 50,
      currentTrack: null,
      queuePreview: [],
    },
  }),
  resume: vi.fn<LmsClient["resume"]>().mockResolvedValue(ok(undefined)),
  nextTrack: vi.fn<LmsClient["nextTrack"]>().mockResolvedValue(ok(undefined)),
  ...overrides,
});

const makeMockLogger = (): {
  readonly info: ReturnType<typeof vi.fn<LogFn>>;
  readonly warn: ReturnType<typeof vi.fn<LogFn>>;
  readonly error: ReturnType<typeof vi.fn<LogFn>>;
} => ({
  info: vi.fn<LogFn>(),
  warn: vi.fn<LogFn>(),
  error: vi.fn<LogFn>(),
});

const makeMockApp = (): FastifyInstance => fastify({ logger: false });

const createSequentialGetStatus = (
  responses: readonly Awaited<ReturnType<LmsClient["getStatus"]>>[],
): ReturnType<typeof vi.fn<LmsClient["getStatus"]>> => {
  const responseIterator = responses[Symbol.iterator]();
  const fallbackResponse = responses.at(-1);
  return vi
    .fn<LmsClient["getStatus"]>()
    .mockImplementation(
      async (
        _playerId?: string,
      ): Promise<Awaited<ReturnType<LmsClient["getStatus"]>>> => {
        const nextResponse = responseIterator.next();
        return nextResponse.done ? fallbackResponse! : nextResponse.value;
      },
    );
};

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
): SearchResult => ({
  id: `${artist}-${title}`,
  title,
  artist,
  album: "Test Album",
  url: `file:///music/${artist}/${title}.${lossless ? "flac" : "mp3"}`,
  source: "local" as const,
  type: "track" as const,
  audioQuality: {
    format: lossless ? ("FLAC" as const) : ("MP3" as const),
    bitrate: lossless ? 1411000 : 320000,
    sampleRate: 44100,
    lossless,
  },
});

describe("Queue-end detection (play → stop transition)", () => {
  test("startStatusPolling signature accepts onQueueEnd callback as 6th parameter", async () => {
    // Verify the status-poller API contract: accepts onQueueEnd callback
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    // startStatusPolling must accept 6 parameters (onQueueEnd is optional 6th)
    expect(typeof startStatusPolling).toBe("function");
    // The function accepts 5 required + 1 optional parameter
    // length reflects required params only (default params not counted past the last required)
    expect(startStatusPolling.length).toBeGreaterThanOrEqual(4);
  });

  test("onQueueEnd callback is invoked when play→stop transition is detected", async () => {
    // Directly test the queue-end detection logic via a controlled polling sequence.
    // This tests that the detection block in status-poller correctly fires onQueueEnd.
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    // Promise-based detection: resolves when onQueueEnd is called — avoids flaky setTimeout.
    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    // io.sockets.sockets.size is accessed in status-poller's IIFE for latency logging
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    // Track poll calls: play on 1st, stop on 2nd+
    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 120,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "42",
          title: "Blue in Green",
          artist: "Miles Davis",
          album: "Kind of Blue",
          url: "file:///music/miles/blue-in-green.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [],
      }),
      ok({
        mode: "stop" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5, // 5ms interval for fast test
      mockOnQueueEnd,
    );

    // Wait for onQueueEnd to be called (event-driven — no arbitrary sleep)
    await vi.waitFor(() => {
      expect(mockOnQueueEnd).toHaveBeenCalledWith(
        "Miles Davis",
        "Blue in Green",
      );
    });
    stopPolling();
    const result = mockOnQueueEnd.mock.calls[0];

    expect(result).toEqual(["Miles Davis", "Blue in Green"]);
    expect(mockOnQueueEnd).toHaveBeenCalledWith("Miles Davis", "Blue in Green");
  });
});

describe("Seamless radio start — last.fm getSimilarTracks called with seed", () => {
  test("handleQueueEnd calls getSimilarTracks with seed artist and title, no user prompt", async () => {
    const mockSimilarTracks = [makeSimilarTrack("Kind Artist", "Cool Track")];
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [], tidalAvailable: true },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    expect(mockLastFmClient.getSimilarTracks).toHaveBeenCalledWith(
      "Miles Davis",
      "So What",
      50,
    );
  });
});

describe("Tracks found in LMS added to queue (up to 5)", () => {
  test("handleQueueEnd adds up to 5 tracks to LMS queue", async () => {
    // Provide 10 similar tracks → only top 5 should be added
    const mockSimilarTracks = Array.from({ length: 10 }, (_, i) =>
      makeSimilarTrack(`Artist ${i}`, `Track ${i}`, 0.9 - i * 0.05),
    );

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const lmsSearchResults = mockSimilarTracks.map((t) =>
      makeLmsSearchResult(t.artist, t.name),
    );
    const mockLmsClient = createMockLmsClient({
      // Return the result matching the candidate artist — artist-match check requires this.
      search: vi.fn().mockImplementation(async (query: string) => {
        const match = lmsSearchResults.find((r) =>
          query.toLowerCase().includes(r.artist.toLowerCase()),
        );
        return {
          ok: true,
          value: { tracks: match ? [match] : [], tidalAvailable: true },
        };
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(5);
  });
});

describe("WebSocket events emitted after tracks added", () => {
  test("handleQueueEnd emits player.radio.started and player.queue.updated", async () => {
    const mockSimilarTracks = [makeSimilarTrack("Artist A", "Track A")];
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Artist A", "Track A")],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          value: [],
        })
        .mockResolvedValueOnce({
          ok: true,
          value: [],
        })
        .mockResolvedValueOnce({
          ok: true,
          value: [
            {
              id: "1",
              position: 1,
              title: "Track A",
              artist: "Artist A",
              album: "",
              duration: 240,
              isCurrent: false,
            },
          ],
        }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit);
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    const emittedEvents = mockEmit.mock.calls.map((call) => call[0]);
    expect(emittedEvents).toContain("player.radio.started");

    expect(emittedEvents).toContain("player.queue.updated");

    const radioStartedCall = mockEmit.mock.calls.find(
      (call) => call[0] === "player.radio.started",
    );
    expect(radioStartedCall).toBeDefined();
    const payload = radioStartedCall![1];
    expect(payload).toMatchObject({
      playerId: "player-1",
      seedTrack: { artist: "Miles Davis", title: "So What" },
      tracksAdded: 1,
    });
    expect(typeof payload.timestamp).toBe("number");
  });
});

describe("Artist diversity maintained across radio triggers", () => {
  test("artist added in first trigger is filtered out in second trigger (sliding window)", async () => {
    // cross-trigger diversity: the same artist should not appear
    // in consecutive radio batches because the sliding window tracks recent artists.

    const firstTriggerTracks = [makeSimilarTrack("Artist A", "Song 1")];
    const secondTriggerTracks = [
      makeSimilarTrack("Artist A", "Song 2"), // same artist — should be filtered by window
      makeSimilarTrack("Artist B", "Song 3"), // different artist — should pass
    ];

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: firstTriggerTracks })
        .mockResolvedValueOnce({ ok: true, value: secondTriggerTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockImplementation(async (query: string) => ({
        ok: true,
        value: {
          tracks: [
            makeLmsSearchResult(
              query.split(" ")[0]!,
              query.split(" ").slice(1).join(" ") || "Track",
            ),
          ],
          tidalAvailable: true,
        },
      })),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    // First trigger: Artist A is added, window = ["Artist A"]
    await engine.handleQueueEnd("Miles Davis", "So What");
    const firstAddCount = mockLmsClient.addToQueue.mock.calls.length;
    expect(firstAddCount).toBe(1); // Artist A added

    // Reset mocks to isolate second trigger's calls
    mockLmsClient.addToQueue.mockClear();
    mockLmsClient.search.mockClear();

    // Second trigger: Artist A is offered again — diversity window should filter it out
    // Only Artist B should be added
    await engine.handleQueueEnd("John Coltrane", "A Love Supreme");

    // Artist A must be filtered BEFORE reaching LMS search (diversity filter works pre-search)
    const secondSearchCalls = mockLmsClient.search.mock.calls;
    const artistASearched = secondSearchCalls.some((call: readonly unknown[]) =>
      String(call[0]).startsWith("Artist A"),
    );
    expect(artistASearched).toBe(false); // Artist A must not reach LMS search step
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1); // Only Artist B added
  });
});

describe("Graceful degradation on failure", () => {
  test("last.fm API failure does not crash — error logged, polling continues", async () => {
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: false,
        error: { type: "NetworkError", message: "Connection refused" },
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn(),
      addToQueue: vi.fn(),
      getQueue: vi.fn(),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    // Should not throw
    await expect(
      engine.handleQueueEnd("Miles Davis", "So What"),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("no LMS candidates found — no event emitted, no crash", async () => {
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Artist", "Track")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [], tidalAvailable: true },
      }), // no results
      addToQueue: vi.fn(),
      getQueue: vi.fn(),
    });

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit);
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await expect(
      engine.handleQueueEnd("Miles Davis", "So What"),
    ).resolves.toBeUndefined();

    expect(mockEmit).not.toHaveBeenCalledWith(
      "player.radio.started",
      expect.anything(),
    );
  });
});

describe("Proactive trigger fires when queuePreview transitions non-empty → empty during playback", () => {
  test("onQueueEnd called with currently-playing track when queuePreview goes empty while playing", async () => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    // Poll 1: playing, queuePreview has one upcoming track
    // Poll 2: still playing (last track), queuePreview empty → proactive fires
    // Poll 3+: same as poll 2 (prevent stop trigger from also firing)
    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 60,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "1",
          title: "So What",
          artist: "Miles Davis",
          album: "Kind of Blue",
          url: "file:///music/miles/so-what.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [
          {
            id: "2",
            position: 1,
            title: "Freddie Freeloader",
            artist: "Miles Davis",
            album: "Kind of Blue",
            duration: 250,
            isCurrent: false,
          },
        ],
      }),
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 180,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "1",
          title: "So What",
          artist: "Miles Davis",
          album: "Kind of Blue",
          url: "file:///music/miles/so-what.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [], // empty now — proactive trigger fires
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5, // 5ms interval for fast test
      mockOnQueueEnd,
    );

    await vi.waitFor(() => {
      expect(mockOnQueueEnd).toHaveBeenCalledWith("Miles Davis", "So What");
    });
    stopPolling();
    const result = mockOnQueueEnd.mock.calls[0];

    expect(result).toEqual(["Miles Davis", "So What"]);
    expect(mockOnQueueEnd).toHaveBeenCalledWith("Miles Davis", "So What");
    // Verify proactive trigger fired exactly once (not multiple times across polls)
    expect(mockOnQueueEnd).toHaveBeenCalledOnce();
  });

  test("proactive trigger is suppressed after the user deliberately drains the queue to the current track", async () => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });

    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 60,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "1",
          title: "So What",
          artist: "Miles Davis",
          album: "Kind of Blue",
          url: "file:///music/miles/so-what.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [
          {
            id: "2",
            position: 1,
            title: "Freddie Freeloader",
            artist: "Miles Davis",
            album: "Kind of Blue",
            duration: 250,
            isCurrent: false,
          },
        ],
      }),
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 180,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "1",
          title: "So What",
          artist: "Miles Davis",
          album: "Kind of Blue",
          url: "file:///music/miles/so-what.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [],
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5,
      mockOnQueueEnd,
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    stopPolling();
    expect(mockOnQueueEnd).not.toHaveBeenCalled();
  });
});

describe("queue-end recovery — lmsClient.nextTrack() called when player stops after adding tracks", () => {
  test("nextTrack() called when getStatus() returns stop after tracks added", async () => {
    const mockSimilarTracks = [
      makeSimilarTrack("Herbie Hancock", "Watermelon Man"),
    ];
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "stop" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 0,
          duration: 0,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      nextTrack: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // nextTrack() must be called because the player was stopped when tracks were added
    expect(mockLmsClient.nextTrack).toHaveBeenCalledOnce();
  });

  test("nextTrack() NOT called when getStatus() returns play (player already playing)", async () => {
    const mockSimilarTracks = [
      makeSimilarTrack("Herbie Hancock", "Watermelon Man"),
    ];
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      nextTrack: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // nextTrack() must NOT be called if player is already playing
    expect(mockLmsClient.nextTrack).not.toHaveBeenCalled();
  });
});

describe("Duplicate artist prevention — same artist appears at most once per batch", () => {
  test("second candidate from same artist is skipped — LMS search not called for it", async () => {
    // Three candidates all from same artist → only first should reach LMS search
    const mockSimilarTracks = [
      makeSimilarTrack("Herbie Hancock", "Watermelon Man", 0.9),
      makeSimilarTrack("Herbie Hancock", "Maiden Voyage", 0.8),
      makeSimilarTrack("Herbie Hancock", "Chameleon", 0.7),
    ];
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // only 1 LMS search (for "Watermelon Man") — the other two are skipped
    expect(mockLmsClient.search).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
  });

  test("duplicate artist check is case-insensitive", async () => {
    const mockSimilarTracks = [
      makeSimilarTrack("Herbie Hancock", "Watermelon Man", 0.9),
      makeSimilarTrack("herbie hancock", "Maiden Voyage", 0.8), // lowercase
    ];
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Herbie Hancock", "Watermelon Man")],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // Case-insensitive duplicate: "herbie hancock" matches "Herbie Hancock" → only 1 search
    expect(mockLmsClient.search).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
  });
});

describe("Single-track edge case — stop fallback fires when queuePreview was always empty", () => {
  test("stop trigger fires when queuePreview was always empty (single track queue)", async (): Promise<void> => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    // queuePreview always []: proactive trigger must NOT fire
    // play → stop: stop trigger MUST fire with previousStatus.currentTrack as seed
    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 200,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "99",
          title: "Autumn Leaves",
          artist: "Bill Evans",
          album: "Portrait in Jazz",
          url: "file:///music/bill/autumn-leaves.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [], // always empty — single track
      }),
      ok({
        mode: "stop" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5,
      mockOnQueueEnd,
    );

    await vi.waitFor(() => {
      expect(mockOnQueueEnd).toHaveBeenCalledWith(
        "Bill Evans",
        "Autumn Leaves",
      );
    });
    stopPolling();
    const result = mockOnQueueEnd.mock.calls[0];

    expect(result).toEqual(["Bill Evans", "Autumn Leaves"]);
    expect(mockOnQueueEnd).toHaveBeenCalledWith("Bill Evans", "Autumn Leaves");
    // Verify stop trigger fired exactly once (proactive trigger must NOT have fired)
    expect(mockOnQueueEnd).toHaveBeenCalledOnce();
  });

  test("stop trigger is suppressed after the user removes the currently playing final queue item", async (): Promise<void> => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    setSuppressedQueueEnd({
      trackId: "99",
      artist: "Bill Evans",
      title: "Autumn Leaves",
    });

    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 200,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "99",
          title: "Autumn Leaves",
          artist: "Bill Evans",
          album: "Portrait in Jazz",
          url: "file:///music/bill/autumn-leaves.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [],
      }),
      ok({
        mode: "stop" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5,
      mockOnQueueEnd,
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    stopPolling();
    expect(mockOnQueueEnd).not.toHaveBeenCalled();
  });

  test("stop suppression clears when a new playback session starts later", async (): Promise<void> => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    setSuppressedQueueEnd({
      trackId: "99",
      artist: "Bill Evans",
      title: "Autumn Leaves",
    });

    const responses: readonly StatusResult[] = [
      ok({
        mode: "stop" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      }),
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 30,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "99",
          title: "Autumn Leaves",
          artist: "Bill Evans",
          album: "Portrait in Jazz",
          url: "file:///music/bill/autumn-leaves.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [],
      }),
      ok({
        mode: "stop" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5,
      mockOnQueueEnd,
    );

    await vi.waitFor(() => {
      expect(mockOnQueueEnd).toHaveBeenCalledWith(
        "Bill Evans",
        "Autumn Leaves",
      );
    });
    stopPolling();
    expect(mockOnQueueEnd).toHaveBeenCalledOnce();
  });
});

describe("handleQueueEnd completes within 2000ms with proactive trigger", () => {
  test("handleQueueEnd resolves within 2000ms even with getStatus and resume calls", async () => {
    const mockSimilarTracks = Array.from({ length: 10 }, (_, i) =>
      makeSimilarTrack(`Artist ${i}`, `Track ${i}`, 0.9 - i * 0.05),
    );
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockImplementation(async () => ({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Matched Artist", "Matched Track")],
          tidalAvailable: true,
        },
      })),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    const start = Date.now();
    await engine.handleQueueEnd("Miles Davis", "So What");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
  });
});

// Helper: Tidal search result (audioQuality populated by enrichment)
const makeTidalLmsSearchResult = (
  artist: string,
  title: string,
  lossless = true,
  tidalId?: string,
): SearchResult => ({
  id: tidalId ? `tidal://${tidalId}.flc` : `tidal-${artist}-${title}`,
  title,
  artist,
  album: "Tidal Album",
  url: tidalId
    ? `tidal://${tidalId}.flc`
    : `tidal://${artist.replace(/\s+/g, "_")}__${title.replace(/\s+/g, "_")}.${lossless ? "flc" : "m4a"}`,
  source: "tidal" as const,
  type: "track" as const,
  audioQuality: {
    format: lossless ? ("FLAC" as const) : ("AAC" as const),
    bitrate: lossless ? 1411000 : 320000,
    sampleRate: 44100,
    lossless,
  },
});

describe("Status poller triggers onQueueEnd when Tidal track ends (proactive)", () => {
  test("onQueueEnd called with Tidal track's artist+title when queuePreview goes empty while playing", async () => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    // Poll 1: playing a Tidal track, queuePreview has one upcoming track
    // Poll 2: still playing same Tidal track, queuePreview empty → proactive fires
    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 120,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "tidal-99",
          title: "The Less I Know The Better",
          artist: "Tame Impala",
          album: "Currents",
          url: "tidal://58990486.flc",
          source: "tidal" as const,
          type: "track" as const,
          audioQuality: {
            format: "FLAC" as const,
            bitrate: 1411000,
            sampleRate: 44100,
            lossless: true,
          },
        },
        queuePreview: [
          {
            id: "tidal-100",
            position: 1,
            title: "Let It Happen",
            artist: "Tame Impala",
            album: "Currents",
            duration: 467,
            isCurrent: false,
          },
        ],
      }),
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 230,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "tidal-99",
          title: "The Less I Know The Better",
          artist: "Tame Impala",
          album: "Currents",
          url: "tidal://58990486.flc",
          source: "tidal" as const,
          type: "track" as const,
          audioQuality: {
            format: "FLAC" as const,
            bitrate: 1411000,
            sampleRate: 44100,
            lossless: true,
          },
        },
        queuePreview: [], // empty — proactive trigger fires
      }),
    ];
    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5, // 5ms interval for fast test
      mockOnQueueEnd,
    );

    await vi.waitFor(() => {
      expect(mockOnQueueEnd).toHaveBeenCalledWith(
        "Tame Impala",
        "The Less I Know The Better",
      );
    });
    stopPolling();
    const result = mockOnQueueEnd.mock.calls[0];

    expect(result).toEqual(["Tame Impala", "The Less I Know The Better"]);
    expect(mockOnQueueEnd).toHaveBeenCalledWith(
      "Tame Impala",
      "The Less I Know The Better",
    );
    expect(mockOnQueueEnd).toHaveBeenCalledOnce();
  });
});

describe("Status poller triggers onQueueEnd when Tidal track ends (stop fallback)", () => {
  test("onQueueEnd called with Tidal track's artist+title on play→stop transition", async () => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockOnQueueEnd = vi
      .fn()
      .mockImplementation(
        async (_artist: string, _title: string): Promise<void> => {},
      );

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    // queuePreview always [] — proactive trigger skips; stop trigger fires
    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 230,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "tidal-77",
          title: "Bad Guy",
          artist: "Billie Eilish",
          album: "When We All Fall Asleep",
          url: "tidal://77123456.flc",
          source: "tidal" as const,
          type: "track" as const,
          audioQuality: {
            format: "FLAC" as const,
            bitrate: 1411000,
            sampleRate: 44100,
            lossless: true,
          },
        },
        queuePreview: [], // always empty — single Tidal track
      }),
      ok({
        mode: "stop" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 0,
        volume: 50,
        currentTrack: null,
        queuePreview: [],
      }),
    ];
    const mockLmsClientB = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClientB,
      mockApp,
      "player-id",
      5,
      mockOnQueueEnd,
    );

    await vi.waitFor(() => {
      expect(mockOnQueueEnd).toHaveBeenCalledWith("Billie Eilish", "Bad Guy");
    });
    stopPolling();
    const result = mockOnQueueEnd.mock.calls[0];

    expect(result).toEqual(["Billie Eilish", "Bad Guy"]);
    expect(mockOnQueueEnd).toHaveBeenCalledWith("Billie Eilish", "Bad Guy");
    expect(mockOnQueueEnd).toHaveBeenCalledOnce();
  });
});

describe("Status poller emits queue updates when duplicate track ids advance the queue", () => {
  test("player.queue.updated is emitted when queuePreview changes even if currentTrack.id stays the same", async () => {
    const { startStatusPolling } =
      await import("../../infrastructure/websocket/status-poller.js");

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit, {
      sockets: { sockets: { size: 0 } },
    });

    const responses: readonly StatusResult[] = [
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 12,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "repeat-1",
          title: "Repeat Song",
          artist: "Radio Artist",
          album: "Album",
          url: "file:///music/repeat-song.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [
          {
            id: "repeat-1",
            title: "Repeat Song",
            artist: "Radio Artist",
          },
          {
            id: "tail-1",
            title: "Later Song",
            artist: "Radio Artist",
          },
        ],
      }),
      ok({
        mode: "play" as const,
        playerConnected: true,
        shuffle: "off" as const,
        repeat: "off" as const,
        time: 0,
        duration: 240,
        volume: 50,
        currentTrack: {
          id: "repeat-1",
          title: "Repeat Song",
          artist: "Radio Artist",
          album: "Album",
          url: "file:///music/repeat-song.flac",
          source: "local" as const,
          type: "track" as const,
          audioQuality: undefined,
        },
        queuePreview: [
          {
            id: "tail-1",
            title: "Later Song",
            artist: "Radio Artist",
          },
        ],
      }),
    ];

    const postAdvanceQueue = [
      {
        id: "repeat-1",
        position: 0,
        title: "Repeat Song",
        artist: "Radio Artist",
        album: "Album",
        duration: 240,
        isCurrent: true,
      },
      {
        id: "tail-1",
        position: 1,
        title: "Later Song",
        artist: "Radio Artist",
        album: "Album",
        duration: 220,
        isCurrent: false,
      },
    ];

    const mockLmsClient = createMockLmsClient({
      getStatus: createSequentialGetStatus(responses),
      getQueue: vi
        .fn()
        .mockResolvedValue({ ok: true, value: postAdvanceQueue }),
    });

    const mockApp = makeMockApp();

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-id",
      5,
    );

    await vi.waitFor(() => {
      const queueUpdatedCall = mockEmit.mock.calls.find(
        (call) => call[0] === "player.queue.updated",
      );
      expect(queueUpdatedCall).toBeDefined();
    });

    stopPolling();

    const queueUpdatedCall = mockEmit.mock.calls.find(
      (call) => call[0] === "player.queue.updated",
    );
    expect(queueUpdatedCall).toBeDefined();
    expect(queueUpdatedCall?.[1]).toMatchObject({
      playerId: "player-id",
      tracks: postAdvanceQueue,
    });
  });
});

describe("handleQueueEnd calls getSimilarTracks with Tidal track's artist+title", () => {
  test("getSimilarTracks called with Tidal seed artist+title and limit=50 — same invocation as local seed", async () => {
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Radiohead", "Creep")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [], tidalAvailable: true },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      makeMockIo().io,
      "player-1",
      makeMockLogger(),
    );

    // Simulate Tidal seed: artist+title come from a Tidal currentTrack
    await engine.handleQueueEnd("Tame Impala", "The Less I Know The Better");

    expect(mockLastFmClient.getSimilarTracks).toHaveBeenCalledWith(
      "Tame Impala",
      "The Less I Know The Better",
      50,
    );
  });
});

describe("Radio engine adds Tidal track URL when LMS search returns Tidal-only results", () => {
  test("Tidal URL (tidal://trackId.flc) added to queue when LMS search returns only Tidal results", async () => {
    // Use different artist than seed ("Tame Impala") to avoid seed-artist exclusion
    const tidalResult = makeTidalLmsSearchResult("Radiohead", "Creep");

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Radiohead", "Creep")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [tidalResult], tidalAvailable: true },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 0,
          duration: 0,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      makeMockIo().io,
      "player-1",
      makeMockLogger(),
    );

    await engine.handleQueueEnd("Tame Impala", "The Less I Know The Better");

    expect(mockLmsClient.addToQueue).toHaveBeenCalledOnce();
    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith(tidalResult.url);
  });
});

describe("Graceful degradation — computeFallbackUrl used when Tidal track has no audioQuality", () => {
  test("track added via computeFallbackUrl when Tidal search result lacks audioQuality", async () => {
    // Tidal result without audioQuality (enrichment failed / not yet enriched)
    const tidalResultNoQuality = {
      id: "tidal-no-quality",
      title: "New Song",
      artist: "Some Artist",
      album: "Some Album",
      url: "tidal://123456.flc",
      source: "tidal" as const,
      type: "track" as const,
      audioQuality: undefined, // no quality data — enrichment failed
    };

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Some Artist", "New Song")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [tidalResultNoQuality], tidalAvailable: true },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 0,
          duration: 0,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      makeMockIo().io,
      "player-1",
      makeMockLogger(),
    );

    await engine.handleQueueEnd("Tame Impala", "The Less I Know The Better");

    // track still added via fallback (computeFallbackUrl picks the only URL available)
    expect(mockLmsClient.addToQueue).toHaveBeenCalledOnce();
    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith(
      tidalResultNoQuality.url,
    );
  });
});

describe("selectBestTrackUrl prefers local FLAC over Tidal FLAC (source hierarchy)", () => {
  test("local FLAC URL added to queue when LMS returns both local and Tidal results", async () => {
    const localResult = makeLmsSearchResult("Radiohead", "Creep", true); // local FLAC
    const tidalResult = makeTidalLmsSearchResult("Radiohead", "Creep", true); // Tidal FLAC

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Radiohead", "Creep")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      // Both local and Tidal results returned for same track
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [tidalResult, localResult], tidalAvailable: true },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 0,
          duration: 0,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      makeMockIo().io,
      "player-1",
      makeMockLogger(),
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // local FLAC preferred over Tidal FLAC (source hierarchy)
    expect(mockLmsClient.addToQueue).toHaveBeenCalledOnce();
    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith(localResult.url);
  });
});

describe("radioBoundaryIndex equals pre-radio queue length after Tidal-triggered radio", () => {
  test("player.queue.updated emitted with correct radioBoundaryIndex from Tidal-triggered radio", async () => {
    // Use different artist than seed ("Tame Impala") to avoid seed-artist exclusion
    const tidalResult = makeTidalLmsSearchResult("Radiohead", "Creep");

    const preRadioQueue = [
      {
        id: "tidal-1",
        position: 0,
        title: "Track 1",
        artist: "Artist 1",
        album: "",
        duration: 240,
        isCurrent: false,
      },
      {
        id: "tidal-2",
        position: 1,
        title: "Track 2",
        artist: "Artist 2",
        album: "",
        duration: 200,
        isCurrent: false,
      },
    ];
    const postRadioQueue = [
      ...preRadioQueue,
      {
        id: "radio-1",
        position: 2,
        title: "Creep",
        artist: "Radiohead",
        album: "Pablo Honey",
        duration: 230,
        isCurrent: false,
      },
    ];

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Radiohead", "Creep")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: { tracks: [tidalResult], tidalAvailable: true },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      // Calls: pre-radio queue, freshness re-check, post-radio queue
      getQueue: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: preRadioQueue })
        .mockResolvedValueOnce({ ok: true, value: preRadioQueue })
        .mockResolvedValueOnce({ ok: true, value: postRadioQueue }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 0,
          duration: 0,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockEmit = vi.fn();
    const mockIo = makeMockIo(mockEmit);

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      makeMockLogger(),
    );

    await engine.handleQueueEnd("Tame Impala", "The Less I Know The Better");

    // player.queue.updated emitted with radioBoundaryIndex = 2 (pre-radio queue length)
    const queueUpdatedCall = mockEmit.mock.calls.find(
      (call) => call[0] === "player.queue.updated",
    );
    expect(queueUpdatedCall).toBeDefined();
    expect(queueUpdatedCall![1]).toMatchObject({
      playerId: "player-1",
      radioBoundaryIndex: 2, // pre-radio queue had 2 tracks
    });
    expect(queueUpdatedCall![1].tracks).toHaveLength(3); // post-radio queue has 3 tracks
  });
});

describe("Artist-match validation — spurious LMS results rejected", () => {
  test("track NOT added when LMS returns a result with a different artist (e.g. Various Artists)", async () => {
    // Reproduces: search("Lisa Dream") → "Holiday / Various Artists"
    // Without fix: Holiday gets added. With fix: skipped — artist mismatch.
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeSimilarTrack("Lisa", "Dream")],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      // Returns completely wrong track (artist mismatch — like the real LMS fuzzy search bug)
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [makeLmsSearchResult("Various Artists", "Holiday")],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      makeMockIo().io,
      "player-1",
      makeMockLogger(),
    );

    await engine.handleQueueEnd("Sabrina Carpenter", "emails i can't send");

    // Artist mismatch: "Various Artists" ≠ "Lisa" → must NOT be added
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });
});

describe("URL deduplication — same track not added twice", () => {
  test("second candidate mapping to already-added URL is skipped", async () => {
    // Reproduces: "Lisa Dream" AND "Adele When We Were Young" both resolve to Holiday.flac
    // Without fix: Holiday.flac added twice. With fix: second add skipped.
    const holidayUrl = "file:///music/Various/Holiday.flac";

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          makeSimilarTrack("Artist Alpha", "Song One"),
          makeSimilarTrack("Artist Beta", "Song Two"), // different artist, same URL below
        ],
      }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      // Both candidates resolve to the same URL (artist match passes for both)
      search: vi.fn().mockImplementation(async (query: string) => ({
        ok: true,
        value: {
          tracks: [
            {
              id: "dup-1",
              title: "Holiday",
              artist: query.toLowerCase().includes("alpha")
                ? "Artist Alpha"
                : "Artist Beta",
              album: "Various",
              url: holidayUrl, // same URL for both!
              source: "local" as const,
              type: "track" as const,
              audioQuality: {
                format: "FLAC" as const,
                bitrate: 1411000,
                sampleRate: 44100,
                lossless: true,
              },
            },
          ],
          tidalAvailable: true,
        },
      })),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 0,
          duration: 0,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      makeMockIo().io,
      "player-1",
      makeMockLogger(),
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    // URL deduplication: first candidate adds holidayUrl, second is rejected
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith(holidayUrl);
  });
});

describe("seed artist excluded — after playing Taylor Swift, 0 Taylor Swift tracks in batch", () => {
  test("Taylor Swift candidates are excluded when seedArtist is Taylor Swift", async () => {
    // last.fm returns Taylor Swift tracks (same as seed artist) + others
    const mockSimilarTracks = [
      makeSimilarTrack("Taylor Swift", "Anti-Hero"),
      makeSimilarTrack("Taylor Swift", "Shake It Off"),
      makeSimilarTrack("Olivia Rodrigo", "drivers license"),
      makeSimilarTrack("Sabrina Carpenter", "Espresso"),
    ];

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn().mockImplementation(async (query: string) => {
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes("taylor swift")) {
          return {
            ok: true,
            value: {
              tracks: [makeLmsSearchResult("Taylor Swift", "Anti-Hero")],
              tidalAvailable: true,
            },
          };
        }
        if (lowerQuery.includes("olivia rodrigo")) {
          return {
            ok: true,
            value: {
              tracks: [
                makeLmsSearchResult("Olivia Rodrigo", "drivers license"),
              ],
              tidalAvailable: true,
            },
          };
        }
        if (lowerQuery.includes("sabrina carpenter")) {
          return {
            ok: true,
            value: {
              tracks: [makeLmsSearchResult("Sabrina Carpenter", "Espresso")],
              tidalAvailable: true,
            },
          };
        }
        return { ok: true, value: { tracks: [], tidalAvailable: true } };
      }),
      addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    // Seed: Taylor Swift track
    await engine.handleQueueEnd("Taylor Swift", "Cruel Summer");

    // search() must NOT have been called for Taylor Swift candidates at all —
    // seed exclusion happens before the LMS search to avoid wasteful API calls.
    const searchCalls = mockLmsClient.search.mock.calls.map(([query]) => query);
    const taylorSwiftSearched = searchCalls.filter((query) =>
      query.toLowerCase().includes("taylor"),
    );
    expect(taylorSwiftSearched).toHaveLength(0);

    const addCalls = mockLmsClient.addToQueue.mock.calls.map(([url]) => url);
    const taylorSwiftAdded = addCalls.filter((url) =>
      url.toLowerCase().includes("taylor"),
    );
    expect(taylorSwiftAdded).toHaveLength(0);

    // Non-seed artists should still be added
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
  });
});

describe("Tidal URL added to queue when local search returns 0 but Tidal has track", () => {
  test("tidal:// URL is added to queue when search() returns only Tidal result", async () => {
    const tidalTrackUrl = "tidal://58990486.flc";
    const mockSimilarTracks = [makeSimilarTrack("Adele", "Hello")];

    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi
        .fn()
        .mockResolvedValue({ ok: true, value: mockSimilarTracks }),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      // search() returns only a Tidal result (no local track found)
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          tracks: [
            makeTidalLmsSearchResult("Adele", "Hello", true, "58990486"),
          ],
          tidalAvailable: true,
        },
      }),
      addToQueue: vi.fn().mockResolvedValue({ ok: true }),
      getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "play" as const,
          playerConnected: true,
          shuffle: "off" as const,
          repeat: "off" as const,
          time: 120,
          duration: 240,
          volume: 50,
          currentTrack: null,
          queuePreview: [],
        },
      }),
      resume: vi.fn().mockResolvedValue(ok(undefined)),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    await engine.handleQueueEnd("Miles Davis", "So What");

    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith(tidalTrackUrl);
  });
});

describe("Server wiring — lastFmClient properly integrated", () => {
  test("createRadioEngine is exported from radio-mode feature", async () => {
    const radioMode = await import("./index.js");
    expect(typeof radioMode.createRadioEngine).toBe("function");
  });

  test("RadioEngine type has handleQueueEnd method", () => {
    const mockLastFmClient = createMockLastFmClient({
      getSimilarTracks: vi.fn(),
      getSimilarArtists: vi.fn(),
    });

    const mockLmsClient = createMockLmsClient({
      search: vi.fn(),
      addToQueue: vi.fn(),
      getQueue: vi.fn(),
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: { mode: "play" as const },
      }),
      resume: vi.fn().mockResolvedValue({ ok: true }),
    });

    const mockIo = makeMockIo();
    const logger = makeMockLogger();

    const engine = createRadioEngine(
      mockLmsClient,
      mockLastFmClient,
      mockIo.io,
      "player-1",
      logger,
    );

    expect(typeof engine.handleQueueEnd).toBe("function");
  });
});
