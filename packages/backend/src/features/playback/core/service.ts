/**
 * Playback Service - Pure Business Logic
 *
 * Functional core: Pure functions with NO side effects.
 * All errors returned as Result<T, E> - NO exceptions thrown.
 */

import {
  ok,
  err,
  VALID_TRACK_PROTOCOLS,
  type Result,
} from "@signalform/shared";
import type {
  PlaybackCommand,
  PlaybackError,
  AlbumPlaybackCommand,
} from "./types.js";

/**
 * Initiate playback for a track URL.
 *
 * Pure function that validates track URL and returns playback command.
 * NO side effects - validation only.
 *
 * @param trackUrl - Track URL to validate and play
 * @returns Result with PlaybackCommand or validation error
 */
export const initiatePlayback = (
  trackUrl: string,
): Result<PlaybackCommand, PlaybackError> => {
  // Trim whitespace
  const trimmedUrl = trackUrl.trim();

  // Validate: URL cannot be empty
  if (trimmedUrl === "") {
    return err({
      type: "INVALID_TRACK_URL",
      message: "Track URL cannot be empty",
    });
  }

  // Validate: URL must have valid protocol
  const hasValidProtocol = VALID_TRACK_PROTOCOLS.some((protocol) =>
    trimmedUrl.startsWith(protocol),
  );

  if (!hasValidProtocol) {
    return err({
      type: "INVALID_TRACK_URL",
      message: `Invalid track URL format. Must start with one of: ${VALID_TRACK_PROTOCOLS.join(", ")}`,
    });
  }

  // Valid URL - return playback command
  return ok({
    command: "play",
    trackUrl: trimmedUrl,
  });
};

/**
 * Initiate album playback with gapless mode.
 *
 * Pure function that validates album ID and returns album playback command.
 * NO side effects - validation only.
 *
 * @param albumId - LMS album ID to validate
 * @returns Result with AlbumPlaybackCommand or validation error
 */
export const initiateAlbumPlayback = (
  albumId: string,
): Result<AlbumPlaybackCommand, PlaybackError> => {
  const trimmedId = albumId.trim();

  if (trimmedId === "") {
    return err({
      type: "INVALID_TRACK_URL",
      message: "Album ID cannot be empty",
    });
  }

  return ok({
    command: "play-album",
    albumId: trimmedId,
  });
};
