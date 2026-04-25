import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import { getAlbumDetail, getArtistDetail } from "./service.js";
import { getCachedAlbum, setCachedAlbum } from "./cache.js";
import type { AlbumDetail } from "../core/types.js";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";

const AlbumParamsSchema = z.object({
  albumId: z.string().trim().min(1, "Album ID is required"),
});

const ArtistParamsSchema = z.object({
  artistId: z.string().trim().min(1, "Artist ID is required"),
});

const ArtistByNameQuerySchema = z.object({
  name: z.string().trim().min(1, "Artist name is required"),
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
 * Groups Tidal tracks by artist+album key into AlbumEntry objects with accumulated trackUrls.
 * Uses forEach with a mutable Map for O(n) performance instead of O(n²) spread-Map reduce.
 */
const groupTidalAlbums = (
  tracks: ReadonlyArray<SearchResult>,
): ReadonlyArray<AlbumEntry> => {
  const tidalTracks = tracks.filter((t) => t.source === "tidal");
  const albumMap = tidalTracks.reduce((acc, track) => {
    const key = `${track.artist.trim().toLowerCase()}::${track.album.trim().toLowerCase()}`;
    const existing = acc.get(key);
    const nextEntry: AlbumEntry =
      existing !== undefined
        ? {
            ...existing,
            trackUrls: [...(existing.trackUrls ?? []), track.url],
          }
        : {
            id: key,
            title: track.album,
            artist: track.albumartist || track.artist,
            source: "tidal",
            trackUrls: [track.url],
            coverArtUrl: track.coverArtUrl,
          };
    return new Map([...acc, [key, nextEntry]]);
  }, new Map<string, AlbumEntry>());
  return Array.from(albumMap.values());
};

export const createMetadataRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
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

  fastify.get<{ readonly Params: unknown }>(
    "/api/artist/:artistId",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ArtistParamsSchema.safeParse(request.params);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid artist ID", code: "INVALID_INPUT" });
      }

      const { artistId } = validation.data;
      const result = await getArtistDetail(artistId, lmsClient, config);

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

      return reply.code(200).send(result.value);
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
      const searchResult = await lmsClient.search(name);

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
      const tracks = searchResult.value.filter((r) => {
        if (r.type !== "track") {
          return false;
        }
        const matchesAlbumArtist =
          normalizeArtist(r.albumartist ?? r.artist) === norm;
        const matchesTrackArtist =
          r.albumartist !== undefined && normalizeArtist(r.artist) === norm;
        return matchesAlbumArtist || matchesTrackArtist;
      });
      return reply.code(200).send({
        localAlbums: groupLocalAlbums(tracks),
        tidalAlbums: groupTidalAlbums(tracks),
      });
    },
  );
};
