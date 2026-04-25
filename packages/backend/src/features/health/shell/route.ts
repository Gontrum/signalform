/**
 * Health Route — Imperative Shell
 *
 * Registers GET /health and delegates to health service (functional core).
 * Replaces the inline handler in server.ts.
 */

import type { FastifyInstance } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import { checkHealth } from "../core/service.js";

import type { LastFmHealthClient, LmsHealthClient } from "../core/service.js";

const createHealthProbeClient = (lmsClient: LmsClient): LmsHealthClient => {
  return {
    getStatus: async (): Promise<{ readonly ok: boolean }> => {
      const result = await lmsClient.getCurrentTime();
      return { ok: result.ok };
    },
  };
};

const createLastFmHealthClient = (
  lastFmClient: LastFmClient,
): LastFmHealthClient => {
  return {
    getCircuitState: () => lastFmClient.getCircuitState(),
  };
};

export const createHealthRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  fastify.get("/health", async (_request, reply) => {
    const result = await checkHealth(
      createHealthProbeClient(lmsClient),
      createLastFmHealthClient(lastFmClient),
    );
    const { httpStatus, ...body } = result;
    await reply.status(httpStatus).send(body);
  });
};
