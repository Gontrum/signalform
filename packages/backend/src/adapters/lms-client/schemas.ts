/**
 * Shared Zod Schemas and Payload Parsers for LMS Client
 *
 * Single source of truth for Tidal response schemas that are reused
 * across multiple domain modules (library, queue, tidal-albums).
 *
 * Functional Core — pure schema definitions with no side effects.
 */

import { z } from "zod";
import { createLmsResultParser } from "./execute.js";

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
