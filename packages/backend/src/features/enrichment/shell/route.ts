import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { FanartClient } from "../../../adapters/fanart-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  AppConfig,
  Language,
} from "../../../infrastructure/config/index.js";
import type { EnrichmentError } from "../core/types.js";
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

/**
 * Validates the shared `?name=` artist query and resolves the configured
 * language. Sends the 400 response itself and returns `undefined` on
 * failure — shared by the images and artist-detail routes below.
 */
const resolveArtistQuery = (
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
  appConfig: Pick<AppConfig, "language">,
): { readonly name: string; readonly language: Language } | undefined => {
  const validation = ArtistQuerySchema.safeParse(request.query);
  if (!validation.success) {
    reply
      .code(400)
      .send({ message: "Artist name is required", code: "MISSING_PARAM" });
    return undefined;
  }

  return { name: validation.data.name, language: appConfig.language };
};

/**
 * Resolves the shared artist query and its cached enrichment entry in one
 * step. Sends the 400 response itself (via `resolveArtistQuery`) and
 * returns `undefined` on failure — shared by the images and artist-detail
 * routes below.
 */
const resolveArtistWithCache = (
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
  appConfig: Pick<AppConfig, "language">,
):
  | {
      readonly name: string;
      readonly language: Language;
      readonly cached: ReturnType<typeof getCachedArtist>;
    }
  | undefined => {
  const query = resolveArtistQuery(request, reply, appConfig);
  if (query === undefined) {
    return undefined;
  }

  return { ...query, cached: getCachedArtist(query.name, query.language) };
};

/**
 * Resolves the shared artist query and cache entry, then hands off to
 * `handle` — or returns the already-sent 400 reply on failure. Shared by
 * the images and artist-detail routes, which only differ in what they do
 * once the artist and its cache entry are known.
 */
const withResolvedArtist = async (
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
  appConfig: Pick<AppConfig, "language">,
  handle: (resolved: {
    readonly name: string;
    readonly language: Language;
    readonly cached: ReturnType<typeof getCachedArtist>;
  }) => Promise<FastifyReply>,
): Promise<FastifyReply> => {
  const resolved = resolveArtistWithCache(request, reply, appConfig);
  if (resolved === undefined) {
    return reply;
  }
  return handle(resolved);
};

/**
 * Shared last.fm lookup error mapping for the enrichment routes: NotFound
 * becomes 404, everything else is a 503 upstream-unavailable.
 */
const sendEnrichmentLookupError = (
  reply: FastifyReply,
  error: EnrichmentError,
): FastifyReply => {
  if (error.type === "NotFound") {
    return reply.code(404).send({ message: error.message, code: "NOT_FOUND" });
  }
  return reply
    .code(503)
    .send({ message: error.message, code: "LAST_FM_UNAVAILABLE" });
};

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
      return withResolvedArtist(
        request,
        reply,
        appConfig,
        async ({ name, language, cached }) => {
          const mbid = await (async (): Promise<string | undefined> => {
            if (cached) {
              return cached.mbid;
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
        return sendEnrichmentLookupError(reply, result.error);
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
      return withResolvedArtist(
        request,
        reply,
        appConfig,
        async ({ name, language, cached }) => {
          if (cached) {
            return reply.code(200).send(cached);
          }

          const result = await getArtistEnrichment(
            name,
            lastFmClient,
            language,
          );

          if (!result.ok) {
            return sendEnrichmentLookupError(reply, result.error);
          }

          setCachedArtist(name, language, result.value);
          return reply.code(200).send(result.value);
        },
      );
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
        return sendEnrichmentLookupError(reply, result.error);
      }

      setCachedAlbum(artist, album, language, result.value);
      return reply.code(200).send(result.value);
    },
  );
};
