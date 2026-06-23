import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadConfig } from "../../../infrastructure/config/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";

const LoveBodySchema = z.object({
  artist: z.string().min(1),
  track: z.string().min(1),
});

export const createLastFmLoveRoute = (
  server: FastifyInstance,
  lastFmClient: LastFmClient,
): void => {
  server.post<{ readonly Body: unknown }>(
    "/api/lastfm/love",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = LoveBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const { lastFmSessionKey, lastFmSharedSecret } = configResult.value;
      if (!lastFmSessionKey || !lastFmSharedSecret) {
        return reply.code(400).send({ error: "No Last.fm session configured" });
      }

      const result = await lastFmClient.love({
        artist: validation.data.artist,
        track: validation.data.track,
        sessionKey: lastFmSessionKey,
        sharedSecret: lastFmSharedSecret,
      });

      if (!result.ok) {
        return reply
          .code(502)
          .send({ error: "Failed to love track on Last.fm" });
      }

      return reply.code(204).send();
    },
  );

  server.delete<{ readonly Body: unknown }>(
    "/api/lastfm/love",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = LoveBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const { lastFmSessionKey, lastFmSharedSecret } = configResult.value;
      if (!lastFmSessionKey || !lastFmSharedSecret) {
        return reply.code(400).send({ error: "No Last.fm session configured" });
      }

      const result = await lastFmClient.unlove({
        artist: validation.data.artist,
        track: validation.data.track,
        sessionKey: lastFmSessionKey,
        sharedSecret: lastFmSharedSecret,
      });

      if (!result.ok) {
        return reply
          .code(502)
          .send({ error: "Failed to unlove track on Last.fm" });
      }

      return reply.code(204).send();
    },
  );
};
