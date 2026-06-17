import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";

const querySchema = z.object({ q: z.string().min(1).max(100) });

export const createTagSearchRoute = (
  server: FastifyInstance,
  lastFmClient: LastFmClient,
): void => {
  server.get("/api/tags/search", async (request, reply) => {
    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: "Missing or invalid query parameter 'q'" });
    }
    const { q } = parseResult.data;

    const tagsResult = await lastFmClient.searchTags(q, 10);
    if (!tagsResult.ok) {
      return reply.status(503).send({ error: "Last.fm unavailable" });
    }

    return reply.status(200).send({ tags: tagsResult.value });
  });
};
