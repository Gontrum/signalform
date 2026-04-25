/**
 * Zod Validation Schemas for WebSocket Events
 * All payloads validated at runtime for type safety
 */

import { z } from "zod";

/**
 * Track Source Validation
 */
const AudioQualitySchema = z.object({
  format: z.enum(["FLAC", "AAC", "MP3", "ALAC", "OGG"]),
  bitrate: z.number().positive(),
  sampleRate: z.number().positive(),
  bitDepth: z.number().positive().optional(), // optional: not always available from LMS
  lossless: z.boolean(),
});

const TrackSourceSchema = z.object({
  source: z.enum(["local", "qobuz", "tidal"]),
  url: z.string().url(),
  quality: AudioQualitySchema,
  available: z.boolean(),
});

/**
 * Track Validation
 */
export const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string(), // may be empty (compilations, podcasts, etc.)
  album: z.string(), // may be empty (singles, streams, etc.)
  duration: z.number().nonnegative(),
  coverArtUrl: z.string().url().optional(),
  artistId: z.string().optional(), // LMS numeric artist ID; absent for streaming tracks
  albumId: z.string().optional(), // LMS numeric album ID; absent for streaming tracks
  sources: z.array(TrackSourceSchema).readonly(),
});

/**
 * Queue Preview Item Validation
 * Internal only — not exported. The TypeScript type `QueuePreviewItem` is
 * exported from `types/websocket.ts` for consumers. This schema is used
 * exclusively inside `PlayerStatusPayloadSchema` to avoid leaking Zod
 * internals through the package's public API.
 */
const QueuePreviewItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  artist: z.string(),
});

/**
 * Queue Track Validation
 * Internal only — mirrors QueueTrack from types/queue.ts.
 * Used inside QueueUpdatedPayloadSchema.
 */
const QueueTrackSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().positive(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number().nonnegative(),
  isCurrent: z.boolean(),
  source: z.enum(["local", "qobuz", "tidal"]).optional(),
  audioQuality: AudioQualitySchema.optional(),
});

/**
 * Player Status Payload Validation
 */
export const PlayerStatusPayloadSchema = z.object({
  playerId: z.string().min(1),
  status: z.enum(["playing", "paused", "stopped"]),
  currentTrack: TrackSchema.optional(),
  currentTime: z.number().nonnegative(),
  timestamp: z.number().positive(),
  queuePreview: z.array(QueuePreviewItemSchema).optional(),
});

/**
 * Player Track Changed Payload Validation
 */
export const PlayerTrackChangedPayloadSchema = z.object({
  playerId: z.string().min(1),
  track: TrackSchema,
  timestamp: z.number().positive(),
});

/**
 * Player Volume Changed Payload Validation
 */
export const PlayerVolumeChangedPayloadSchema = z.object({
  playerId: z.string().min(1),
  volume: z.number().min(0).max(100),
  timestamp: z.number().positive(),
});

/**
 * System Event Payload Validation
 */
export const SystemEventPayloadSchema = z.object({
  message: z.string().min(1),
  timestamp: z.number().positive(),
});

/**
 * Queue Updated Payload Validation
 */
export const QueueUpdatedPayloadSchema = z.object({
  playerId: z.string().min(1),
  tracks: z.array(QueueTrackSchema).readonly(),
  radioBoundaryIndex: z.number().int().nonnegative().optional(),
  timestamp: z.number().positive(),
});

/**
 * Radio Started Payload Validation
 */
export const RadioStartedPayloadSchema = z.object({
  playerId: z.string().min(1),
  seedTrack: z.object({
    artist: z.string(),
    title: z.string(),
  }),
  tracksAdded: z.number().int().nonnegative(),
  timestamp: z.number().positive(),
});

/**
 * Radio Unavailable Payload Validation (Story 6.8 — Circuit Breaker)
 */
export const RadioUnavailablePayloadSchema = z.object({
  playerId: z.string().min(1),
  message: z.string().min(1),
  timestamp: z.number().positive(),
});
