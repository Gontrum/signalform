/**
 * Playback Feature Type Definitions
 *
 * Domain types for playback business logic (functional core).
 * All types are readonly and immutable.
 */

/**
 * Playback command types.
 */
export type PlaybackCommand = {
  readonly command: "play" | "pause" | "stop";
  readonly trackUrl?: string; // Required for 'play', optional for 'pause'/'stop'
};

/**
 * Album playback command type for gapless album playback.
 */
export type AlbumPlaybackCommand = {
  readonly command: "play-album";
  readonly albumId: string;
};

/**
 * Playback error types for business logic failures.
 * All errors wrapped in Result<T, E> - NO exceptions in business logic.
 */
export type PlaybackError =
  | { readonly type: "INVALID_TRACK_URL"; readonly message: string }
  | { readonly type: "LMS_UNREACHABLE"; readonly message: string }
  | { readonly type: "LMS_TIMEOUT"; readonly message: string }
  | { readonly type: "PLAYBACK_FAILED"; readonly message: string };
