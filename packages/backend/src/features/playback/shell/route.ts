/**
 * Playback Route Orchestrator
 *
 * Registers all /api/playback/* endpoints by delegating to focused
 * sub-route modules:
 *
 *   transport-routes  — play, pause, resume, next, previous
 *   tidal-routes      — play-album, play-tidal-search-album, play-track-list
 *   status-routes     — volume, seek, time, cover, status
 */

import type { FastifyInstance } from "fastify";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import { registerTransportRoutes } from "./transport-routes.js";
import { registerTidalRoutes } from "./tidal-routes.js";
import { registerStatusRoutes } from "./status-routes.js";

export const createPlaybackRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  lmsConfig: LmsConfig,
  io: TypedSocketIOServer,
  playerId: string,
): void => {
  registerTransportRoutes(fastify, lmsClient);
  registerTidalRoutes(fastify, lmsClient, io, playerId);
  registerStatusRoutes(fastify, lmsClient, lmsConfig);
};
