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

export type { ShuffleMode, RepeatMode } from "./types/playback.js";

export type { QueueState, QueueItem, QueueTrack } from "./types/queue.js";

export type { SortOption, DecadeFilter } from "./types/library.js";

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
  SystemEventPayloadSchema,
  QueueUpdatedPayloadSchema,
  TrackSchema,
  RadioStartedPayloadSchema,
  RadioUnavailablePayloadSchema,
} from "./validation/websocket.js";

// Tidal utilities
export { isTidalAlbumId } from "./tidalUtils.js";

// Library ordering
export { ordersByYearFirst } from "./libraryOrdering.js";

// Library limits
export { RECENTLY_ADDED_ALBUM_LIMIT } from "./libraryLimits.js";

// Playback mode cycles
export { nextShuffleMode, nextRepeatMode } from "./playbackModes.js";

// Tag vocabulary
export type { TagQueryMode, TagDescriptor } from "./tags.js";

export { TAG_VOCABULARY, findTag } from "./tags.js";
