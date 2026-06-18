import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createPersonalRadioRoute } from "./route.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import { createLastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  UserLovedTrack,
  SimilarArtist,
  ArtistTopTrack,
  UserRecentTrack,
  UserNeighbour,
} from "../../../adapters/lastfm-client/index.js";

// Mock config loading and radio state
vi.mock("../../../infrastructure/config/index.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  isConfigured: vi.fn(),
  DEFAULT_CONFIG_PATH: "/tmp/test-config.json",
}));

vi.mock("../../radio-mode/index.js", () => ({
  setPersonalRadioContext: vi.fn(),
  setRadioModeEnabledState: vi.fn(),
  setGenreRadioContext: vi.fn(),
  incrementGenreRadioPage: vi.fn(),
}));

import { loadConfig } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/service.js";
import {
  setPersonalRadioContext,
  setRadioModeEnabledState,
} from "../../radio-mode/index.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

const defaultLastFmConfig = {
  apiKey: "test-key",
  timeout: 5000,
  baseUrl: "https://ws.audioscrobbler.com/2.0/",
  language: "en" as const,
};

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
};

type MockLastFmClient = LastFmClient & {
  readonly getUserLovedTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserLovedTracks"]>
  >;
  readonly getUserTopArtists: ReturnType<
    typeof vi.fn<LastFmClient["getUserTopArtists"]>
  >;
  readonly getUserRecentTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserRecentTracks"]>
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
  readonly getUserNeighbours: ReturnType<
    typeof vi.fn<LastFmClient["getUserNeighbours"]>
  >;
  readonly getRecommendedTracks: ReturnType<
    typeof vi.fn<LastFmClient["getRecommendedTracks"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  search: vi
    .fn<LmsClient["search"]>()
    .mockResolvedValue(ok({ tracks: [], tidalAvailable: true })),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
});

const createMockLastFmClient = (): MockLastFmClient => ({
  ...createLastFmClient(defaultLastFmConfig),
  getUserLovedTracks: vi
    .fn<LastFmClient["getUserLovedTracks"]>()
    .mockResolvedValue(ok([])),
  getUserTopArtists: vi
    .fn<LastFmClient["getUserTopArtists"]>()
    .mockResolvedValue(ok([])),
  getUserTopTracks: vi
    .fn<LastFmClient["getUserTopTracks"]>()
    .mockResolvedValue(ok([])),
  getUserRecentTracks: vi
    .fn<LastFmClient["getUserRecentTracks"]>()
    .mockResolvedValue(ok([])),
  getSimilarArtists: vi
    .fn<LastFmClient["getSimilarArtists"]>()
    .mockResolvedValue(ok([])),
  getArtistTopTracks: vi
    .fn<LastFmClient["getArtistTopTracks"]>()
    .mockResolvedValue(ok([])),
  searchTags: vi.fn<LastFmClient["searchTags"]>().mockResolvedValue(ok([])),
  getUserNeighbours: vi
    .fn<LastFmClient["getUserNeighbours"]>()
    .mockResolvedValue(ok([])),
  getRecommendedTracks: vi
    .fn<LastFmClient["getRecommendedTracks"]>()
    .mockResolvedValue(ok([])),
});

const parseJson = (body: string): unknown => JSON.parse(body);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const makeEnabledConfig = (): {
  readonly ok: true;
  readonly value: AppConfig;
} => ({
  ok: true as const,
  value: {
    lmsHost: "localhost",
    lmsPort: 9000,
    playerId: "00:00:00:00:00:00",
    lastFmApiKey: "key",
    fanartApiKey: "",
    language: "en" as const,
    personalRadioEnabled: true,
    lastFmUsername: "testuser",
    scrobblingEnabled: false,
    personalRadioDiscovery: 50,
  },
});

const makeLovedTrack = (name: string, artist: string): UserLovedTrack => ({
  name,
  artist,
  url: `https://last.fm/${artist}/${name}`,
});

const makeSimilarArtist = (name: string, match = 0.8): SimilarArtist => ({
  name,
  match,
  url: `https://last.fm/music/${name}`,
});

const makeArtistTopTrack = (name: string, artist: string): ArtistTopTrack => ({
  name,
  artist,
  playcount: 1000,
  listeners: 500,
  url: `https://last.fm/music/${artist}/_/${name}`,
});

const makeRecentTrack = (name: string, artist: string): UserRecentTrack => ({
  name,
  artist,
  url: `https://last.fm/music/${artist}/_/${name}`,
});

const makeSearchResult = (url: string, artist: string): SearchResult => ({
  id: "1",
  title: "Track",
  artist,
  album: "Album",
  url,
  source: "local",
  type: "track",
});

describe("POST /api/personal-radio/start", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify({ logger: false });
    createPersonalRadioRoute(server, mockLmsClient, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 400 when personalRadioEnabled is false", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      ok: true,
      value: {
        ...makeEnabledConfig().value,
        personalRadioEnabled: false,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(400);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["error"] === "string").toBe(true);
  });

  it("returns 400 when no lastFmUsername in config", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      ok: true,
      value: {
        ...makeEnabledConfig().value,
        lastFmUsername: undefined,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(400);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["error"] === "string").toBe(true);
  });

  it("returns 404 when no listening history (empty loved and top artists)", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(ok([]));
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(404);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe(
      "No listening history found",
    );
  });

  it("returns 404 when LMS finds no playable tracks", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Roads", "Portishead")]),
    );
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(404);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe(
      "No playable tracks found",
    );
  });

  it("returns 200 with tracksAdded and seedArtists on success", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Roads", "Portishead")]),
    );
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///roads.flac", "Portishead")],
        tidalAvailable: true,
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["tracksAdded"] === "number").toBe(
      true,
    );
    expect(isRecord(parsed) && Array.isArray(parsed["seedArtists"])).toBe(true);
    const tracksAdded = isRecord(parsed) ? parsed["tracksAdded"] : undefined;
    expect(typeof tracksAdded === "number" && tracksAdded > 0).toBe(true);
  });

  it("calls lmsClient.play with the first URL on success", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Roads", "Portishead")]),
    );
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///roads.flac", "Portishead")],
        tidalAvailable: true,
      }),
    );

    await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(mockLmsClient.play).toHaveBeenCalledOnce();
    expect(mockLmsClient.play).toHaveBeenCalledWith("file:///roads.flac");
  });

  it("sets radio context with username and seedArtists after successful start", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Roads", "Portishead")]),
    );
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///roads.flac", "Portishead")],
        tidalAvailable: true,
      }),
    );

    await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(setPersonalRadioContext).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "testuser",
        cycle: 1,
      }),
    );
    expect(setRadioModeEnabledState).toHaveBeenCalledWith(true);
  });

  it("excludes recently played tracks from candidates", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    // Two tracks from Portishead
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([
        makeArtistTopTrack("Roads", "Portishead"),
        makeArtistTopTrack("Glory Box", "Portishead"),
      ]),
    );
    // Roads is in recent — only Glory Box should be searched
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(
      ok([makeRecentTrack("Roads", "Portishead")]),
    );
    let _callCount = 0;
    mockLmsClient.search.mockImplementation(async (query) => {
      _callCount++;
      if (query.toLowerCase().includes("glory box")) {
        return ok({
          tracks: [makeSearchResult("file:///glory_box.flac", "Portishead")],
          tidalAvailable: true,
        });
      }
      return ok({ tracks: [], tidalAvailable: true });
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(200);
    // Roads should not have been searched (it was recent)
    const searchedQueries = mockLmsClient.search.mock.calls.map(
      ([q]) => q as string,
    );
    const roadSearched = searchedQueries.some((q) =>
      q.toLowerCase().includes("roads"),
    );
    expect(roadSearched).toBe(false);
  });

  it("fetches neighbours for discovery pool when discoveryRatio > 0", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    const neighbour: UserNeighbour = {
      username: "neighbour1",
      url: "https://last.fm/user/neighbour1",
      match: 0.9,
    };
    mockLastFmClient.getUserNeighbours.mockResolvedValue(ok([neighbour]));
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Roads", "Portishead")]),
    );
    mockLastFmClient.getUserTopTracks.mockResolvedValue(
      ok([
        {
          name: "Go",
          artist: "Moby",
          playcount: 500,
          url: "https://last.fm/music/Moby/_/Go",
        },
      ]),
    );
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///roads.flac", "Portishead")],
        tidalAvailable: true,
      }),
    );

    await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(mockLastFmClient.getUserNeighbours).toHaveBeenCalledWith(
      "testuser",
      5,
    );
  });

  it("gracefully handles getUserNeighbours failure", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeEnabledConfig());
    mockLastFmClient.getUserNeighbours.mockResolvedValue(
      err({ type: "NetworkError" as const, message: "Connection refused" }),
    );
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLastFmClient.getUserTopArtists.mockResolvedValue(ok([]));
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([makeSimilarArtist("Portishead")]),
    );
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([makeArtistTopTrack("Roads", "Portishead")]),
    );
    mockLastFmClient.getUserRecentTracks.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///roads.flac", "Portishead")],
        tidalAvailable: true,
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/personal-radio/start",
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["tracksAdded"] === "number").toBe(
      true,
    );
  });
});
