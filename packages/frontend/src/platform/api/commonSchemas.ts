/**
 * Shared Zod schemas for the frontend API layer.
 *
 * Schemas that appear in more than one API file live here so there is a
 * single place to update when the shared `AudioQuality` type changes.
 */

import { z } from 'zod'

/**
 * Zod schema for `AudioQuality` from `@signalform/shared`.
 *
 * Keep this in sync with the TypeScript type in shared/src/types/track.ts.
 * Used in: playbackApi, queueApi, searchApi, albumApi.
 */
export const AudioQualitySchema = z.object({
  format: z.enum(['FLAC', 'AAC', 'MP3', 'ALAC', 'OGG']),
  bitrate: z.number(),
  sampleRate: z.number(),
  bitDepth: z.number().optional(),
  lossless: z.boolean(),
})

/**
 * Fields shared by every API schema that represents an album with a track
 * listing (search results, artist-by-name lookups, ...). Spread into a
 * `z.object({...})` shape alongside the schema-specific fields.
 *
 * Used in: searchApi (AlbumResultSchema), artistApi (ArtistByNameAlbumSchema).
 */
export const albumLikeFields = {
  id: z.string(),
  albumId: z.string().optional(),
  title: z.string(),
  artist: z.string(),
  trackUrls: z.array(z.string()).optional(),
  trackTitles: z.array(z.string()).optional(),
  coverArtUrl: z.string().optional(),
}
