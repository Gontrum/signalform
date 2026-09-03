import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import { mapTidalPlaylists, mapTidalPlaylistTracks } from "../core/service.js";
import { hasMoreAfter } from "../../library/core/browse.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";
import { recordUserTransportCommand } from "../../../infrastructure/transport-commands.js";

// The playlist ID is passed to LMS as `item_id:<value>`, which LMS splits at
// dots into a menu navigation path — an over-deep path is what OOM-killed the
// server in the 2026-08-18 incident. Mirrors the album ID schema in
// tidal-albums/shell/route.ts, which the same LMS command shape drives.
const MAX_PLAYLIST_ID_PATH_COMPONENTS = 8;
const MAX_PLAYLIST_ID_LENGTH = 100;

const TidalPlaylistIdSchema = z
  .string()
  .trim()
  .min(1, "Playlist ID is required")
  .max(MAX_PLAYLIST_ID_LENGTH, "Playlist ID is too long")
  .refine(
    (value) => value.split(".").length <= MAX_PLAYLIST_ID_PATH_COMPONENTS,
    { error: "Playlist ID has too many path components" },
  );

const TidalPlaylistTracksParamsSchema = z.object({
  id: TidalPlaylistIdSchema,
});

const TidalPlaylistsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(250),
  offset: z.coerce.number().int().min(0).default(0),
});

const PlayTidalPlaylistBodySchema = z.object({
  id: TidalPlaylistIdSchema,
});

const parseTidalPlaylistsQuery = (
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
): { readonly limit: number; readonly offset: number } | undefined => {
  const validation = TidalPlaylistsQuerySchema.safeParse(request.query);
  if (!validation.success) {
    reply
      .code(400)
      .send({ message: "Invalid query parameters", code: "INVALID_INPUT" });
    return undefined;
  }
  return validation.data;
};

const parseTidalPlaylistIdParams = (
  request: FastifyRequest<{ readonly Params: unknown }>,
  reply: FastifyReply,
): string | undefined => {
  const validation = TidalPlaylistTracksParamsSchema.safeParse(request.params);
  if (!validation.success) {
    reply
      .code(400)
      .send({ message: "Invalid playlist ID", code: "INVALID_INPUT" });
    return undefined;
  }
  return validation.data.id;
};

export const createTidalPlaylistsRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
): void => {
  const baseUrl = `http://${config.host}:${config.port}`;

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/tidal/playlists",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const query = parseTidalPlaylistsQuery(request, reply);
      if (query === undefined) {
        return reply;
      }

      const result = await lmsClient.getTidalPlaylists(
        query.offset,
        query.limit,
      );
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS list Tidal playlists failed",
        );
      }

      const { playlists, totalCount } = mapTidalPlaylists(
        result.value.items,
        result.value.count,
        baseUrl,
      );

      return reply.code(200).send({
        playlists,
        totalCount,
        hasMore: hasMoreAfter(totalCount, query.offset, query.limit),
      });
    },
  );

  fastify.get<{ readonly Params: unknown; readonly Querystring: unknown }>(
    "/api/tidal/playlists/:id/tracks",
    async (
      request: FastifyRequest<{
        readonly Params: unknown;
        readonly Querystring: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      const id = parseTidalPlaylistIdParams(request, reply);
      if (id === undefined) {
        return reply;
      }

      const query = parseTidalPlaylistsQuery(request, reply);
      if (query === undefined) {
        return reply;
      }

      const result = await lmsClient.getTidalPlaylistTracks(
        id,
        query.offset,
        query.limit,
      );
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS list Tidal playlist tracks failed",
          { id },
        );
      }

      const { tracks, totalCount } = mapTidalPlaylistTracks(
        result.value.items,
        result.value.count,
        query.offset,
        baseUrl,
      );

      return reply.code(200).send({
        tracks,
        totalCount,
        hasMore: hasMoreAfter(totalCount, query.offset, query.limit),
      });
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/play-tidal-playlist",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = PlayTidalPlaylistBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid playlist ID", code: "INVALID_INPUT" });
      }
      const { id } = validation.data;

      recordUserTransportCommand();
      const result = await lmsClient.playTidalPlaylist(id);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS play Tidal playlist failed",
          { id },
        );
      }

      return reply.code(204).send();
    },
  );
};
