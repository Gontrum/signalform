import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import { mapTidalArtistAlbums, mapTidalArtistSearch } from "../core/service.js";

const TidalArtistAlbumsParamsSchema = z.object({
  artistId: z.string().trim().min(1, "Artist ID is required"),
});

const TidalArtistAlbumsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(250),
  offset: z.coerce.number().int().min(0).default(0),
});

const TidalArtistSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required"),
});

export const createTidalArtistsRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
): void => {
  fastify.get<{ readonly Params: unknown; readonly Querystring: unknown }>(
    "/api/tidal/artists/:artistId/albums",
    async (
      request: FastifyRequest<{
        readonly Params: unknown;
        readonly Querystring: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      const paramsValidation = TidalArtistAlbumsParamsSchema.safeParse(
        request.params,
      );
      if (!paramsValidation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid artist ID", code: "INVALID_INPUT" });
      }

      const queryValidation = TidalArtistAlbumsQuerySchema.safeParse(
        request.query,
      );
      if (!queryValidation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid query parameters", code: "INVALID_INPUT" });
      }

      const { artistId } = paramsValidation.data;
      const { limit, offset } = queryValidation.data;

      const result = await lmsClient.getTidalArtistAlbums(
        artistId,
        offset,
        limit,
      );

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      const baseUrl = `http://${config.host}:${config.port}`;
      const response = mapTidalArtistAlbums(
        artistId,
        result.value.albums,
        result.value.count,
        baseUrl,
      );

      return reply.code(200).send(response);
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/tidal/artists/search",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const queryValidation = TidalArtistSearchQuerySchema.safeParse(
        request.query,
      );
      if (!queryValidation.success) {
        return reply
          .code(400)
          .send({ message: "Search query is required", code: "INVALID_INPUT" });
      }

      const { q } = queryValidation.data;

      const result = await lmsClient.searchTidalArtists(q, 0, 10);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      const baseUrl = `http://${config.host}:${config.port}`;
      const response = mapTidalArtistSearch(
        result.value.artists,
        result.value.count,
        baseUrl,
      );

      return reply.code(200).send(response);
    },
  );
};
