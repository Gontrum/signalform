/**
 * Radio Mode — Specification Tests for mode-specific replenish orchestrators
 *
 * Pins the INTENDED behaviour of `replenishGenreQueue` and
 * `replenishPersonalRadioQueue` (comfort + discovery sub-flows).
 *
 * Error-handling contract (all modes): last.fm failures never surface as
 * "queue-fetch-failed". A CircuitOpenError emits PLAYER_RADIO_UNAVAILABLE and
 * skips with "lastfm-unavailable" (unavailableEmitted: true); any other
 * last.fm error logs a warning and skips with "lastfm-unavailable". The
 * discovery→comfort fall-through is intended graceful degradation and is
 * made observable via the "radio.discovery_fell_back_to_comfort" info log.
 *
 * Setup conventions mirror radio-service.integration.test.ts.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { Server } from "socket.io";
import { ok } from "@signalform/shared";
import {
  createLmsClient,
  type LmsClient,
  type SearchResult,
} from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  TagTopTrack,
  SimilarArtist,
  ArtistTopTrack,
  UserTopTrack,
  UserRecentTrack,
} from "../../../adapters/lastfm-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_RADIO_UNAVAILABLE,
} from "../../../infrastructure/websocket/index.js";
import type {
  ClientToServerEvents,
  QueueTrack,
  QueueUpdatedPayload,
  ServerToClientEvents,
} from "@signalform/shared";
import { createRadioEngine, type RadioEngine } from "./radio-service.js";
import {
  getRadioQueueState,
  resetRadioRuntimeState,
  setGenreRadioContext,
  setPersonalRadioContext,
} from "./radio-state.js";
import type { AppConfig } from "../../../infrastructure/config/service.js";

vi.mock("../../../infrastructure/config/index.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  isConfigured: vi.fn(),
  DEFAULT_CONFIG_PATH: "/tmp/test-config.json",
}));

import { loadConfig } from "../../../infrastructure/config/index.js";

// --- Test helpers -----------------------------------------------------------

const makeTagTopTrack = (artist: string, name: string): TagTopTrack => ({
  name,
  artist,
  url: `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(name)}`,
});

const makeSimilarArtist = (name: string, match = 0.8): SimilarArtist => ({
  name,
  match,
  url: `https://www.last.fm/music/${encodeURIComponent(name)}`,
});

const makeArtistTopTrack = (artist: string, name: string): ArtistTopTrack => ({
  name,
  artist,
  playcount: 1000,
  listeners: 500,
  url: `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(name)}`,
});

const makeUserTopTrack = (artist: string, name: string): UserTopTrack => ({
  name,
  artist,
  playcount: 42,
  url: `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(name)}`,
});

const makeUserRecentTrack = (
  artist: string,
  name: string,
): UserRecentTrack => ({
  name,
  artist,
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

const makeQueueTrack = (
  artist: string,
  title: string,
  position: number,
): QueueTrack => ({
  id: `${artist}-${title}`,
  position,
  title,
  artist,
  album: "Test Album",
  duration: 240,
  isCurrent: false,
  url: `file:///music/${encodeURIComponent(artist)}/${encodeURIComponent(title)}.mp3`,
});

const TEST_APP_CONFIG: AppConfig = {
  lmsHost: "localhost",
  lmsPort: 9000,
  playerId: "player-1",
  lastFmApiKey: "test-api-key",
  fanartApiKey: "",
  language: "en",
  personalRadioEnabled: true,
  scrobblingEnabled: false,
  lastFmUsername: "david",
  personalRadioDiscovery: 0,
};

const stubDiscoveryRatio = (personalRadioDiscovery: number): void => {
  vi.mocked(loadConfig).mockReturnValue(
    ok({ ...TEST_APP_CONFIG, personalRadioDiscovery }),
  );
};

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
  readonly getTagTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getTagTopTracks"]>
  >;
  readonly getSimilarArtists: ReturnType<
    typeof vi.fn<LastFmClient["getSimilarArtists"]>
  >;
  readonly getArtistTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getArtistTopTracks"]>
  >;
  readonly getUserTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserTopTracks"]>
  >;
  readonly getUserRecentTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserRecentTracks"]>
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

type MockIo = {
  readonly io: TypedSocketIOServer;
  readonly emit: ReturnType<typeof vi.fn>;
  readonly to: ReturnType<typeof vi.fn>;
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
  return { io, emit, to };
};

const resetMockLmsClient = (mockLmsClient: MockLmsClient): void => {
  mockLmsClient.search.mockReset();
  mockLmsClient.addToQueue.mockReset().mockResolvedValue(ok(undefined));
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
  mockLmsClient.resume.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.nextTrack.mockReset().mockResolvedValue(ok(undefined));
};

const resetMockLastFmClient = (mockLastFmClient: MockLastFmClient): void => {
  mockLastFmClient.getTagTopTracks.mockReset();
  mockLastFmClient.getSimilarArtists.mockReset();
  mockLastFmClient.getArtistTopTracks.mockReset();
  mockLastFmClient.getUserTopTracks.mockReset();
  mockLastFmClient.getUserRecentTracks.mockReset();
};

const resetMockIo = (mockIo: MockIo): void => {
  mockIo.emit.mockReset();
  mockIo.to.mockClear();
};

type TestFixtures = {
  readonly mockEmit: MockIo["emit"];
  readonly mockIo: MockIo;
  readonly mockLastFmClient: MockLastFmClient;
  readonly mockLmsClient: MockLmsClient;
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

const createEngine = (): RadioEngine =>
  createRadioEngine(
    fixtures.mockLmsClient,
    fixtures.mockLastFmClient,
    fixtures.mockIo.io,
    "player-1",
    mockLogger,
  );

/**
 * Stubs lmsClient.search so each query returns the results whose artist or
 * title appears in the query text. This keeps searches order-independent —
 * both genre and personal flows shuffle candidates before searching.
 */
const stubSearchResults = (results: readonly SearchResult[]): void => {
  fixtures.mockLmsClient.search.mockImplementation((query: string) =>
    Promise.resolve(
      ok({
        tracks: results.filter(
          (r) => query.includes(r.title) || query.includes(r.artist),
        ),
        tidalAvailable: true,
      }),
    ),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  resetMockIo(fixtures.mockIo);
  resetMockLastFmClient(fixtures.mockLastFmClient);
  resetMockLmsClient(fixtures.mockLmsClient);
  resetRadioRuntimeState();
  stubDiscoveryRatio(0);
});

// =============================================================================
// Genre radio: replenishGenreQueue
// =============================================================================

describe("replenishGenreQueue", () => {
  test("happy path: fetches tag top tracks, adds match to queue, emits queue update, increments page", async () => {
    const engine = createEngine();
    setGenreRadioContext({ genreName: "jazz", page: 3 });

    fixtures.mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTopTrack("Herbie Hancock", "Chameleon")]),
    );
    const searchResult = makeLmsSearchResult("Herbie Hancock", "Chameleon");
    stubSearchResults([searchResult]);
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(
        ok([makeQueueTrack("Herbie Hancock", "Chameleon", 1)]),
      );

    await engine.handleQueueEnd("Seed Artist", "Seed Title");

    expect(fixtures.mockLastFmClient.getTagTopTracks).toHaveBeenCalledWith(
      "jazz",
      3,
      50,
    );
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      searchResult.url,
    );

    expect(fixtures.mockIo.to).toHaveBeenCalledWith(PLAYER_UPDATES_ROOM);
    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();
    expect(queueUpdatedCall?.[1]).toMatchObject({
      playerId: "player-1",
      radioModeActive: true,
      radioBoundaryIndex: 0,
    });
    expect(queueUpdatedCall?.[1].tracks).toEqual([
      expect.objectContaining({
        artist: "Herbie Hancock",
        title: "Chameleon",
        addedBy: "radio",
      }),
    ]);

    // Page is incremented after a successful replenish
    expect(getRadioQueueState().genreRadioContext).toEqual({
      genreName: "jazz",
      page: 4,
    });
  });

  test("last.fm CircuitOpenError: emits player.radio.unavailable, skips with lastfm-unavailable, no LMS search", async () => {
    const engine = createEngine();
    setGenreRadioContext({ genreName: "jazz", page: 1 });

    fixtures.mockLastFmClient.getTagTopTracks.mockResolvedValue({
      ok: false,
      error: { type: "CircuitOpenError", message: "circuit open" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({
      status: "skipped",
      reason: "lastfm-unavailable",
      unavailableEmitted: true,
    });
    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      PLAYER_RADIO_UNAVAILABLE,
      expect.objectContaining({
        playerId: "player-1",
        message: "Radio mode temporarily unavailable",
      }),
    );
    expect(fixtures.mockLmsClient.search).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("other last.fm error: skips with lastfm-unavailable, does NOT emit player.radio.unavailable", async () => {
    const engine = createEngine();
    setGenreRadioContext({ genreName: "jazz", page: 1 });

    fixtures.mockLastFmClient.getTagTopTracks.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "connection refused" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({
      status: "skipped",
      reason: "lastfm-unavailable",
    });
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      PLAYER_RADIO_UNAVAILABLE,
      expect.anything(),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Genre Radio: tag.getTopTracks failed",
      expect.objectContaining({ event: "radio.genre_lastfm_failed" }),
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("empty tag result: skips with no-candidates, nothing added", async () => {
    const engine = createEngine();
    setGenreRadioContext({ genreName: "obscuregenre", page: 99 });

    fixtures.mockLastFmClient.getTagTopTracks.mockResolvedValue(ok([]));

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({ status: "skipped", reason: "no-candidates" });
    expect(fixtures.mockLmsClient.getQueue).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
    // Page is NOT incremented on skip
    expect(getRadioQueueState().genreRadioContext).toEqual({
      genreName: "obscuregenre",
      page: 99,
    });
  });

  test("dedup: candidate already in queue (same repeat key) is skipped, next candidate added", async () => {
    const engine = createEngine();
    setGenreRadioContext({ genreName: "jazz", page: 1 });

    const alreadyQueued = makeQueueTrack("Herbie Hancock", "Chameleon", 1);
    fixtures.mockLmsClient.getQueue.mockResolvedValue(ok([alreadyQueued]));

    fixtures.mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([
        makeTagTopTrack("Herbie Hancock", "Chameleon"),
        makeTagTopTrack("Wayne Shorter", "Footprints"),
      ]),
    );
    const duplicateResult = makeLmsSearchResult("Herbie Hancock", "Chameleon");
    const freshResult = makeLmsSearchResult("Wayne Shorter", "Footprints");
    stubSearchResults([duplicateResult, freshResult]);

    await engine.handleQueueEnd("Seed", "Title");

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      freshResult.url,
    );
  });

  test("pre-radio getQueue failure: fails with queue-fetch-failed, nothing added", async () => {
    const engine = createEngine();
    setGenreRadioContext({ genreName: "jazz", page: 1 });

    fixtures.mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTopTrack("Herbie Hancock", "Chameleon")]),
    );
    fixtures.mockLmsClient.getQueue.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "queue down" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({
      status: "failed",
      reason: "queue-fetch-failed",
      error: "queue down",
    });
    expect(fixtures.mockLmsClient.search).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Personal radio: comfort channel (discoveryRatio = 0)
// =============================================================================

describe("replenishPersonalRadioQueue — comfort channel", () => {
  test("happy path: rotates seed by cycle, fetches similar artists + top tracks, filters by recent, adds and increments cycle", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis", "John Coltrane"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Kamasi Washington")]),
    );
    fixtures.mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Kamasi Washington", "Truth")]),
    );
    fixtures.mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    const searchResult = makeLmsSearchResult("Kamasi Washington", "Truth");
    stubSearchResults([searchResult]);
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(
        ok([makeQueueTrack("Kamasi Washington", "Truth", 1)]),
      );

    await engine.handleQueueEnd("Seed", "Title");

    // cycle 0 % 2 seeds → first seed
    expect(fixtures.mockLastFmClient.getSimilarArtists).toHaveBeenCalledWith(
      "Miles Davis",
      20,
    );
    expect(fixtures.mockLastFmClient.getArtistTopTracks).toHaveBeenCalledWith(
      "Kamasi Washington",
      8,
    );
    expect(fixtures.mockLastFmClient.getUserRecentTracks).toHaveBeenCalledWith(
      "david",
      30,
    );
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      searchResult.url,
    );

    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();
    expect(queueUpdatedCall?.[1]).toMatchObject({
      playerId: "player-1",
      radioModeActive: true,
    });

    // Cycle is incremented after a successful replenish
    expect(getRadioQueueState().personalRadioContext).toMatchObject({
      cycle: 1,
    });
  });

  test("recently-played track is excluded from candidates", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Kamasi Washington")]),
    );
    fixtures.mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([
        makeArtistTopTrack("Kenny Garrett", "Sing a Song of Song"),
        makeArtistTopTrack("Wayne Shorter", "Footprints"),
      ]),
    );
    fixtures.mockLastFmClient.getUserRecentTracks.mockResolvedValue(
      ok([makeUserRecentTrack("Kenny Garrett", "Sing a Song of Song")]),
    );
    const excludedResult = makeLmsSearchResult(
      "Kenny Garrett",
      "Sing a Song of Song",
    );
    const remainingResult = makeLmsSearchResult("Wayne Shorter", "Footprints");
    stubSearchResults([excludedResult, remainingResult]);

    await engine.handleQueueEnd("Seed", "Title");

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      remainingResult.url,
    );
  });

  test("getSimilarArtists non-circuit error: skips with lastfm-unavailable, logs warn, does NOT emit player.radio.unavailable", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "artist lookup failed" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    // A last.fm failure must NOT surface as queue-fetch-failed — it mirrors
    // the genre path: skipped/lastfm-unavailable without an emit.
    expect(outcome).toEqual({
      status: "skipped",
      reason: "lastfm-unavailable",
    });
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      PLAYER_RADIO_UNAVAILABLE,
      expect.anything(),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Personal Radio: artist.getSimilar failed",
      expect.objectContaining({
        event: "radio.personal_lastfm_failed",
        seedArtist: "Miles Davis",
      }),
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("getSimilarArtists CircuitOpenError: emits player.radio.unavailable once, skips with lastfm-unavailable", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue({
      ok: false,
      error: { type: "CircuitOpenError", message: "circuit open" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({
      status: "skipped",
      reason: "lastfm-unavailable",
      unavailableEmitted: true,
    });
    const unavailableCalls = fixtures.mockEmit.mock.calls.filter(
      (call) => call[0] === PLAYER_RADIO_UNAVAILABLE,
    );
    expect(unavailableCalls).toHaveLength(1);
    expect(unavailableCalls[0]?.[1]).toMatchObject({
      playerId: "player-1",
      message: "Radio mode temporarily unavailable",
    });
    expect(fixtures.mockLmsClient.search).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("ALL getArtistTopTracks fetches fail with CircuitOpenError: emits player.radio.unavailable, skips with lastfm-unavailable", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([
        makeSimilarArtist("Kamasi Washington"),
        makeSimilarArtist("Wayne Shorter"),
      ]),
    );
    fixtures.mockLastFmClient.getArtistTopTracks.mockResolvedValue({
      ok: false,
      error: { type: "CircuitOpenError", message: "circuit open" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({
      status: "skipped",
      reason: "lastfm-unavailable",
      unavailableEmitted: true,
    });
    expect(fixtures.mockEmit).toHaveBeenCalledWith(
      PLAYER_RADIO_UNAVAILABLE,
      expect.objectContaining({ playerId: "player-1" }),
    );
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("partial getArtistTopTracks failures stay tolerated: surviving tracks are still added", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([
        makeSimilarArtist("Kamasi Washington"),
        makeSimilarArtist("Wayne Shorter"),
      ]),
    );
    fixtures.mockLastFmClient.getArtistTopTracks
      .mockResolvedValueOnce({
        ok: false,
        error: { type: "CircuitOpenError", message: "circuit open" },
      })
      .mockResolvedValueOnce(
        ok([makeArtistTopTrack("Wayne Shorter", "Footprints")]),
      );
    fixtures.mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    const searchResult = makeLmsSearchResult("Wayne Shorter", "Footprints");
    stubSearchResults([searchResult]);

    await engine.handleQueueEnd("Seed", "Title");

    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      PLAYER_RADIO_UNAVAILABLE,
      expect.anything(),
    );
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      searchResult.url,
    );
  });

  test("all top-track fetches empty: skips with no-candidates before the recent-tracks exclusion step", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: [],
      cycle: 0,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Kamasi Washington")]),
    );
    fixtures.mockLastFmClient.getArtistTopTracks.mockResolvedValue(ok([]));

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({ status: "skipped", reason: "no-candidates" });
    expect(
      fixtures.mockLastFmClient.getUserRecentTracks,
    ).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
    // Cycle is NOT incremented on skip
    expect(getRadioQueueState().personalRadioContext).toMatchObject({
      cycle: 0,
    });
  });

  test("seed rotation: with cycle=1 and two seed artists the second seed is used", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis", "John Coltrane"],
      neighbours: [],
      cycle: 1,
    });

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(ok([]));

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(
      fixtures.mockLastFmClient.getSimilarArtists,
    ).toHaveBeenCalledExactlyOnceWith("John Coltrane", 20);
    // Empty similar-artist list → no candidates
    expect(outcome).toEqual({ status: "skipped", reason: "no-candidates" });
  });
});

// =============================================================================
// Personal radio: discovery channel (discoveryRatio = 100)
// =============================================================================

describe("replenishPersonalRadioQueue — discovery channel", () => {
  test("happy path: fetches neighbour top tracks, filters by recent, adds and increments cycle", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });
    stubDiscoveryRatio(100);

    fixtures.mockLastFmClient.getUserTopTracks.mockResolvedValue(
      ok([makeUserTopTrack("Alice Coltrane", "Journey in Satchidananda")]),
    );
    fixtures.mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    const searchResult = makeLmsSearchResult(
      "Alice Coltrane",
      "Journey in Satchidananda",
    );
    stubSearchResults([searchResult]);
    fixtures.mockLmsClient.getQueue
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(
        ok([makeQueueTrack("Alice Coltrane", "Journey in Satchidananda", 1)]),
      );

    await engine.handleQueueEnd("Seed", "Title");

    expect(fixtures.mockLastFmClient.getUserTopTracks).toHaveBeenCalledWith(
      "jazzfan42",
      "overall",
      15,
    );
    expect(fixtures.mockLastFmClient.getUserRecentTracks).toHaveBeenCalledWith(
      "david",
      30,
    );
    // Comfort channel is never consulted on the discovery happy path
    expect(fixtures.mockLastFmClient.getSimilarArtists).not.toHaveBeenCalled();
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      searchResult.url,
    );

    const queueUpdatedCall =
      fixtures.mockEmit.mock.calls.find(isQueueUpdatedCall);
    expect(queueUpdatedCall).toBeDefined();
    expect(queueUpdatedCall?.[1]).toMatchObject({
      playerId: "player-1",
      radioModeActive: true,
    });

    expect(getRadioQueueState().personalRadioContext).toMatchObject({
      cycle: 1,
    });
  });

  test("recent-track exclusion: candidate present in getUserRecentTracks is skipped", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });
    stubDiscoveryRatio(100);

    fixtures.mockLastFmClient.getUserTopTracks.mockResolvedValue(
      ok([
        makeUserTopTrack("Pharoah Sanders", "The Creator Has a Master Plan"),
        makeUserTopTrack("Alice Coltrane", "Blue Nile"),
      ]),
    );
    fixtures.mockLastFmClient.getUserRecentTracks.mockResolvedValue(
      ok([
        makeUserRecentTrack("Pharoah Sanders", "The Creator Has a Master Plan"),
      ]),
    );
    const excludedResult = makeLmsSearchResult(
      "Pharoah Sanders",
      "The Creator Has a Master Plan",
    );
    const remainingResult = makeLmsSearchResult("Alice Coltrane", "Blue Nile");
    stubSearchResults([excludedResult, remainingResult]);

    await engine.handleQueueEnd("Seed", "Title");

    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      remainingResult.url,
    );
  });

  test("empty seedArtists: skips with no-candidates before loading config or calling last.fm", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: [],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(outcome).toEqual({ status: "skipped", reason: "no-candidates" });
    // Guard sits above the config load and every last.fm call
    expect(loadConfig).not.toHaveBeenCalled();
    expect(fixtures.mockLastFmClient.getUserTopTracks).not.toHaveBeenCalled();
    expect(fixtures.mockLastFmClient.getSimilarArtists).not.toHaveBeenCalled();
    expect(
      fixtures.mockLastFmClient.getUserRecentTracks,
    ).not.toHaveBeenCalled();
  });

  test("neighbour top tracks empty: falls through to the comfort channel and logs radio.discovery_fell_back_to_comfort", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });
    stubDiscoveryRatio(100);

    fixtures.mockLastFmClient.getUserTopTracks.mockResolvedValue(ok([]));
    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(ok([]));

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    // Intended graceful degradation: discovery yields nothing → comfort runs
    expect(fixtures.mockLastFmClient.getUserTopTracks).toHaveBeenCalledWith(
      "jazzfan42",
      "overall",
      15,
    );
    expect(fixtures.mockLastFmClient.getSimilarArtists).toHaveBeenCalledWith(
      "Miles Davis",
      20,
    );
    expect(outcome).toEqual({ status: "skipped", reason: "no-candidates" });
    // ...and the fall-back is observable in logs
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Personal Radio: discovery fell back to comfort",
      expect.objectContaining({
        event: "radio.discovery_fell_back_to_comfort",
        channel: "discovery",
        reason: "no-candidates",
        username: "david",
        neighbourUsername: "jazzfan42",
        cycle: 0,
      }),
    );
  });

  test("getUserTopTracks CircuitOpenError: falls through to comfort (logged as lastfm-error); comfort circuit branch emits player.radio.unavailable once", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });
    stubDiscoveryRatio(100);

    // Circuit is open: both the discovery and the comfort fetch fail fast
    fixtures.mockLastFmClient.getUserTopTracks.mockResolvedValue({
      ok: false,
      error: { type: "CircuitOpenError", message: "circuit open" },
    });
    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue({
      ok: false,
      error: { type: "CircuitOpenError", message: "circuit open" },
    });

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    // Implemented semantics: a discovery last.fm failure is never terminal —
    // it degrades to comfort, which owns the terminal error contract.
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Personal Radio: discovery fell back to comfort",
      expect.objectContaining({
        event: "radio.discovery_fell_back_to_comfort",
        channel: "discovery",
        reason: "lastfm-error",
        neighbourUsername: "jazzfan42",
      }),
    );
    expect(outcome).toEqual({
      status: "skipped",
      reason: "lastfm-unavailable",
      unavailableEmitted: true,
    });
    const unavailableCalls = fixtures.mockEmit.mock.calls.filter(
      (call) => call[0] === PLAYER_RADIO_UNAVAILABLE,
    );
    expect(unavailableCalls).toHaveLength(1);
    expect(unavailableCalls[0]?.[1]).toMatchObject({
      playerId: "player-1",
      message: "Radio mode temporarily unavailable",
    });
    expect(fixtures.mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  test("getUserTopTracks non-circuit error: falls through to comfort, which can still succeed", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });
    stubDiscoveryRatio(100);

    fixtures.mockLastFmClient.getUserTopTracks.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "neighbour lookup failed" },
    });
    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Kamasi Washington")]),
    );
    fixtures.mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Kamasi Washington", "Truth")]),
    );
    fixtures.mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    const searchResult = makeLmsSearchResult("Kamasi Washington", "Truth");
    stubSearchResults([searchResult]);

    await engine.handleQueueEnd("Seed", "Title");

    expect(mockLogger.info).toHaveBeenCalledWith(
      "Personal Radio: discovery fell back to comfort",
      expect.objectContaining({
        event: "radio.discovery_fell_back_to_comfort",
        reason: "lastfm-error",
      }),
    );
    expect(fixtures.mockEmit).not.toHaveBeenCalledWith(
      PLAYER_RADIO_UNAVAILABLE,
      expect.anything(),
    );
    expect(fixtures.mockLmsClient.addToQueue).toHaveBeenCalledExactlyOnceWith(
      searchResult.url,
    );
  });

  test("loadConfig ratio drives channel choice: ratio 0 forces comfort even with neighbours available", async () => {
    const engine = createEngine();
    setPersonalRadioContext({
      username: "david",
      seedArtists: ["Miles Davis"],
      neighbours: ["jazzfan42"],
      cycle: 0,
    });
    stubDiscoveryRatio(0);

    fixtures.mockLastFmClient.getSimilarArtists.mockResolvedValue(ok([]));

    const outcome = await engine.replenishAfterRemoval("Seed", "Title");

    expect(fixtures.mockLastFmClient.getUserTopTracks).not.toHaveBeenCalled();
    expect(
      fixtures.mockLastFmClient.getSimilarArtists,
    ).toHaveBeenCalledExactlyOnceWith("Miles Davis", 20);
    expect(outcome).toEqual({ status: "skipped", reason: "no-candidates" });
  });
});
