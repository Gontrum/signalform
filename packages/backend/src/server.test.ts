import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import Fastify from "fastify";
import { ok, err } from "@signalform/shared";
import type { AppConfig } from "./infrastructure/config/index.js";
import type {
  LmsClient,
  LmsConfig,
  PlayerStatus,
} from "./adapters/lms-client/index.js";

type MockLogger = {
  readonly log: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly info: ReturnType<typeof vi.fn>;
  readonly error: ReturnType<typeof vi.fn>;
};

type MockIo = {
  readonly close: ReturnType<typeof vi.fn>;
  readonly to: ReturnType<typeof vi.fn>;
  readonly sockets: { readonly sockets: ReadonlyMap<string, unknown> };
};

const isMockFunction = (value: unknown): value is ReturnType<typeof vi.fn> => {
  return typeof value === "function" && "mock" in value;
};

const isMockIo = (value: unknown): value is MockIo => {
  return (
    typeof value === "object" &&
    value !== null &&
    "close" in value &&
    "to" in value &&
    "sockets" in value &&
    isMockFunction(value.close) &&
    isMockFunction(value.to) &&
    typeof value.sockets === "object" &&
    value.sockets !== null &&
    "sockets" in value.sockets &&
    value.sockets.sockets instanceof Map
  );
};

const FRONTEND_DIST_FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  "__fixtures__/frontend-dist",
);

const writeFrontendDistFixture = async (): Promise<void> => {
  await rm(FRONTEND_DIST_FIXTURE_PATH, { recursive: true, force: true });
  await mkdir(path.join(FRONTEND_DIST_FIXTURE_PATH, "assets"), {
    recursive: true,
  });
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "index.html"),
    '<!DOCTYPE html><html><body><div id="app">Test app shell</div></body></html>',
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "manifest.json"),
    '{"name":"Signalform Test"}',
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "offline.html"),
    "<!DOCTYPE html><html><body>Offline test page</body></html>",
  );
  await writeFile(path.join(FRONTEND_DIST_FIXTURE_PATH, "favicon.ico"), "ico");
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "icon-192.png"),
    "icon192",
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "icon-512.png"),
    "icon512",
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "registerSW.js"),
    "console.log('register sw')",
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "sw.js"),
    "console.log('sw')",
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "workbox-test.js"),
    "console.log('workbox')",
  );
  await writeFile(
    path.join(FRONTEND_DIST_FIXTURE_PATH, "assets", "app.js"),
    "console.log('asset bundle')",
  );
};

const DEFAULT_APP_CONFIG: AppConfig = {
  lmsHost: "127.0.0.1",
  lmsPort: 9000,
  playerId: "aa:bb:cc:dd:ee:ff",
  lastFmApiKey: "lastfm-key",
  fanartApiKey: "fanart-key",
  language: "en",
};

const DEFAULT_LMS_CONFIG: LmsConfig = {
  host: DEFAULT_APP_CONFIG.lmsHost,
  port: DEFAULT_APP_CONFIG.lmsPort,
  playerId: DEFAULT_APP_CONFIG.playerId,
  timeout: 5000,
};

const createStatus = (label: string): PlayerStatus => ({
  mode: "stop",
  time: 0,
  duration: 0,
  volume: 50,
  currentTrack: {
    id: `${label}-track`,
    title: `${label} title`,
    artist: `${label} artist`,
    album: `${label} album`,
    url: `file:///${label}.flac`,
    source: "local",
    type: "track",
  },
  queuePreview: [],
});

const createMockLmsClient = (label: string): LmsClient => ({
  search: vi.fn(async () => ok([])),
  play: vi.fn(async () => ok(undefined)),
  pause: vi.fn(async () => ok(undefined)),
  resume: vi.fn(async () => ok(undefined)),
  getStatus: vi.fn(async () => ok(createStatus(label))),
  nextTrack: vi.fn(async () => ok(undefined)),
  previousTrack: vi.fn(async () => ok(undefined)),
  setVolume: vi.fn(async () => ok(undefined)),
  getVolume: vi.fn(async () => ok(50)),
  seek: vi.fn(async () => ok(undefined)),
  getCurrentTime: vi.fn(async () => ok(0)),
  playAlbum: vi.fn(async () => ok(undefined)),
  playTidalAlbum: vi.fn(async () => ok(undefined)),
  disableRepeat: vi.fn(async () => ok(undefined)),
  getAlbumTracks: vi.fn(async () => ok([])),
  getArtistAlbums: vi.fn(async () => ok([])),
  getArtistName: vi.fn(async () => ok(`${label} artist`)),
  getLibraryAlbums: vi.fn(async () => ok({ albums: [], count: 0 })),
  getQueue: vi.fn(async () => ok([])),
  jumpToTrack: vi.fn(async () => ok(undefined)),
  removeFromQueue: vi.fn(async () => ok(undefined)),
  moveQueueTrack: vi.fn(async () => ok(undefined)),
  addToQueue: vi.fn(async () => ok(undefined)),
  addAlbumToQueue: vi.fn(async () => ok(undefined)),
  addTidalAlbumToQueue: vi.fn(async () => ok(undefined)),
  getTidalAlbums: vi.fn(async () => ok({ albums: [], count: 0 })),
  getTidalAlbumTracks: vi.fn(async () => ok({ tracks: [], count: 0 })),
  getTidalArtistAlbums: vi.fn(async () => ok({ albums: [], count: 0 })),
  searchTidalArtists: vi.fn(async () => ok({ artists: [], count: 0 })),
  getTidalFeaturedAlbums: vi.fn(async () => ok({ albums: [], count: 0 })),
  findTidalSearchAlbumId: vi.fn(async () => ok(null)),
  rescanLibrary: vi.fn(async () => ok(undefined)),
  getRescanProgress: vi.fn(async () =>
    ok({
      scanning: false,
      step: "idle",
      info: "",
      totalTime: "00:00:00",
    }),
  ),
});

const loadConfigMock = vi.fn();
const createLoggerMock = vi.fn();
const createLmsClientMock = vi.fn();
const createLastFmClientMock = vi.fn();
const createCircuitBreakerLastFmClientMock = vi.fn();
const createFanartClientMock = vi.fn();
const setupWebSocketMock = vi.fn();
const startStatusPollingMock = vi.fn();
const createRadioEngineMock = vi.fn();
const createHealthRouteMock = vi.fn();
const createSearchRouteMock = vi.fn();
const createPlaybackRouteMock = vi.fn();
const createMetadataRouteMock = vi.fn();
const createLibraryRouteMock = vi.fn();
const createTidalAlbumsRouteMock = vi.fn();
const createTidalArtistsRouteMock = vi.fn();
const createQueueRouteMock = vi.fn();
const createEnrichmentRouteMock = vi.fn();
const createSetupRouteMock = vi.fn();
const createConfigRouteMock = vi.fn();
const registerFrontendDeliveryMock = vi.fn();

vi.mock("./infrastructure/config", () => ({
  loadConfig: loadConfigMock,
}));

vi.mock("./infrastructure/logger.js", () => ({
  createLogger: createLoggerMock,
}));

vi.mock("./adapters/lms-client", () => ({
  createLmsClient: createLmsClientMock,
}));

vi.mock("./adapters/lastfm-client", () => ({
  createLastFmClient: createLastFmClientMock,
  createCircuitBreakerLastFmClient: createCircuitBreakerLastFmClientMock,
}));

vi.mock("./adapters/fanart-client", () => ({
  createFanartClient: createFanartClientMock,
}));

vi.mock("./infrastructure/websocket", () => ({
  setupWebSocket: setupWebSocketMock,
  startStatusPolling: startStatusPollingMock,
}));

vi.mock("./features/radio-mode", () => ({
  createRadioEngine: createRadioEngineMock,
}));

vi.mock("./features/health", () => ({
  createHealthRoute: createHealthRouteMock,
}));

vi.mock("./features/search", () => ({
  createSearchRoute: createSearchRouteMock,
}));

vi.mock("./features/playback", () => ({
  createPlaybackRoute: createPlaybackRouteMock,
}));

vi.mock("./features/metadata", () => ({
  createMetadataRoute: createMetadataRouteMock,
}));

vi.mock("./features/library", () => ({
  createLibraryRoute: createLibraryRouteMock,
}));

vi.mock("./features/tidal-albums", () => ({
  createTidalAlbumsRoute: createTidalAlbumsRouteMock,
}));

vi.mock("./features/tidal-artists", () => ({
  createTidalArtistsRoute: createTidalArtistsRouteMock,
}));

vi.mock("./features/queue", () => ({
  createQueueRoute: createQueueRouteMock,
}));

vi.mock("./features/enrichment", () => ({
  createEnrichmentRoute: createEnrichmentRouteMock,
}));

vi.mock("./features/setup", () => ({
  createSetupRoute: createSetupRouteMock,
}));

vi.mock("./features/config", () => ({
  createConfigRoute: createConfigRouteMock,
}));

vi.mock("./infrastructure/frontend-delivery.js", async () => {
  const actual = await vi.importActual<
    typeof import("./infrastructure/frontend-delivery.js")
  >("./infrastructure/frontend-delivery.js");

  return {
    ...actual,
    registerFrontendDelivery: registerFrontendDeliveryMock,
  };
});

describe("createServer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    loadConfigMock.mockReturnValue(ok(DEFAULT_APP_CONFIG));

    const logger: MockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
    createLoggerMock.mockReturnValue(logger);

    createLmsClientMock.mockImplementation((config: LmsConfig) => {
      return createMockLmsClient(`${config.host}:${config.port}`);
    });

    const baseLastFmClient = {
      getSimilarTracks: vi.fn(),
      getSimilarArtists: vi.fn(),
      getArtistInfo: vi.fn(),
      getAlbumInfo: vi.fn(),
      getCircuitState: vi.fn(() => "CLOSED"),
    };
    createLastFmClientMock.mockReturnValue(baseLastFmClient);
    createCircuitBreakerLastFmClientMock.mockImplementation((client) => client);
    createFanartClientMock.mockReturnValue({ getArtistImages: vi.fn() });

    setupWebSocketMock.mockImplementation(
      (): MockIo => ({
        close: vi.fn((callback?: () => void) => callback?.()),
        to: vi.fn(() => ({ emit: vi.fn() })),
        sockets: { sockets: new Map() },
      }),
    );

    startStatusPollingMock.mockImplementation(() => vi.fn());
    createRadioEngineMock.mockReturnValue({
      handleQueueEnd: vi.fn(async () => undefined),
      setModeEnabled: vi.fn(async () => ({
        status: "success",
        queueProjection: {
          tracks: [],
          radioModeActive: true,
          radioBoundaryIndex: null,
        },
      })),
    });

    createConfigRouteMock.mockImplementation(() => undefined);
    registerFrontendDeliveryMock.mockResolvedValue(false);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { getLmsRegistry } = await import("./infrastructure/lms-registry.js");
    getLmsRegistry().stopAll();
  });

  it("wires route registration against proxy LMS dependencies", async () => {
    const { createServer } = await import("./server.js");

    const server = await createServer();
    await server.ready();

    expect(createHealthRouteMock).toHaveBeenCalledTimes(1);
    expect(createSearchRouteMock).toHaveBeenCalledTimes(1);
    expect(createMetadataRouteMock).toHaveBeenCalledTimes(1);
    expect(createPlaybackRouteMock).toHaveBeenCalledTimes(1);
    expect(createQueueRouteMock).toHaveBeenCalledTimes(1);
    expect(createConfigRouteMock).toHaveBeenCalledTimes(1);
    expect(registerFrontendDeliveryMock).toHaveBeenCalledTimes(1);

    const healthArgs = createHealthRouteMock.mock.calls[0];
    const searchArgs = createSearchRouteMock.mock.calls[0];
    const metadataArgs = createMetadataRouteMock.mock.calls[0];
    const queueArgs = createQueueRouteMock.mock.calls[0];

    expect(healthArgs).toBeDefined();
    expect(searchArgs).toBeDefined();
    expect(metadataArgs).toBeDefined();
    expect(queueArgs).toBeDefined();

    const lmsProxy = healthArgs?.[1];
    const lmsConfigProxy = metadataArgs?.[2];
    const radioController = queueArgs?.[4];

    expect(healthArgs?.[0]).toBe(server);
    expect(searchArgs?.[0]).toBe(server);
    expect(metadataArgs?.[0]).toBe(server);
    expect(createLmsClientMock).toHaveBeenCalledWith(DEFAULT_LMS_CONFIG);
    expect(lmsProxy).toBeDefined();
    expect(lmsConfigProxy).toBeDefined();
    expect(radioController).toBeDefined();

    if (!lmsProxy || !lmsConfigProxy || !radioController) {
      return;
    }

    expect(radioController).toEqual(
      expect.objectContaining({
        handleRemoval: expect.any(Function),
        setModeEnabled: expect.any(Function),
      }),
    );

    await lmsProxy.getStatus();

    const firstClientResult = createLmsClientMock.mock.results[0];
    expect(firstClientResult).toBeDefined();
    const firstClient = firstClientResult?.value;
    expect(firstClient).toBeDefined();

    if (!firstClient) {
      return;
    }

    expect(firstClient.getStatus).toHaveBeenCalledTimes(1);
    expect(lmsConfigProxy.host).toBe(DEFAULT_APP_CONFIG.lmsHost);
  });

  it("reloads the registry through the config save callback and preserves proxy indirection", async () => {
    const { createServer } = await import("./server.js");

    await createServer();

    const healthArgs = createHealthRouteMock.mock.calls[0];
    const metadataArgs = createMetadataRouteMock.mock.calls[0];
    const configArgs = createConfigRouteMock.mock.calls[0];

    expect(healthArgs).toBeDefined();
    expect(metadataArgs).toBeDefined();
    expect(configArgs).toBeDefined();

    const lmsProxy = healthArgs?.[1];
    const lmsConfigProxy = metadataArgs?.[2];
    const onConfigSaved = configArgs?.[1];

    expect(lmsProxy).toBeDefined();
    expect(lmsConfigProxy).toBeDefined();
    expect(onConfigSaved).toBeTypeOf("function");

    if (!lmsProxy || !lmsConfigProxy || typeof onConfigSaved !== "function") {
      return;
    }

    const reloadedConfig: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      lmsHost: "192.168.1.55",
      lmsPort: 9090,
      playerId: "11:22:33:44:55:66",
    };

    onConfigSaved(reloadedConfig);
    await lmsProxy.getStatus();

    expect(createLmsClientMock).toHaveBeenNthCalledWith(2, {
      host: reloadedConfig.lmsHost,
      port: reloadedConfig.lmsPort,
      playerId: reloadedConfig.playerId,
      timeout: 5000,
    });

    const reloadedClientResult = createLmsClientMock.mock.results[1];
    expect(reloadedClientResult).toBeDefined();
    const reloadedClient = reloadedClientResult?.value;
    expect(reloadedClient).toBeDefined();

    if (!reloadedClient) {
      return;
    }

    expect(reloadedClient.getStatus).toHaveBeenCalledTimes(1);
    expect(lmsConfigProxy.host).toBe(reloadedConfig.lmsHost);
    expect(lmsConfigProxy.port).toBe(reloadedConfig.lmsPort);
    expect(startStatusPollingMock).toHaveBeenCalledTimes(2);

    const firstStopPollingResult = startStatusPollingMock.mock.results[0];
    expect(firstStopPollingResult).toBeDefined();
    const firstStopPolling = firstStopPollingResult?.value;
    expect(firstStopPolling).toBeDefined();

    if (!firstStopPolling) {
      return;
    }

    expect(firstStopPolling).toHaveBeenCalledTimes(1);
  });

  it("uses the latest persisted language for enrichment routes", async () => {
    const { createServer } = await import("./server.js");

    await createServer();

    const enrichmentArgs = createEnrichmentRouteMock.mock.calls[0];

    expect(enrichmentArgs).toBeDefined();

    const proxiedConfig = enrichmentArgs?.[3];

    expect(proxiedConfig).toBeDefined();

    if (!proxiedConfig) {
      return;
    }

    expect(proxiedConfig.language).toBe("en");

    loadConfigMock.mockReturnValue(
      ok({
        ...DEFAULT_APP_CONFIG,
        language: "de",
      }),
    );

    expect(proxiedConfig.language).toBe("de");
  });

  it("stops active polling and closes the websocket server on shutdown", async () => {
    const { createServer } = await import("./server.js");

    const server = await createServer();
    await server.close();

    const stopPollingResult = startStatusPollingMock.mock.results[0];
    const ioResult = setupWebSocketMock.mock.results[0];

    expect(stopPollingResult).toBeDefined();
    expect(ioResult).toBeDefined();

    const stopPolling = stopPollingResult?.value;
    const io = isMockIo(ioResult?.value) ? ioResult.value : undefined;

    expect(stopPolling).toBeDefined();
    expect(io).toBeDefined();

    if (!stopPolling || !io) {
      return;
    }

    expect(stopPolling).toHaveBeenCalledTimes(1);
    expect(io.close).toHaveBeenCalledTimes(1);
  });

  it("falls back to environment defaults when persisted config fails to load", async () => {
    loadConfigMock.mockReturnValue(
      err({ type: "PARSE_ERROR", message: "bad config" }),
    );
    vi.stubEnv("LMS_HOST", "env-host");
    vi.stubEnv("LMS_PORT", "1234");
    vi.stubEnv("LMS_PLAYER_ID", "ff:ee:dd:cc:bb:aa");
    vi.stubEnv("LASTFM_API_KEY", "env-lastfm");
    vi.stubEnv("FANART_API_KEY", "env-fanart");

    const { createServer } = await import("./server.js");

    await createServer();

    expect(createLmsClientMock).toHaveBeenCalledWith({
      host: "env-host",
      port: 1234,
      playerId: "ff:ee:dd:cc:bb:aa",
      timeout: 5000,
    });
    expect(createLastFmClientMock).toHaveBeenCalledWith({
      apiKey: "env-lastfm",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    expect(createFanartClientMock).toHaveBeenCalledWith("env-fanart");
  });
});

describe("registerFrontendDelivery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("./infrastructure/frontend-delivery.js");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(FRONTEND_DIST_FIXTURE_PATH, { recursive: true, force: true });
  });

  it("serves the built app shell, assets, and SPA deep links without swallowing reserved backend paths", async () => {
    await writeFrontendDistFixture();
    vi.stubEnv("SIGNALFORM_FRONTEND_DIST_PATH", FRONTEND_DIST_FIXTURE_PATH);

    const { registerFrontendDelivery } =
      await import("./infrastructure/frontend-delivery.js");

    const server = Fastify();
    await registerFrontendDelivery(server);
    await server.ready();

    const rootResponse = await server.inject({ method: "GET", url: "/" });
    const deepLinkResponse = await server.inject({
      method: "GET",
      url: "/queue/edit-session",
    });
    const assetResponse = await server.inject({
      method: "GET",
      url: "/assets/app.js",
    });
    const manifestResponse = await server.inject({
      method: "GET",
      url: "/manifest.json",
    });
    const offlineResponse = await server.inject({
      method: "GET",
      url: "/offline.html",
    });
    const healthResponse = await server.inject({
      method: "GET",
      url: "/health",
    });
    const socketHandshakeResponse = await server.inject({
      method: "GET",
      url: "/socket.io/",
    });
    const missingApiResponse = await server.inject({
      method: "GET",
      url: "/api/not-a-real-route",
    });

    expect(rootResponse.statusCode).toBe(200);
    expect(rootResponse.headers["content-type"]).toContain("text/html");
    expect(rootResponse.headers["cache-control"] ?? "").toContain("max-age=0");
    expect(rootResponse.body).toContain("Test app shell");

    expect(deepLinkResponse.statusCode).toBe(200);
    expect(deepLinkResponse.headers["content-type"]).toContain("text/html");
    expect(deepLinkResponse.body).toContain("Test app shell");

    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.body).toContain("asset bundle");

    expect(manifestResponse.statusCode).toBe(200);
    expect(manifestResponse.body).toContain("Signalform Test");

    expect(offlineResponse.statusCode).toBe(200);
    expect(offlineResponse.body).toContain("Offline test page");

    expect(healthResponse.statusCode).toBe(404);
    expect(healthResponse.headers["content-type"] ?? "").not.toContain(
      "text/html",
    );

    expect(socketHandshakeResponse.statusCode).toBe(404);
    expect(socketHandshakeResponse.headers["content-type"] ?? "").not.toContain(
      "text/html",
    );

    expect(missingApiResponse.statusCode).toBe(404);
    expect(missingApiResponse.headers["content-type"] ?? "").not.toContain(
      "text/html",
    );

    await server.close();
  });

  it("skips frontend delivery when the build output is missing", async () => {
    const missingDistPath = path.resolve(
      import.meta.dirname,
      "__fixtures__/frontend-dist-missing",
    );
    await rm(missingDistPath, { recursive: true, force: true });
    vi.stubEnv("SIGNALFORM_FRONTEND_DIST_PATH", missingDistPath);

    const { createServer } = await import("./server.js");

    const server = await createServer();
    await server.ready();

    const rootResponse = await server.inject({ method: "GET", url: "/" });

    expect(rootResponse.statusCode).toBe(404);
    expect(rootResponse.headers["content-type"] ?? "").not.toContain(
      "text/html",
    );

    await server.close();
  });
});
