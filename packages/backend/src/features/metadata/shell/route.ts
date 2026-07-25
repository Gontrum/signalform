import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
  TidalSearchArtistRaw,
} from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import {
  getAlbumDetail,
  getArtistTopAlbumsByName,
  getArtistTopTracksByName,
} from "./service.js";
import { getCachedAlbum, setCachedAlbum } from "./cache.js";
import type {
  AlbumDetail,
  ArtistPopularityServiceError,
} from "../core/types.js";
import type { Result } from "@signalform/shared";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";
import { mapTidalArtistSearch } from "../../tidal-artists/core/service.js";

const AlbumParamsSchema = z.object({
  albumId: z.string().trim().min(1, "Album ID is required"),
});

const ArtistByNameQuerySchema = z.object({
  name: z.string().trim().min(1, "Artist name is required"),
});

const ArtistPopularityQuerySchema = z.object({
  name: z.string().trim().min(1, "Artist name is required"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Album entry for the by-name response.
 * Local albums have albumId; Tidal albums have trackUrls.
 */
type AlbumEntry = {
  readonly id: string;
  readonly albumId?: string;
  readonly title: string;
  readonly artist: string;
  readonly source?: string;
  readonly trackUrls?: ReadonlyArray<string>;
  readonly trackTitles?: ReadonlyArray<string>;
  readonly coverArtUrl?: string;
};

const isAlbumDetail = (value: unknown): value is AlbumDetail => {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "artist" in value &&
    "tracks" in value &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.artist === "string" &&
    Array.isArray(value.tracks)
  );
};

/**
 * Groups local tracks by albumId into AlbumEntry objects.
 * Only tracks with a defined albumId are included.
 */
const groupLocalAlbums = (
  tracks: ReadonlyArray<SearchResult>,
): ReadonlyArray<AlbumEntry> => {
  const localTracks = tracks.filter(
    (t): t is SearchResult & { readonly albumId: string } =>
      t.source === "local" && t.albumId !== undefined,
  );
  return Array.from(
    localTracks
      .reduce((acc, track) => {
        if (acc.has(track.albumId)) {
          return acc;
        }
        return new Map([
          ...acc,
          [
            track.albumId,
            {
              id: track.albumId,
              albumId: track.albumId,
              title: track.album,
              artist: track.albumartist || track.artist,
              source: "local",
              coverArtUrl: track.coverArtUrl,
            },
          ],
        ]);
      }, new Map<string, AlbumEntry>())
      .values(),
  );
};

/**
 * Groups Tidal tracks by coverArtUrl (primary) or artist+album (fallback) into AlbumEntry
 * objects with accumulated trackUrls and trackTitles.
 *
 * Key priority matches the search service: coverArtUrl is unique per recording and groups
 * all movements of the same album together even when tidal_info enrichment times out.
 */
const groupTidalAlbums = (
  tracks: ReadonlyArray<SearchResult>,
): ReadonlyArray<AlbumEntry> => {
  const tidalTracks = tracks.filter((t) => t.source === "tidal");
  const albumMap = tidalTracks.reduce((acc, track) => {
    const key =
      track.coverArtUrl !== undefined
        ? `tidal_cover:${track.coverArtUrl}`
        : track.artist.trim() && track.album.trim()
          ? `${track.artist.trim().toLowerCase()}::${track.album.trim().toLowerCase()}`
          : null;
    if (key === null) {
      return acc;
    }
    const existing = acc.get(key);
    const hasUrl = track.url.length > 0;
    const nextEntry: AlbumEntry =
      existing !== undefined
        ? {
            ...existing,
            title: existing.title || track.album,
            artist: existing.artist || track.albumartist || track.artist,
            trackUrls: hasUrl
              ? [...(existing.trackUrls ?? []), track.url]
              : existing.trackUrls,
            trackTitles: hasUrl
              ? [...(existing.trackTitles ?? []), track.title]
              : existing.trackTitles,
          }
        : {
            id: key,
            title: track.album,
            artist: track.albumartist || track.artist,
            source: "tidal",
            trackUrls: hasUrl ? [track.url] : [],
            trackTitles: hasUrl ? [track.title] : [],
            coverArtUrl: track.coverArtUrl,
          };
    return new Map([...acc, [key, nextEntry]]);
  }, new Map<string, AlbumEntry>());
  return Array.from(albumMap.values());
};

const findMatchingTidalArtistId = (
  name: string,
  rawArtists: {
    readonly artists: readonly TidalSearchArtistRaw[];
    readonly count: number;
  },
  config: LmsConfig,
): string | null => {
  const baseUrl = `http://${config.host}:${config.port}`;
  const mappedArtists = mapTidalArtistSearch(
    rawArtists.artists,
    rawArtists.count,
    baseUrl,
  ).artists;
  const normalizedName = normalizeArtist(name);
  const exactMatch = mappedArtists.find(
    (artist) => normalizeArtist(artist.name) === normalizedName,
  );

  return exactMatch?.artistId ?? null;
};

/**
 * Validates the shared `?name=&limit=` query used by both artist-popularity
 * routes. Sends the 400 response itself and returns `undefined` on failure.
 */
const parseArtistPopularityQuery = (
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
): { readonly name: string; readonly limit: number } | undefined => {
  const validation = ArtistPopularityQuerySchema.safeParse(request.query);
  if (!validation.success) {
    reply
      .code(400)
      .send({ message: "Artist name is required", code: "INVALID_INPUT" });
    return undefined;
  }
  return validation.data;
};

/**
 * Shared last.fm lookup error mapping for the artist-popularity routes:
 * NotFound becomes 404, everything else is a 503 upstream-unavailable.
 */
const sendArtistPopularityError = (
  reply: FastifyReply,
  error: { readonly type: string; readonly message: string },
): FastifyReply => {
  return error.type === "NotFound"
    ? reply.code(404).send({ message: error.message, code: "NOT_FOUND" })
    : reply
        .code(503)
        .send({ message: "last.fm not reachable", code: "UNAVAILABLE" });
};

/**
 * Validates the shared `?name=&limit=` query, runs an artist-popularity
 * lookup via `fetchResult`, and sends the result: the mapped error on
 * failure, or the value as a 200. Shared by the top-tracks and top-albums
 * routes, which only differ in which lookup they call.
 */
const respondWithArtistPopularity = async <T>(
  request: FastifyRequest<{ readonly Querystring: unknown }>,
  reply: FastifyReply,
  fetchResult: (query: {
    readonly name: string;
    readonly limit: number;
  }) => Promise<Result<T, ArtistPopularityServiceError>>,
): Promise<FastifyReply> => {
  const query = parseArtistPopularityQuery(request, reply);
  if (query === undefined) {
    return reply;
  }

  const result = await fetchResult(query);
  if (!result.ok) {
    return sendArtistPopularityError(reply, result.error);
  }
  return reply.code(200).send(result.value);
};

const getArtistBrowseTidalAlbums = async (
  name: string,
  lmsClient: LmsClient,
  config: LmsConfig,
): Promise<ReadonlyArray<AlbumEntry>> => {
  const artistSearchResult = await lmsClient.searchTidalArtists(name, 0, 10);
  if (!artistSearchResult.ok) {
    return [];
  }

  const artistId = findMatchingTidalArtistId(
    name,
    artistSearchResult.value,
    config,
  );
  if (artistId === null) {
    return [];
  }

  const albumsResult = await lmsClient.getTidalArtistAlbums(artistId, 0, 250);
  if (!albumsResult.ok) {
    return [];
  }

  const baseUrl = `http://${config.host}:${config.port}`;
  return albumsResult.value.albums.map((album) => ({
    id: album.id,
    title: album.name,
    artist: name,
    source: "tidal",
    coverArtUrl: album.image ? `${baseUrl}${album.image}` : undefined,
  }));
};

export const createMetadataRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
  lastFmClient: LastFmClient,
): void => {
  fastify.get<{ readonly Params: unknown }>(
    "/api/album/:albumId",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = AlbumParamsSchema.safeParse(request.params);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid album ID", code: "INVALID_INPUT" });
      }

      const { albumId } = validation.data;

      // Cache check (AC: cache hit)
      const cached = getCachedAlbum(albumId);
      if (isAlbumDetail(cached)) {
        return reply.code(200).send(cached);
      }

      // Cache miss — query LMS
      const result = await getAlbumDetail(albumId, lmsClient, config);

      if (!result.ok) {
        if (result.error.type === "NotFound") {
          return reply
            .code(404)
            .send({ message: result.error.message, code: "NOT_FOUND" });
        }
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      // Store in cache BEFORE sending response (AC: cache successful results only)
      setCachedAlbum(albumId, result.value);
      return reply.code(200).send(result.value);
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/artist/top-tracks",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      return respondWithArtistPopularity(request, reply, (query) =>
        getArtistTopTracksByName(
          query.name,
          lmsClient,
          lastFmClient,
          query.limit,
        ),
      );
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/artist/top-albums",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      return respondWithArtistPopularity(request, reply, (query) =>
        getArtistTopAlbumsByName(query.name, lastFmClient, query.limit),
      );
    },
  );

  fastify.get<{ readonly Querystring: unknown }>(
    "/api/artist/by-name",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ArtistByNameQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Artist name is required", code: "INVALID_INPUT" });
      }

      const { name } = validation.data;

      // Run local search and Tidal artist browse in parallel.
      // Artist browse gives real Tidal album IDs so navigation goes directly to the
      // full album (all tracks). Search-derived albums are used only as fallback when
      // the artist browse returns nothing (artist not in Tidal or browse fails).
      const [searchResult, tidalBrowseAlbums] = await Promise.all([
        lmsClient.search(name),
        getArtistBrowseTidalAlbums(name, lmsClient, config),
      ]);

      if (!searchResult.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      // Filter to tracks by this artist only — LMS search:X matches any field
      // (album title, track title, artist), so we must discard tracks where the
      // artist doesn't match the query to avoid showing albums named after the artist.
      // Exact match (not substring) with NFD normalization prevents "Rabauken von Kiez"
      // from matching a search for "Rabauken".
      //
      // Two-field match:
      // 1. albumartist (or artist fallback) — primary: finds all albums owned by this artist
      // 2. track-level artist (when albumartist also present) — secondary: finds collaboration
      //    tracks where the artist appears as a featured/co-artist but the album belongs to
      //    another artist (e.g. "Taylor Swift, Hayley Williams" track on a Taylor Swift album)
      const norm = normalizeArtist(name);
      const tracks = searchResult.value.tracks.filter((r) => {
        if (r.type !== "track") {
          return false;
        }
        const matchesAlbumArtist =
          normalizeArtist(r.albumartist ?? r.artist) === norm;
        const matchesTrackArtist =
          r.albumartist !== undefined && normalizeArtist(r.artist) === norm;
        return matchesAlbumArtist || matchesTrackArtist;
      });
      const localAlbums = groupLocalAlbums(tracks);
      const tidalAlbums =
        tidalBrowseAlbums.length > 0
          ? tidalBrowseAlbums
          : groupTidalAlbums(tracks);

      return reply.code(200).send({
        localAlbums,
        tidalAlbums,
      });
    },
  );
};
