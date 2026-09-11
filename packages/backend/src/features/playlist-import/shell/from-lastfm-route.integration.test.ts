import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createLastFmPlaylistRoute } from "./from-lastfm-route.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import { createLastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  UserTopTrack,
  UserLovedTrack,
  TagTopTrack,
  ArtistTopTrack,
  RecommendedTrack,
} from "../../../adapters/lastfm-client/index.js";

vi.mock("../../../infrastructure/config/index.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  isConfigured: vi.fn(),
  DEFAULT_CONFIG_PATH: "/tmp/test-config.json",
}));

import { loadConfig } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/service.js";

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
  readonly savePlaylist: ReturnType<typeof vi.fn<LmsClient["savePlaylist"]>>;
};

type MockLastFmClient = LastFmClient & {
  readonly getUserTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserTopTracks"]>
  >;
  readonly getUserLovedTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserLovedTracks"]>
  >;
  readonly getTagTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getTagTopTracks"]>
  >;
  readonly getArtistTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getArtistTopTracks"]>
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
  savePlaylist: vi
    .fn<LmsClient["savePlaylist"]>()
    .mockResolvedValue(ok(undefined)),
});

const createMockLastFmClient = (): MockLastFmClient => ({
  ...createLastFmClient(defaultLastFmConfig),
  getUserTopTracks: vi
    .fn<LastFmClient["getUserTopTracks"]>()
    .mockResolvedValue(ok([])),
  getUserLovedTracks: vi
    .fn<LastFmClient["getUserLovedTracks"]>()
    .mockResolvedValue(ok([])),
  getTagTopTracks: vi
    .fn<LastFmClient["getTagTopTracks"]>()
    .mockResolvedValue(ok([])),
  getArtistTopTracks: vi
    .fn<LastFmClient["getArtistTopTracks"]>()
    .mockResolvedValue(ok([])),
  getRecommendedTracks: vi
    .fn<LastFmClient["getRecommendedTracks"]>()
    .mockResolvedValue(ok([])),
});

const parseJson = (body: string): unknown => JSON.parse(body);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const importedCount = (value: unknown): number =>
  isRecord(value) && typeof value["imported"] === "number"
    ? value["imported"]
    : 0;

const makeConfig = (
  users: AppConfig["users"],
  lastFmSharedSecret?: string,
): { readonly ok: true; readonly value: AppConfig } => ({
  ok: true as const,
  value: {
    lmsHost: "localhost",
    lmsPort: 9000,
    playerId: "00:00:00:00:00:00",
    lastFmApiKey: "key",
    fanartApiKey: "",
    language: "en" as const,
    personalRadioEnabled: true,
    users,
    scrobblingEnabled: false,
    personalRadioDiscovery: 50,
    lastFmSharedSecret,
  },
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

const makeUserTopTrack = (name: string, artist: string): UserTopTrack => ({
  name,
  artist,
  playcount: 10,
  url: `https://last.fm/${artist}/${name}`,
});

const makeLovedTrack = (name: string, artist: string): UserLovedTrack => ({
  name,
  artist,
  url: `https://last.fm/${artist}/${name}`,
});

const makeTagTrack = (name: string, artist: string): TagTopTrack => ({
  name,
  artist,
  url: `https://last.fm/${artist}/${name}`,
});

const makeArtistTrack = (name: string, artist: string): ArtistTopTrack => ({
  name,
  artist,
  playcount: 10,
  listeners: 5,
  url: `https://last.fm/${artist}/${name}`,
});

const makeRecommendedTrack = (
  name: string,
  artist: string,
): RecommendedTrack => ({
  name,
  artist,
  url: `https://last.fm/${artist}/${name}`,
});

// Matches the resolveWithMissing search query so every candidate resolves,
// except the queries listed in `unresolvable`.
const setUpResolvingSearch = (
  mockLmsClient: MockLmsClient,
  unresolvable: readonly string[] = [],
): void => {
  mockLmsClient.search.mockImplementation(async (query: string) => {
    if (unresolvable.includes(query)) {
      return ok({ tracks: [], tidalAvailable: true });
    }
    const artist = query.split(" ").slice(0, -1).join(" ") || query;
    const url = `file:///${query.replace(/\s+/g, "_")}.flac`;
    return ok({
      tracks: [makeSearchResult(url, artist)],
      tidalAvailable: true,
    });
  });
};

const fieldOf = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

describe("POST /api/playlists/from-lastfm", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify({ logger: false });
    createLastFmPlaylistRoute(server, mockLmsClient, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("happy path for source: top-tracks, defaulting the period to overall", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester", lastFmUsername: "testuser" }]),
    );
    mockLastFmClient.getUserTopTracks.mockResolvedValue(
      ok([
        makeUserTopTrack("Creep", "Radiohead"),
        makeUserTopTrack("Alive", "Pearl"),
        makeUserTopTrack("Debaser", "Pixies"),
      ]),
    );
    setUpResolvingSearch(mockLmsClient, ["Pearl Alive"]);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "top-tracks" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(importedCount(parsed)).toBe(2);
    expect(fieldOf(parsed, "missing")).toEqual(["Pearl – Alive"]);
    expect(fieldOf(parsed, "totalCandidates")).toBe(3);
    expect(mockLastFmClient.getUserTopTracks).toHaveBeenCalledWith(
      "testuser",
      "overall",
      50,
    );
  });

  it("passes a non-default period and limit from the body through to the client", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester", lastFmUsername: "testuser" }]),
    );
    mockLastFmClient.getUserTopTracks.mockResolvedValue(
      ok([makeUserTopTrack("Creep", "Radiohead")]),
    );
    setUpResolvingSearch(mockLmsClient);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "top-tracks", period: "7day", limit: 25 },
    });

    expect(response.statusCode).toBe(200);
    expect(mockLastFmClient.getUserTopTracks).toHaveBeenCalledWith(
      "testuser",
      "7day",
      25,
    );
  });

  it("happy path for source: loved", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester", lastFmUsername: "testuser" }]),
    );
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([
        makeLovedTrack("Creep", "Radiohead"),
        makeLovedTrack("Alive", "Pearl"),
      ]),
    );
    setUpResolvingSearch(mockLmsClient, ["Radiohead Creep"]);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "loved" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(importedCount(parsed)).toBe(1);
    expect(fieldOf(parsed, "missing")).toEqual(["Radiohead – Creep"]);
    expect(fieldOf(parsed, "totalCandidates")).toBe(2);
    expect(mockLastFmClient.getUserLovedTracks).toHaveBeenCalledWith(
      "testuser",
      50,
    );
  });

  it("happy path for source: tag", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([
        makeTagTrack("Creep", "Radiohead"),
        makeTagTrack("Alive", "Pearl"),
        makeTagTrack("Debaser", "Pixies"),
      ]),
    );
    setUpResolvingSearch(mockLmsClient, ["Pixies Debaser"]);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(importedCount(parsed)).toBe(2);
    expect(fieldOf(parsed, "missing")).toEqual(["Pixies – Debaser"]);
    expect(mockLastFmClient.getTagTopTracks).toHaveBeenCalledWith(
      "shoegaze",
      1,
      50,
    );
  });

  it("happy path for source: artist", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([
        makeArtistTrack("Creep", "Radiohead"),
        makeArtistTrack("Bones", "Radiohead"),
      ]),
    );
    setUpResolvingSearch(mockLmsClient, ["Radiohead Bones"]);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "artist", artist: "Radiohead", limit: 30 },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(importedCount(parsed)).toBe(1);
    expect(fieldOf(parsed, "missing")).toEqual(["Radiohead – Bones"]);
    expect(mockLastFmClient.getArtistTopTracks).toHaveBeenCalledWith(
      "Radiohead",
      30,
    );
  });

  it("happy path for source: recommended", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig(
        [
          {
            id: "u1",
            name: "Tester",
            lastFmUsername: "testuser",
            lastFmSessionKey: "sess-123",
          },
        ],
        "shared-secret",
      ),
    );
    mockLastFmClient.getRecommendedTracks.mockResolvedValue(
      ok([
        makeRecommendedTrack("Creep", "Radiohead"),
        makeRecommendedTrack("Alive", "Pearl"),
      ]),
    );
    setUpResolvingSearch(mockLmsClient, ["Pearl Alive"]);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "recommended" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(importedCount(parsed)).toBe(1);
    expect(fieldOf(parsed, "missing")).toEqual(["Pearl – Alive"]);
    expect(mockLastFmClient.getRecommendedTracks).toHaveBeenCalledWith(
      "sess-123",
      "shared-secret",
      50,
    );
  });

  it("returns 400 for source: tag with no tag field", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for source: artist with no artist field", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "artist" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for source: loved with an irrelevant tag field present", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "loved", tag: "shoegaze" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for source: loved with an irrelevant period field present", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "loved", period: "7day" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getUserLovedTracks).not.toHaveBeenCalled();
  });

  it("returns 400 for limit: 0", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze", limit: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getTagTopTracks).not.toHaveBeenCalled();
  });

  it("returns 400 for limit: 201", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze", limit: 201 },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getTagTopTracks).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty after trim", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze", name: "   " },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getTagTopTracks).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown source value", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "unknown-source" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when the Last.fm client returns an error Result", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze" },
    });

    expect(response.statusCode).toBe(503);
  });

  it("returns 200 with imported 0 and totalCandidates 0 when zero candidates come back, without calling LMS", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["imported"]).toBe(0);
    expect(isRecord(parsed) && parsed["totalCandidates"]).toBe(0);
    expect(mockLmsClient.search).not.toHaveBeenCalled();
    expect(mockLmsClient.play).not.toHaveBeenCalled();
  });

  it("returns 400 for source: top-tracks when no user is resolvable", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "top-tracks" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getUserTopTracks).not.toHaveBeenCalled();
  });

  it("returns 400 for source: loved when the resolved user has no lastFmUsername", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester" }]),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "loved" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getUserLovedTracks).not.toHaveBeenCalled();
  });

  it("returns 400 for source: recommended when the resolved user has no lastFmSessionKey", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig(
        [{ id: "u1", name: "Tester", lastFmUsername: "testuser" }],
        "shared-secret",
      ),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "recommended" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getRecommendedTracks).not.toHaveBeenCalled();
  });

  it("returns 400 for source: recommended when lastFmSessionKey is present but no app-level shared secret is configured", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([
        {
          id: "u1",
          name: "Tester",
          lastFmUsername: "testuser",
          lastFmSessionKey: "sess-123",
        },
      ]),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "recommended" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockLastFmClient.getRecommendedTracks).not.toHaveBeenCalled();
  });

  it("calls savePlaylist with the given name on a happy path", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTrack("Creep", "Radiohead")]),
    );
    setUpResolvingSearch(mockLmsClient);

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze", name: "My Radiohead Mix" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.savePlaylist).toHaveBeenCalledWith("My Radiohead Mix");
  });

  it("returns 503 when lmsClient.savePlaylist fails after play and addToQueue succeeded", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTrack("Creep", "Radiohead"), makeTagTrack("Alive", "Pearl")]),
    );
    setUpResolvingSearch(mockLmsClient);
    mockLmsClient.savePlaylist.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze", name: "My Radiohead Mix" },
    });

    expect(response.statusCode).toBe(503);
    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
  });

  it("reports only the tracks that reached the queue when an addToQueue fails", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([
        makeTagTrack("Creep", "Radiohead"),
        makeTagTrack("Alive", "Pearl"),
        makeTagTrack("Debaser", "Pixies"),
      ]),
    );
    setUpResolvingSearch(mockLmsClient);
    mockLmsClient.addToQueue
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(
        err({ type: "NetworkError", message: "Connection refused" }),
      );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(importedCount(parsed)).toBe(2);
    expect(fieldOf(parsed, "totalCandidates")).toBe(3);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when lmsClient.play fails", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTrack("Creep", "Radiohead")]),
    );
    setUpResolvingSearch(mockLmsClient);
    mockLmsClient.play.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/from-lastfm",
      payload: { source: "tag", tag: "shoegaze" },
    });

    expect(response.statusCode).toBe(503);
  });
});
