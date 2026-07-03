/**
 * Health Route — Imperative Shell
 *
 * Registers GET /health. Performs the I/O (probes LMS via getCurrentTime,
 * reads the Last.fm circuit state) and delegates evaluation to the pure
 * health core (toLmsStatus / toLastFmStatus / evaluateHealth).
 */

import type { FastifyInstance } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import {
  evaluateHealth,
  toLastFmStatus,
  toLmsStatus,
} from "../core/service.js";

export const createHealthRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  fastify.get("/health", async (_request, reply) => {
    const probe = await lmsClient.getCurrentTime();
    const state = lastFmClient.getCircuitState();
    const result = evaluateHealth(toLmsStatus(probe.ok), toLastFmStatus(state));
    const { httpStatus, ...body } = result;
    await reply.status(httpStatus).send(body);
  });
};
