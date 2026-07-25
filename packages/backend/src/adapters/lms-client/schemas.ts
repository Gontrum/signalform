/**
 * Shared Zod Schemas and Payload Parsers for LMS Client
 *
 * Single source of truth for Tidal response schemas that are reused
 * across multiple domain modules (library, queue, tidal-albums).
 *
 * Functional Core — pure schema definitions with no side effects.
 */

import { ok, err, type Result } from "@signalform/shared";
import { z } from "zod";
import { createLmsResultParser, type ExecuteCommand } from "./execute.js";
import { validateNonEmptyId } from "./helpers.js";
import type { LmsCommand, LmsError, TidalTrackRaw } from "./types.js";

// ── Shared Track Field Fragments ──────────────────────────────────
// Common groups of LMS response fields, spread into the per-command track
// schemas below to avoid repeating the same field list in every module.

/**
 * Numeric-id track identity fields shared by library's albumTrackSchema and
 * search's local-search track schema (both come from the `titles` command).
 */
export const trackIdentityFieldsSchema = {
  id: z.number(),
  title: z.string(),
  artist: z.string().optional(),
  albumartist: z.string().optional(),
  album: z.string().optional(),
};

/**
 * String/numeric-union id track identity fields shared by queue's
 * queueTrackRawSchema and playback's statusTrackSchema (both come from the
 * `status` command, whose ids may be returned as string or number).
 */
export const numericIdTrackFieldsSchema = {
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  artist: z.string().optional(),
  album: z.string().optional(),
};

/**
 * LMS "quality tag" fields (tags:b,r,o,s plus url) shared by library's
 * albumTrackSchema, queue's queueTrackRawSchema, and search's local-search
 * track schema.
 */
export const audioQualityFieldsSchema = {
  url: z.string().optional(),
  bitrate: z.string().optional(),
  samplerate: z.string().optional(),
  type: z.string().optional(),
  samplesize: z.number().optional(),
};

// ── Tidal Item Schemas ────────────────────────────────────────────

/**
 * Schema for a single Tidal track in an LMS browse response.
 * Used by library, queue, and tidal-albums modules.
 */
const tidalTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  duration: z.number().optional(),
  type: z.string().optional(),
  isaudio: z.number().optional(),
});

/**
 * Base schema for Tidal album/artist items in LMS browse responses.
 * Covers tidalAlbumSchema, tidalArtistAlbumSchema, and (without hasitems)
 * tidalSearchArtistSchema.
 */
export const tidalItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().optional(),
  type: z.string().optional(),
  isaudio: z.number().optional(),
  hasitems: z.number().optional(),
});

// ── Paginated Payload Parsers ─────────────────────────────────────

/**
 * Parses an LMS `loop_loop` response containing Tidal tracks.
 * Shared by library (playTidalAlbum), queue (addTidalAlbumToQueue),
 * and tidal-albums (getTidalAlbumTracks).
 */
export const tidalTracksPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z.array(tidalTrackSchema).optional(),
    count: z.number().optional(),
  }),
);

/**
 * Parses an LMS `loop_loop` response containing Tidal album items.
 * Shared by tidal-albums (getTidalAlbums, getTidalFeaturedAlbums).
 */
export const tidalAlbumsPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z.array(tidalItemSchema).optional(),
    count: z.number().optional(),
  }),
);

/**
 * Parses an LMS `loop_loop` response containing Tidal artist album items.
 * Used by tidal-albums (getTidalArtistAlbums).
 */
export const tidalArtistAlbumsPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z.array(tidalItemSchema).optional(),
    count: z.number().optional(),
  }),
);

// ── Shared Tidal `items` Command Execution ────────────────────────

/**
 * Executes an LMS `["tidal", "items", offset, limit, "item_id:{itemId}",
 * "want_url:1"]` command and unwraps the `{ loop_loop, count }` envelope.
 *
 * Shared by tidal-albums (getTidalAlbums, getTidalAlbumTracks,
 * getTidalArtistAlbums, getTidalFeaturedAlbums, getTidalAlbumParentItems) —
 * all four browse the same Tidal `items` command, differing only in the
 * item id, pagination, and payload parser (tracks vs. albums).
 */
export const executeTidalItems = async <T>(
  executeCommand: ExecuteCommand,
  parser: (
    value: unknown,
  ) => Result<
    { readonly loop_loop?: readonly T[]; readonly count?: number },
    LmsError
  >,
  offset: number,
  limit: number,
  itemId: string,
): Promise<
  Result<{ readonly items: readonly T[]; readonly count: number }, LmsError>
> => {
  const command: LmsCommand = [
    "tidal",
    "items",
    offset,
    limit,
    `item_id:${itemId}`,
    "want_url:1",
  ];

  const result = await executeCommand(command, parser);
  if (!result.ok) {
    return result;
  }

  return ok({
    items: result.value.loop_loop ?? [],
    count: result.value.count ?? 0,
  });
};

// ── Shared Tidal Album Track Loading + Queueing ───────────────────

/**
 * Fetches the playable (audio, non-empty-url) tracks of a Tidal browse album
 * via `["tidal", "items", 0, 999, "item_id:{albumId}", "want_url:1"]`.
 *
 * Only used internally by validateAndFetchPlayableTidalAlbumTracks below —
 * not exported, both external call sites (library's playTidalAlbum, queue's
 * addTidalAlbumToQueue) go through the validated entry point.
 */
const fetchPlayableTidalAlbumTracks = async (
  executeCommand: ExecuteCommand,
  albumId: string,
): Promise<
  Result<ReadonlyArray<TidalTrackRaw & { readonly url: string }>, LmsError>
> => {
  const tracksResult = await executeCommand(
    ["tidal", "items", 0, 999, `item_id:${albumId}`, "want_url:1"],
    tidalTracksPayloadParser,
  );

  if (!tracksResult.ok) {
    return tracksResult;
  }

  const allItems = tracksResult.value.loop_loop ?? [];
  // Type guard narrows url from string|undefined to string, preventing empty-string LMS commands
  const tracks = allItems.filter(
    (t): t is TidalTrackRaw & { readonly url: string } =>
      t.isaudio === 1 && t.url !== undefined && t.url !== "",
  );

  if (tracks.length === 0) {
    return err({
      type: "LmsApiError",
      code: 0,
      message: `No playable tracks found for Tidal album ${albumId}`,
    });
  }

  return ok(tracks);
};

/**
 * Validates a raw Tidal album id (non-empty after trim) and then fetches its
 * playable tracks via fetchPlayableTidalAlbumTracks.
 *
 * Shared by library's playTidalAlbum and queue's addTidalAlbumToQueue — both
 * validate + load a Tidal album's tracks identically before diverging (one
 * clears the queue and starts playback, the other only appends).
 */
export const validateAndFetchPlayableTidalAlbumTracks = async (
  executeCommand: ExecuteCommand,
  albumId: string,
): Promise<
  Result<ReadonlyArray<TidalTrackRaw & { readonly url: string }>, LmsError>
> => {
  const validation = validateNonEmptyId(albumId, "Album ID");
  if (!validation.ok) {
    return validation;
  }

  return fetchPlayableTidalAlbumTracks(executeCommand, validation.value);
};

/**
 * Adds tracks to the LMS queue sequentially via `["playlist", "add", url]`,
 * stopping at the first failure (functional/no-loop-statements reduce).
 *
 * Shared by library's playTidalAlbum (appends tracks after the first) and
 * queue's addTidalAlbumToQueue (appends all tracks).
 */
export const appendTracksToQueue = (
  executeCommand: ExecuteCommand,
  tracks: ReadonlyArray<{ readonly url: string }>,
): Promise<Result<void, LmsError>> => {
  return tracks.reduce<Promise<Result<void, LmsError>>>(
    async (prevPromise, track) => {
      const prev = await prevPromise;
      if (!prev.ok) {
        return prev;
      }
      const result = await executeCommand(["playlist", "add", track.url]);
      return result.ok ? ok(undefined) : err(result.error);
    },
    Promise.resolve(ok(undefined)),
  );
};
