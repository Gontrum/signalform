import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { err, findTag, ok, type Result } from "@signalform/shared";
import { z } from "zod";
import type {
  LibraryAlbumRaw,
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import type { DiscogsClient } from "../../../adapters/discogs-client/index.js";
import {
  matchTidalAlbum,
  type TidalAlbumCandidate,
} from "../core/availability.js";
import { matchCandidate } from "../core/match.js";
import type { TagCandidate } from "../core/types.js";
import {
  sliceCandidatePage,
  toTagAlbumView,
  type TagAlbumPage,
  type TagAlbumView,
} from "../core/page.js";
import { getAllLocalAlbums } from "./local-albums.js";
import { getTagCandidates } from "./tag-lookup.js";

const TagPageQuerySchema = z.object({
  tag: z.string().trim().min(1).max(100),
  q: z.string().trim().max(100).default(""),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(15).default(12),
});

type TagPageError = "INVALID_INPUT" | "DISCOGS_UNREACHABLE";

const baseUrlOf = (config: LmsConfig): string =>
  `http://${config.host}:${config.port}`;

const sendPageError = (
  reply: FastifyReply,
  error: TagPageError,
): FastifyReply =>
  error === "INVALID_INPUT"
    ? reply
        .code(400)
        .send({ message: "Invalid request", code: "INVALID_INPUT" })
    : reply
        .code(503)
        .send({ message: "Discogs unavailable", code: "DISCOGS_UNREACHABLE" });

const loadTagPage = async (
  discogsClient: DiscogsClient,
  rawQuery: unknown,
): Promise<Result<TagAlbumPage, TagPageError>> => {
  const query = TagPageQuerySchema.safeParse(rawQuery);
  if (!query.success) {
    return err("INVALID_INPUT");
  }

  const { tag, q, offset, limit } = query.data;
  const descriptor = findTag(tag);
  if (descriptor === undefined) {
    return err("INVALID_INPUT");
  }

  const lookupResult = await getTagCandidates(discogsClient, descriptor, q);
  if (!lookupResult.ok) {
    return err("DISCOGS_UNREACHABLE");
  }

  return ok(sliceCandidatePage(lookupResult.value.candidates, offset, limit));
};

// A single LMS failure must not take down the rest of the page — an empty
// `allAlbums` array (see getAllLocalAlbums's degrade-to-empty-array contract
// in the route handler below) simply matches nothing, "not available" for
// every candidate, without affecting the rest of the page.
const resolveLocalAvailability = (
  candidate: TagCandidate,
  allAlbums: readonly LibraryAlbumRaw[],
):
  | { readonly albumId: string; readonly artworkTrackId?: string }
  | undefined => {
  const match = matchCandidate(candidate, allAlbums);
  if (match === undefined) {
    return undefined;
  }
  return {
    albumId: String(match.id),
    ...(match.artwork_track_id !== undefined
      ? { artworkTrackId: match.artwork_track_id }
      : {}),
  };
};

// An LMS error for one candidate means "not on Tidal" for that candidate
// only; the remaining ones keep resolving.
const resolveTidalAvailability = async (
  lmsClient: LmsClient,
  candidate: TagCandidate,
): Promise<TidalAlbumCandidate | undefined> => {
  const tidalResult = await lmsClient.searchTidalAlbums(
    `${candidate.artist} ${candidate.title}`,
    5,
  );
  if (!tidalResult.ok) {
    return undefined;
  }
  return matchTidalAlbum(candidate, tidalResult.value);
};

// LMS is a single-threaded Perl process. Resolving a page with Promise.all
// fires one Tidal lookup per candidate concurrently and floods LMS. The
// reduce over a promise chain keeps at most one lookup in flight.
const resolveAvailableAlbums = async (
  lmsClient: LmsClient,
  candidates: readonly TagCandidate[],
  allAlbums: readonly LibraryAlbumRaw[],
  baseUrl: string,
): Promise<readonly TagAlbumView[]> =>
  await candidates.reduce<Promise<readonly TagAlbumView[]>>(
    async (accPromise, candidate) => {
      const acc = await accPromise;
      const tidal = await resolveTidalAvailability(lmsClient, candidate);
      const album = toTagAlbumView(
        candidate,
        resolveLocalAvailability(candidate, allAlbums),
        tidal,
        baseUrl,
      );
      return album === undefined ? acc : [...acc, album];
    },
    Promise.resolve([]),
  );

export const createAlbumTagsRoute = (
  server: FastifyInstance,
  lmsClient: LmsClient,
  discogsClient: DiscogsClient,
  lmsConfig: LmsConfig,
): void => {
  server.get<{ readonly Querystring: unknown }>(
    "/api/tags/discogs/albums",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const pageResult = await loadTagPage(discogsClient, request.query);
      if (!pageResult.ok) {
        return sendPageError(reply, pageResult.error);
      }

      const { page, hasMore, totalCandidates } = pageResult.value;

      // A failed bulk fetch degrades to "nothing is available locally"
      // rather than failing the whole request — consistent with the
      // per-source resilience rule documented on resolveLocalAvailability.
      const localAlbumsResult = await getAllLocalAlbums(lmsClient);
      const allAlbums = localAlbumsResult.ok ? localAlbumsResult.value : [];

      const albums = await resolveAvailableAlbums(
        lmsClient,
        page,
        allAlbums,
        baseUrlOf(lmsConfig),
      );

      // hasMore and totalCandidates count candidates, not the albums that
      // survived the availability filter: the client pages over candidates.
      return reply.code(200).send({ albums, hasMore, totalCandidates });
    },
  );
};
