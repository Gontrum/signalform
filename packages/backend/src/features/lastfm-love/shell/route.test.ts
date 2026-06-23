import Fastify, { type FastifyInstance } from "fastify";
import type { Result } from "@signalform/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLastFmLoveRoute } from "./route.js";
import type {
  AppConfig,
  ConfigError,
} from "../../../infrastructure/config/index.js";
import type {
  LastFmClient,
  LastFmError,
} from "../../../adapters/lastfm-client/index.js";

type ConfigModule = typeof import("../../../infrastructure/config/index.js");
type LoadConfigFn = (configPath?: string) => Result<AppConfig, ConfigError>;

type MockedConfigModule = ConfigModule & {
  readonly loadConfig: ReturnType<typeof vi.fn<LoadConfigFn>>;
};

type LoveResult = Result<void, LastFmError>;

type MockLastFmClient = LastFmClient & {
  readonly love: ReturnType<typeof vi.fn<LastFmClient["love"]>>;
  readonly unlove: ReturnType<typeof vi.fn<LastFmClient["unlove"]>>;
};

const isMockFunction = (value: unknown): value is ReturnType<typeof vi.fn> => {
  return typeof value === "function" && "mock" in value;
};

const isMockedConfigModule = (
  value: ConfigModule,
): value is MockedConfigModule => {
  return isMockFunction(value.loadConfig);
};

vi.mock("../../../infrastructure/config", async (importOriginal) => {
  const actual = await importOriginal<ConfigModule>();
  return {
    ...actual,
    loadConfig: vi.fn<LoadConfigFn>(),
  } satisfies Partial<MockedConfigModule>;
});

const getConfigModule = async (): Promise<MockedConfigModule> => {
  const module = await import("../../../infrastructure/config/index.js");
  expect(isMockedConfigModule(module)).toBe(true);
  return isMockedConfigModule(module)
    ? module
    : { ...module, loadConfig: vi.fn<LoadConfigFn>() };
};

const makeBaseConfig = (): AppConfig => ({
  lmsHost: "localhost",
  lmsPort: 9000,
  playerId: "00:00:00:00:00:00",
  lastFmApiKey: "test-api-key",
  fanartApiKey: "",
  language: "en",
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
  lastFmSessionKey: "sk",
  lastFmSharedSecret: "sec",
});

const makeMockClient = (): MockLastFmClient => ({
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
  love: vi
    .fn<LastFmClient["love"]>()
    .mockResolvedValue({ ok: true, value: undefined } satisfies LoveResult),
  unlove: vi
    .fn<LastFmClient["unlove"]>()
    .mockResolvedValue({ ok: true, value: undefined } satisfies LoveResult),
  getCircuitState: vi
    .fn<LastFmClient["getCircuitState"]>()
    .mockReturnValue("CLOSED"),
});

const makeServer = (client: MockLastFmClient): FastifyInstance => {
  const server = Fastify({ logger: false });
  createLastFmLoveRoute(server, client);
  return server;
};

describe("POST /api/lastfm/love", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 when love succeeds", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    const client = makeMockClient();
    const server = makeServer(client);

    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/love",
      payload: { artist: "Madonna", track: "Like a Prayer" },
    });

    expect(response.statusCode).toBe(204);
    expect(client.love).toHaveBeenCalledWith({
      artist: "Madonna",
      track: "Like a Prayer",
      sessionKey: "sk",
      sharedSecret: "sec",
    });
  });

  it("returns 400 when no session configured", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: { ...makeBaseConfig(), lastFmSessionKey: undefined },
    });
    const client = makeMockClient();
    const server = makeServer(client);

    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/love",
      payload: { artist: "Madonna", track: "Like a Prayer" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when artist is missing", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    const client = makeMockClient();
    const server = makeServer(client);

    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/love",
      payload: { track: "Like a Prayer" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 502 when love fails", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    const client = makeMockClient();
    client.love.mockResolvedValue({
      ok: false,
      error: { type: "NetworkError", message: "down" },
    });
    const server = makeServer(client);

    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/love",
      payload: { artist: "Madonna", track: "Like a Prayer" },
    });

    expect(response.statusCode).toBe(502);
  });
});

describe("DELETE /api/lastfm/love", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 when unlove succeeds", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    const client = makeMockClient();
    const server = makeServer(client);

    const response = await server.inject({
      method: "DELETE",
      url: "/api/lastfm/love",
      payload: { artist: "Madonna", track: "Like a Prayer" },
    });

    expect(response.statusCode).toBe(204);
    expect(client.unlove).toHaveBeenCalledWith({
      artist: "Madonna",
      track: "Like a Prayer",
      sessionKey: "sk",
      sharedSecret: "sec",
    });
  });
});
