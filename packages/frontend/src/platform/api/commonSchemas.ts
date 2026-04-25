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
