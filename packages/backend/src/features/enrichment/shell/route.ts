import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { FanartClient } from "../../../adapters/fanart-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";
import {
  getAlbumEnrichment,
  getArtistEnrichment,
  getSimilarArtistsEnrichment,
} from "./enrichment-service.js";
import {
  getCachedAlbum,
  getCachedArtist,
  getCachedSimilarArtists,
  setCachedAlbum,
  setCachedArtist,
  setCachedSimilarArtists,
} from "./cache.js";

const ArtistQuerySchema = z.object({
  name: z.string().trim().min(1, "Artist name is required"),
});

const SimilarArtistsQuerySchema = z.object({
  name: z.string().trim().min(1, "Artist name is required"),
  limit: z.coerce.number().int().min(1).max(6).default(6),
});

const AlbumQuerySchema = z.object({
  artist: z.string().trim().min(1, "Artist name is required"),
  album: z.string().trim().min(1, "Album name is required"),
});

export const createEnrichmentRoute = (
  fastify: FastifyInstance,
  lastFmClient: LastFmClient,
  fanartClient: FanartClient,
  appConfig: Pick<AppConfig, "language">,
): void => {
  // NOTE: /api/enrichment/artist/images must be registered BEFORE
  // /api/enrichment/artist to avoid the more-specific path being shadowed.

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/enrichment/artist/images",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ArtistQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Artist name is required", code: "MISSING_PARAM" });
      }

      const { name } = validation.data;
      const language = appConfig.language;

      const cachedEnrichment = getCachedArtist(name, language);
      const mbid = await (async (): Promise<string | undefined> => {
        if (cachedEnrichment) {
          return cachedEnrichment.mbid;
        }

        const enrichResult = await getArtistEnrichment(
          name,
          lastFmClient,
          language,
        );
        if (enrichResult.ok) {
          setCachedArtist(name, language, enrichResult.value);
          return enrichResult.value.mbid;
        }
        return undefined;
      })();

      if (!mbid) {
        return reply.code(200).send({ imageUrl: null });
      }

      const imageResult = await fanartClient.getArtistImages(mbid);
      if (!imageResult.ok) {
        return reply.code(200).send({ imageUrl: null });
      }

      return reply.code(200).send({ imageUrl: imageResult.value });
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/enrichment/artist/similar",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = SimilarArtistsQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Artist name is required", code: "MISSING_PARAM" });
      }

      const { name, limit } = validation.data;
      const language = appConfig.language;

      const cached = getCachedSimilarArtists(name, language);
      if (cached) {
        return reply.code(200).send(cached);
      }

      const result = await getSimilarArtistsEnrichment(
        name,
        lastFmClient,
        limit,
      );

      if (!result.ok) {
        if (result.error.type === "NotFound") {
          return reply
            .code(404)
            .send({ message: result.error.message, code: "NOT_FOUND" });
        }
        return reply.code(503).send({
          message: result.error.message,
          code: "LAST_FM_UNAVAILABLE",
        });
      }

      setCachedSimilarArtists(name, language, result.value);
      return reply.code(200).send(result.value);
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/enrichment/artist",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ArtistQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Artist name is required", code: "MISSING_PARAM" });
      }

      const { name } = validation.data;
      const language = appConfig.language;

      const cached = getCachedArtist(name, language);
      if (cached) {
        return reply.code(200).send(cached);
      }

      const result = await getArtistEnrichment(name, lastFmClient, language);

      if (!result.ok) {
        if (result.error.type === "NotFound") {
          return reply
            .code(404)
            .send({ message: result.error.message, code: "NOT_FOUND" });
        }
        return reply.code(503).send({
          message: result.error.message,
          code: "LAST_FM_UNAVAILABLE",
        });
      }

      setCachedArtist(name, language, result.value);
      return reply.code(200).send(result.value);
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/enrichment/album",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = AlbumQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.code(400).send({
          message: "Artist and album are required",
          code: "MISSING_PARAM",
        });
      }

      const { artist, album } = validation.data;
      const language = appConfig.language;

      const cached = getCachedAlbum(artist, album, language);
      if (cached) {
        return reply.code(200).send(cached);
      }

      const result = await getAlbumEnrichment(
        artist,
        album,
        lastFmClient,
        language,
      );

      if (!result.ok) {
        if (result.error.type === "NotFound") {
          return reply
            .code(404)
            .send({ message: result.error.message, code: "NOT_FOUND" });
        }
        return reply.code(503).send({
          message: result.error.message,
          code: "LAST_FM_UNAVAILABLE",
        });
      }

      setCachedAlbum(artist, album, language, result.value);
      return reply.code(200).send(result.value);
    },
  );
};
