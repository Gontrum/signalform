// Result type and helpers
export {
  type Result,
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  mapErr,
  unwrap,
  unwrapOr,
  fromThrowable,
} from "./result/index.js";

// Domain types
export type { Track, TrackSource, AudioQuality } from "./types/track.js";

export type {
  PlayerStatus,
  PlaybackState,
  RepeatMode,
} from "./types/player.js";

export type { QueueState, QueueItem, QueueTrack } from "./types/queue.js";

export type {
  SourceType,
  SourceHierarchy,
  ValidTrackProtocol,
} from "./types/source.js";

export {
  DEFAULT_SOURCE_HIERARCHY,
  VALID_TRACK_PROTOCOLS,
} from "./types/source.js";

// Formatting utilities
export { formatSeconds, formatProgress } from "./formatting/index.js";

// WebSocket types and validation
export type {
  PlayerStatusPayload,
  PlayerTrackChangedPayload,
  PlayerVolumeChangedPayload,
  SystemEventPayload,
  ServerToClientEvents,
  ClientToServerEvents,
  WebSocketError,
  QueuePreviewItem,
  QueueUpdatedPayload,
  RadioStartedPayload,
  RadioUnavailablePayload,
} from "./types/websocket.js";

export { WebSocketErrorCode } from "./types/websocket.js";

export {
  PlayerStatusPayloadSchema,
  PlayerTrackChangedPayloadSchema,
  PlayerVolumeChangedPayloadSchema,
  SystemEventPayloadSchema,
  QueueUpdatedPayloadSchema,
  TrackSchema,
  RadioStartedPayloadSchema,
  RadioUnavailablePayloadSchema,
} from "./validation/websocket.js";

// Tidal utilities
export { isTidalAlbumId } from "./tidalUtils.js";
