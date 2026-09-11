/**
 * Shared Zod Schemas and Payload Parsers for LMS Client
 *
 * Single source of truth for Tidal response schemas that are reused
 * across multiple domain modules (library, queue, tidal-albums).
 *
 * Functional Core — pure schema definitions with no side effects.
 */

import { ok, type Result } from "@signalform/shared";
import { z } from "zod";
import { createLmsResultParser, type ExecuteCommand } from "./execute.js";
import type { LmsCommand, LmsError } from "./types.js";

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

/**
 * Parses an LMS `loop_loop` response containing Tidal tracks.
 * Shared by tidal-playlists (getTidalPlaylistTracks) and
 * tidal-albums (getTidalAlbumTracks).
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
