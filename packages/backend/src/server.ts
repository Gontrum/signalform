import Fastify, { type FastifyInstance } from "fastify";
import { createLogger } from "./infrastructure/logger.js";
import {
  createLastFmClient,
  createCircuitBreakerLastFmClient,
} from "./adapters/lastfm-client/index.js";
import { createSearchRoute } from "./features/search/index.js";
import { createHealthRoute } from "./features/health/index.js";
import { createPlaybackRoute } from "./features/playback/index.js";
import { createMetadataRoute } from "./features/metadata/index.js";
import { createLibraryRoute } from "./features/library/index.js";
import { createTidalAlbumsRoute } from "./features/tidal-albums/index.js";
import { createTidalArtistsRoute } from "./features/tidal-artists/index.js";
import { createQueueRoute } from "./features/queue/index.js";
import {
  setupWebSocket,
  startStatusPolling,
} from "./infrastructure/websocket/index.js";
import { createRadioEngine } from "./features/radio-mode/index.js";
import { createEnrichmentRoute } from "./features/enrichment/index.js";
import { createFanartClient } from "./adapters/fanart-client/index.js";
import { createSetupRoute } from "./features/setup/index.js";
import { createConfigRoute } from "./features/config/index.js";
import { loadConfig } from "./infrastructure/config/index.js";
import type { AppConfig } from "./infrastructure/config/index.js";
import { getLmsRegistry } from "./infrastructure/lms-registry.js";
import type { LmsClient, LmsConfig } from "./adapters/lms-client/index.js";
import { registerFrontendDelivery } from "./infrastructure/frontend-delivery.js";

const forwardLmsCall = <TArgs extends readonly unknown[], TResult>(
  select: (client: LmsClient) => (...args: TArgs) => TResult,
) => {
  return (...args: TArgs): TResult => {
    return select(getLmsRegistry().getLmsClient())(...args);
  };
};

const createLmsProxy = (): LmsClient => {
  return {
    search: forwardLmsCall((client) => client.search),
    play: forwardLmsCall((client) => client.play),
    pause: forwardLmsCall((client) => client.pause),
    resume: forwardLmsCall((client) => client.resume),
    getStatus: forwardLmsCall((client) => client.getStatus),
    nextTrack: forwardLmsCall((client) => client.nextTrack),
    previousTrack: forwardLmsCall((client) => client.previousTrack),
    setVolume: forwardLmsCall((client) => client.setVolume),
    getVolume: forwardLmsCall((client) => client.getVolume),
    seek: forwardLmsCall((client) => client.seek),
    getCurrentTime: forwardLmsCall((client) => client.getCurrentTime),
    playAlbum: forwardLmsCall((client) => client.playAlbum),
    playTidalAlbum: forwardLmsCall((client) => client.playTidalAlbum),
    disableRepeat: forwardLmsCall((client) => client.disableRepeat),
    getAlbumTracks: forwardLmsCall((client) => client.getAlbumTracks),
    getArtistAlbums: forwardLmsCall((client) => client.getArtistAlbums),
    getArtistName: forwardLmsCall((client) => client.getArtistName),
    getLibraryAlbums: forwardLmsCall((client) => client.getLibraryAlbums),
    getQueue: forwardLmsCall((client) => client.getQueue),
    jumpToTrack: forwardLmsCall((client) => client.jumpToTrack),
    removeFromQueue: forwardLmsCall((client) => client.removeFromQueue),
    moveQueueTrack: forwardLmsCall((client) => client.moveQueueTrack),
    addToQueue: forwardLmsCall((client) => client.addToQueue),
    addAlbumToQueue: forwardLmsCall((client) => client.addAlbumToQueue),
    addTidalAlbumToQueue: forwardLmsCall(
      (client) => client.addTidalAlbumToQueue,
    ),
    getTidalAlbums: forwardLmsCall((client) => client.getTidalAlbums),
    getTidalAlbumTracks: forwardLmsCall((client) => client.getTidalAlbumTracks),
    getTidalArtistAlbums: forwardLmsCall(
      (client) => client.getTidalArtistAlbums,
    ),
    searchTidalArtists: forwardLmsCall((client) => client.searchTidalArtists),
    getTidalFeaturedAlbums: forwardLmsCall(
      (client) => client.getTidalFeaturedAlbums,
    ),
    findTidalSearchAlbumId: forwardLmsCall(
      (client) => client.findTidalSearchAlbumId,
    ),
    rescanLibrary: forwardLmsCall((client) => client.rescanLibrary),
    getRescanProgress: forwardLmsCall((client) => client.getRescanProgress),
  };
};

const createLmsConfigProxy = (): LmsConfig => {
  return {
    get host(): string {
      return getLmsRegistry().getLmsConfig().host;
    },
    get port(): number {
      return getLmsRegistry().getLmsConfig().port;
    },
    get playerId(): string {
      return getLmsRegistry().getLmsConfig().playerId;
    },
    get timeout(): number {
      return getLmsRegistry().getLmsConfig().timeout;
    },
    get retryBaseDelayMs(): number | undefined {
      return getLmsRegistry().getLmsConfig().retryBaseDelayMs;
    },
  };
};

const createLastFmConfig = (
  appConfig: AppConfig,
): {
  readonly apiKey: string;
  readonly timeout: number;
  readonly baseUrl: string;
  readonly language: AppConfig["language"];
} => ({
  apiKey: appConfig.lastFmApiKey,
  timeout: 5000,
  baseUrl: "https://ws.audioscrobbler.com/2.0/",
  language: appConfig.language,
});

const warnForMissingOptionalApiKeys = (
  logger: ReturnType<typeof createLogger>,
  appConfig: AppConfig,
): void => {
  if (!appConfig.lastFmApiKey) {
    logger.warn(
      "LASTFM_API_KEY is not set — last.fm features will fail with ApiError on all calls",
      { event: "config.lastfm_api_key_missing" },
    );
  }

  if (!appConfig.fanartApiKey) {
    logger.warn(
      "FANART_API_KEY is not set — artist hero images will be unavailable",
      { event: "config.fanart_api_key_missing" },
    );
  }
};

const createLanguageConfigProxy = (
  getLanguage: () => AppConfig["language"],
): Pick<AppConfig, "language"> => ({
  get language(): AppConfig["language"] {
    return getLanguage();
  },
});

type FastifyLogRecord = {
  readonly level: number;
  readonly msg: string;
} & Readonly<Record<string, unknown>>;

const isFastifyLogRecord = (value: unknown): value is FastifyLogRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "level" in value &&
    typeof value.level === "number" &&
    "msg" in value &&
    typeof value.msg === "string"
  );
};

const parseFastifyLogMessage = (
  logger: ReturnType<typeof createLogger>,
  msg: string,
): void => {
  const rawParsed: unknown = JSON.parse(msg);
  if (!isFastifyLogRecord(rawParsed)) {
    logger.log("info", msg, {});
    return;
  }

  const { level, msg: message, ...meta } = rawParsed;

  if (level >= 50) {
    logger.log("error", message, meta);
    return;
  }
  if (level >= 40) {
    logger.log("warn", message, meta);
    return;
  }
  logger.log("info", message, meta);
};

const fallbackConfigFromEnv = (): AppConfig => ({
  lmsHost: process.env["LMS_HOST"] || "localhost",
  lmsPort: Number(process.env["LMS_PORT"]) || 9000,
  playerId: process.env["LMS_PLAYER_ID"] || "00:00:00:00:00:00",
  lastFmApiKey: process.env["LASTFM_API_KEY"] ?? "",
  fanartApiKey: process.env["FANART_API_KEY"] ?? "",
  language: "en",
});

export const createServer = async (): Promise<FastifyInstance> => {
  const logger = createLogger();

  const server = Fastify({
    logger: {
      level: "info",
      stream: {
        /* v8 ignore start - Fastify logger adapter, tested via integration */
        write: (msg: string): void => {
          parseFastifyLogMessage(logger, msg);
        },
        /* v8 ignore stop */
      },
    },
  });

  const configResult = loadConfig();
  const appConfig: AppConfig = configResult.ok
    ? configResult.value
    : fallbackConfigFromEnv();

  const io = setupWebSocket(server);
  const lastFmClient = createCircuitBreakerLastFmClient(
    createLastFmClient(createLastFmConfig(appConfig)),
    {
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    },
  );
  const fanartClient = createFanartClient(appConfig.fanartApiKey);
  warnForMissingOptionalApiKeys(logger, appConfig);

  const lmsProxy = createLmsProxy();
  const lmsConfigProxy = createLmsConfigProxy();
  const languageConfigProxy = createLanguageConfigProxy(() => {
    const currentConfigResult = loadConfig();
    if (currentConfigResult.ok) {
      return currentConfigResult.value.language;
    }
    return appConfig.language;
  });

  const radioEngine = createRadioEngine(
    lmsProxy,
    lastFmClient,
    io,
    appConfig.playerId || "00:00:00:00:00:00",
    logger,
  );

  const registry = getLmsRegistry();
  registry.init(
    appConfig,
    (client, config) =>
      startStatusPolling(
        io,
        client,
        server,
        config.playerId,
        1000,
        radioEngine.handleQueueEnd,
      ),
    server,
  );

  createHealthRoute(server, lmsProxy, lastFmClient);
  createSearchRoute(server, lmsProxy);
  createMetadataRoute(server, lmsProxy, lmsConfigProxy);
  createEnrichmentRoute(
    server,
    lastFmClient,
    fanartClient,
    languageConfigProxy,
  );
  createSetupRoute(server);
  createLibraryRoute(server, lmsProxy, lmsConfigProxy);
  createTidalAlbumsRoute(server, lmsProxy, lmsConfigProxy);
  createTidalArtistsRoute(server, lmsProxy, lmsConfigProxy);
  createPlaybackRoute(server, lmsProxy, lmsConfigProxy, io, appConfig.playerId);
  createQueueRoute(server, lmsProxy, io, appConfig.playerId, {
    handleRemoval: async ({ removedTrack, preservedRadioBoundaryIndex }) => {
      const result = await radioEngine.replenishAfterRemoval(
        removedTrack.artist,
        removedTrack.title,
      );
      if (result.status === "success") {
        return {
          status: "success",
          tracks: result.postQueueTracks,
          radioBoundaryIndex:
            preservedRadioBoundaryIndex ?? result.preRadioQueueLength,
          tracksAdded: result.tracksAdded,
        } as const;
      }
      return result;
    },
    setModeEnabled: radioEngine.setModeEnabled,
  });

  createConfigRoute(server, (newConfig: AppConfig) => {
    registry.reload(newConfig);
  });

  void server.addHook("onClose", async () => {
    registry.stopAll();
    void io.close(() => {
      logger.info("WebSocket server closed", {
        event: "server.websocket_closed",
      });
    });
  });

  await registerFrontendDelivery(server);

  return server;
};
