/**
 * Error Message Mapping Utilities
 *
 * Centralized error message mapping for better testability and reusability.
 * Extracted from playbackStore (Issue #20: Code organization)
 */

import type { PlaybackApiError } from '@/platform/api/playbackApi'

/**
 * Maps API errors to user-friendly messages.
 *
 * @param error - Playback API error
 * @param operation - Operation type (play, next, previous, pause, resume) - defaults to 'play'
 * @returns User-friendly error message
 */
export const mapPlaybackErrorMessage = (
  error: PlaybackApiError,
  operation:
    | 'play'
    | 'next'
    | 'previous'
    | 'pause'
    | 'resume'
    | 'volume'
    | 'seek'
    | 'time' = 'play',
): string => {
  const operationText =
    operation === 'play'
      ? 'start playback'
      : operation === 'next'
        ? 'skip to next track'
        : operation === 'previous'
          ? 'skip to previous track'
          : operation === 'pause'
            ? 'pause playback'
            : operation === 'resume'
              ? 'resume playback'
              : operation === 'volume'
                ? 'change volume'
                : operation === 'seek'
                  ? 'seek to position'
                  : 'get playback time'

  switch (error.type) {
    case 'TIMEOUT_ERROR':
      return `Could not ${operationText} - music server may be slow`
    case 'NETWORK_ERROR':
      return `Could not ${operationText} - cannot connect to server`
    case 'SERVER_ERROR':
      // AC5: Standardized error message
      if (error.message.includes('Cannot connect to music server')) {
        return `Could not ${operationText} - music server not reachable`
      }
      if (error.message.includes('did not respond')) {
        return `Could not ${operationText} - music server did not respond in time`
      }
      return `Could not ${operationText}`
    case 'VALIDATION_ERROR':
      return `Could not ${operationText} - invalid track URL`
    case 'ABORT_ERROR':
      return `Could not ${operationText} - request was cancelled`
    default:
      return `Could not ${operationText} - please try again`
  }
}
