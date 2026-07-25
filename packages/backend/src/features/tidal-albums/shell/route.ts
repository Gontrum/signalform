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
} from "../core/service.js";
import { mapTidalArtistSearch } from "../../tidal-artists/core/service.js";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";

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

/** Sends the shared "LMS not reachable" 503 response used across this route. */
const sendTidalAlbumsLmsUnreachable = (reply: FastifyReply): FastifyReply =>
  reply
    .code(503)
    .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });

/**
 * Validates the shared `?limit=&offset=` pagination query used by the
 * albums and featured-albums routes. Sends the 400 response itself and
 * returns `undefined` on failure.
 */
const parseTidalAlbumsQuery = (
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
): { readonly limit: number; readonly offset: number } | undefined => {
  const validation = TidalAlbumsQuerySchema.safeParse(request.query);
  if (!validation.success) {
    reply
      .code(400)
      .send({ message: "Invalid query parameters", code: "INVALID_INPUT" });
    return undefined;
  }
  return validation.data;
};

/**
 * Validates the shared `:albumId` params used by the album-detail and
 * album-tracks routes. Sends the 400 response itself and returns
 * `undefined` on failure.
 */
const parseTidalAlbumIdParams = (
  request: FastifyRequest<{ readonly Params: unknown }>,
  reply: FastifyReply,
): string | undefined => {
  const validation = TidalAlbumTracksParamsSchema.safeParse(request.params);
  if (!validation.success) {
    reply
      .code(400)
      .send({ message: "Invalid album ID", code: "INVALID_INPUT" });
    return undefined;
  }
  return validation.data.albumId;
};

/**
 * Fetches an albums page via `fetchAlbums`, maps it to the response shape,
 * and sends it — or the shared 503 on failure. Shared by the albums and
 * featured-albums routes, which only differ in the LMS client call.
 */
const respondWithTidalAlbumsPage = async (
  reply: FastifyReply,
  config: LmsConfig,
  fetchAlbums: () => ReturnType<LmsClient["getTidalAlbums"]>,
): Promise<FastifyReply> => {
  const result = await fetchAlbums();
  if (!result.ok) {
    return sendTidalAlbumsLmsUnreachable(reply);
  }

  const baseUrl = `http://${config.host}:${config.port}`;
  const response = mapTidalAlbums(
    result.value.albums,
    result.value.count,
    baseUrl,
  );

  return reply.code(200).send(response);
};

/**
 * Registers a `GET path?limit=&offset=` route that fetches an albums page
 * via `fetchAlbums` and responds with the mapped result. Shared by the
 * albums and featured-albums routes, which only differ in path and the
 * LMS client method to call.
 */
const registerTidalAlbumsPageRoute = (
  fastify: FastifyInstance,
  path: string,
  config: LmsConfig,
  fetchAlbums: LmsClient["getTidalAlbums"],
): void => {
  fastify.get<{ readonly Querystring: unknown }>(
    path,
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const query = parseTidalAlbumsQuery(request, reply);
      if (query === undefined) {
        return reply;
      }

      return respondWithTidalAlbumsPage(reply, config, () =>
        fetchAlbums(query.offset, query.limit),
      );
    },
  );
};

export const createTidalAlbumsRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
): void => {
  registerTidalAlbumsPageRoute(
    fastify,
    "/api/tidal/albums",
    config,
    lmsClient.getTidalAlbums,
  );

  registerTidalAlbumsPageRoute(
    fastify,
    "/api/tidal/featured-albums",
    config,
    lmsClient.getTidalFeaturedAlbums,
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

      const artistSearchResult = await lmsClient.searchTidalArtists(
        artist,
        0,
        10,
      );
      if (!artistSearchResult.ok) {
        return sendTidalAlbumsLmsUnreachable(reply);
      }
      if (artistSearchResult.value.artists.length === 0) {
        return reply.code(200).send({ albumId: null });
      }

      const baseUrl = `http://${config.host}:${config.port}`;
      const { artists: mappedArtists } = mapTidalArtistSearch(
        artistSearchResult.value.artists,
        artistSearchResult.value.count,
        baseUrl,
      );
      const normalizedArtistName = normalizeArtist(artist);
      const matchingArtist =
        mappedArtists.find(
          (a) => normalizeArtist(a.name) === normalizedArtistName,
        ) ?? mappedArtists[0];

      if (!matchingArtist) {
        return reply.code(200).send({ albumId: null });
      }

      const albumsResult = await lmsClient.getTidalArtistAlbums(
        matchingArtist.artistId,
        0,
        250,
      );
      if (!albumsResult.ok) {
        return sendTidalAlbumsLmsUnreachable(reply);
      }

      const normalizedTitle = normalizeArtist(title);
      const matchingAlbum = albumsResult.value.albums.find((album) => {
        const albumNorm = normalizeArtist(album.name);
        return (
          albumNorm === normalizedTitle || albumNorm.includes(normalizedTitle)
        );
      });

      return reply.code(200).send({ albumId: matchingAlbum?.id ?? null });
    },
  );

  fastify.get<{ readonly Params: unknown }>(
    "/api/tidal/albums/:albumId",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      const albumId = parseTidalAlbumIdParams(request, reply);
      if (albumId === undefined) {
        return reply;
      }
      const baseUrl = `http://${config.host}:${config.port}`;

      const [parentItemsResult, tracksResult] = await Promise.all([
        lmsClient.getTidalAlbumParentItems(albumId),
        lmsClient.getTidalAlbumTracks(albumId, 0, 999),
      ]);

      if (!parentItemsResult.ok || !tracksResult.ok) {
        return sendTidalAlbumsLmsUnreachable(reply);
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
      const albumId = parseTidalAlbumIdParams(request, reply);
      if (albumId === undefined) {
        return reply;
      }
      const result = await lmsClient.getTidalAlbumTracks(albumId, 0, 999);

      if (!result.ok) {
        return sendTidalAlbumsLmsUnreachable(reply);
      }

      return reply
        .code(200)
        .send(mapTidalAlbumTracks(result.value.tracks, result.value.count));
    },
  );
};
