/**
 * Imperative Shell state for the active listener — the user whose Last.fm
 * account receives scrobbles.
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */
// ponytail: in-memory, persist to config if restarts annoy

import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { shouldClaimListener } from "../core/service.js";

const CLAIM_PATHS: readonly string[] = [
  "/api/playback/play",
  "/api/playback/resume",
  "/api/playback/play-album",
  "/api/playback/play-track-list",
  "/api/playback/play-tidal-search-album",
  "/api/queue/jump",
  "/api/artist-radio/start",
  "/api/genre-radio/start",
  "/api/personal-radio/start",
];

type ActiveListenerState = {
  readonly get: () => string | undefined;
  readonly set: (id: string | undefined) => void;
};

const createActiveListenerState = (): ActiveListenerState => {
  const ref = { current: undefined as string | undefined };
  return {
    get: (): string | undefined => ref.current,
    set: (id: string | undefined): void => {
      ref.current = id;
    },
  };
};

const activeListenerState = createActiveListenerState();

export const getActiveListenerId = (): string | undefined =>
  activeListenerState.get();

export const setActiveListenerId = (id: string | undefined): void => {
  activeListenerState.set(id);
};

/** Test helper — clears the active listener between test cases. */
export const resetActiveListener = (): void => {
  activeListenerState.set(undefined);
};

/**
 * Claims the active listener slot for the requesting user whenever a
 * playback-starting POST succeeds with a valid `x-signalform-user` header.
 */
export const registerActiveListenerClaim = (server: FastifyInstance): void => {
  void server.addHook("onResponse", async (request, reply) => {
    // Cheap guard so the sync config read does not run on every response.
    // The full claim decision still lives in shouldClaimListener.
    if (request.method !== "POST") {
      return;
    }

    const configResult = loadConfig();
    if (!configResult.ok) {
      return;
    }

    const headerValue = request.headers["x-signalform-user"];
    const id = shouldClaimListener({
      method: request.method,
      statusCode: reply.statusCode,
      path: request.url,
      headerValue: typeof headerValue === "string" ? headerValue : undefined,
      users: configResult.value.users,
      claimPaths: CLAIM_PATHS,
    });

    if (id !== undefined) {
      setActiveListenerId(id);
    }
  });
};
