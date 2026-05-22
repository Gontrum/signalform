import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import {
  mapTidalAlbums,
  mapTidalAlbumTracks,
  mapTidalAlbumDetail,
  findAlbumMetaFromParentItems,
  filterTracksByAlbumTitle,
  mapTidalAlbumTracksBySearch,
} from "../core/service.js";

const TidalAlbumTracksParamsSchema = z.object({
  albumId: z.string().trim().min(1, "Album ID is required"),
});

const TidalAlbumsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(250),
  offset: z.coerce.number().int().min(0).default(0),
});

const TidalAlbumResolveQuerySchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  artist: z.string().trim().min(1, "Artist is required"),
});

const TidalAlbumTracksBySearchQuerySchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  artist: z.string().trim().default(""),
});

export const createTidalAlbumsRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
): void => {
  fastify.get<{ readonly Querystring: unknown }>(
    "/api/tidal/albums",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = TidalAlbumsQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid query parameters", code: "INVALID_INPUT" });
      }

      const { limit, offset } = validation.data;
      const result = await lmsClient.getTidalAlbums(offset, limit);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      const baseUrl = `http://${config.host}:${config.port}`;
      const response = mapTidalAlbums(
        result.value.albums,
        result.value.count,
        baseUrl,
      );

      return reply.code(200).send(response);
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/tidal/featured-albums",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = TidalAlbumsQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid query parameters", code: "INVALID_INPUT" });
      }

      const { limit, offset } = validation.data;
      const result = await lmsClient.getTidalFeaturedAlbums(offset, limit);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      const baseUrl = `http://${config.host}:${config.port}`;
      const response = mapTidalAlbums(
        result.value.albums,
        result.value.count,
        baseUrl,
      );

      return reply.code(200).send(response);
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/tidal/albums/resolve",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = TidalAlbumResolveQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.code(400).send({
          message: "title and artist query params are required",
          code: "INVALID_INPUT",
        });
      }

      const { title, artist } = validation.data;
      const result = await lmsClient.findTidalSearchAlbumId(title, artist);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      return reply.code(200).send({ albumId: result.value });
    },
  );

  /**
   * GET /api/tidal/album-tracks-by-search
   *
   * Searches for Tidal tracks for a specific album using the Tracks section (item_id:7_{query}.4).
   * Safe: does not use the Albums section (.3) which OOM-kills LMS.
   * Returns tracks filtered to those whose albumName matches the title parameter.
   *
   * Query params:
   *   title  (required, min 1) — album title (e.g. "Mahler: Symphony No. 5")
   *   artist (optional, default "") — artist/performer name (e.g. "Berliner Philharmoniker")
   */
  fastify.get<{ readonly Querystring: unknown }>(
    "/api/tidal/album-tracks-by-search",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = TidalAlbumTracksBySearchQuerySchema.safeParse(
        request.query,
      );
      if (!validation.success) {
        return reply.code(400).send({
          message: "title query param is required",
          code: "INVALID_INPUT",
        });
      }

      const { title, artist } = validation.data;
      const result = await lmsClient.searchTidalAlbumTracks(title, artist);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      const filtered = filterTracksByAlbumTitle(result.value, title);

      return reply.code(200).send(mapTidalAlbumTracksBySearch(filtered));
    },
  );

  fastify.get<{ readonly Params: unknown }>(
    "/api/tidal/albums/:albumId",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = TidalAlbumTracksParamsSchema.safeParse(request.params);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid album ID", code: "INVALID_INPUT" });
      }

      const { albumId } = validation.data;
      const baseUrl = `http://${config.host}:${config.port}`;

      const [parentItemsResult, tracksResult] = await Promise.all([
        lmsClient.getTidalAlbumParentItems(albumId),
        lmsClient.getTidalAlbumTracks(albumId, 0, 999),
      ]);

      if (!parentItemsResult.ok || !tracksResult.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      const { name: metaName, image: metaImage } = findAlbumMetaFromParentItems(
        albumId,
        parentItemsResult.value.items,
      );

      const detail = mapTidalAlbumDetail(
        albumId,
        metaName,
        metaImage,
        tracksResult.value.tracks,
        tracksResult.value.count,
        baseUrl,
      );

      return reply.code(200).send(detail);
    },
  );

  fastify.get<{ readonly Params: unknown }>(
    "/api/tidal/albums/:albumId/tracks",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = TidalAlbumTracksParamsSchema.safeParse(request.params);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid album ID", code: "INVALID_INPUT" });
      }

      const { albumId } = validation.data;
      const result = await lmsClient.getTidalAlbumTracks(albumId, 0, 999);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      return reply
        .code(200)
        .send(mapTidalAlbumTracks(result.value.tracks, result.value.count));
    },
  );
};
