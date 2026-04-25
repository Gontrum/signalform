import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { discoverLmsServers, fetchLmsPlayers } from "./discovery.js";

const PlayersQuerySchema = z.object({
  host: z.string().min(1, "host is required"),
  port: z.coerce.number().int().min(1).max(65535).optional().default(9000),
});

export const createSetupRoute = (server: FastifyInstance): void => {
  server.get(
    "/api/setup/discover",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const startMs = Date.now();

      const configResult = loadConfig();
      const extraHosts =
        configResult.ok && configResult.value.lmsHost
          ? [configResult.value.lmsHost]
          : [];

      server.log.info(
        { event: "setup_discovery_scan", extraHosts },
        "LMS discovery scan started",
      );

      const result = await discoverLmsServers(2000, extraHosts);
      const durationMs = Date.now() - startMs;

      if (!result.ok) {
        server.log.warn(
          { event: "setup_discovery_failed", error: result.error, durationMs },
          "LMS discovery scan failed",
        );
        return reply.code(200).send({ servers: [] });
      }

      server.log.info(
        {
          event: "setup_discovery_results",
          count: result.value.length,
          durationMs,
        },
        "LMS discovery scan completed",
      );

      return reply.code(200).send({ servers: result.value });
    },
  );

  server.get<{ readonly Querystring: unknown }>(
    "/api/setup/players",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = PlayersQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.code(400).send({
          message: "host is required",
          code: "MISSING_PARAM",
        });
      }

      const { host, port } = validation.data;
      const result = await fetchLmsPlayers(host, port);

      if (!result.ok) {
        server.log.warn(
          { event: "setup_players_failed", host, port, error: result.error },
          "Failed to fetch LMS players",
        );
        return reply.code(502).send({
          message: `Could not connect to LMS at ${host}:${port}`,
          code: "LMS_UNREACHABLE",
        });
      }

      return reply.code(200).send({ players: result.value });
    },
  );
};
