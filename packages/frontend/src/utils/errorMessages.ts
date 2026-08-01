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
type PlaybackOperation =
  | 'play'
  | 'next'
  | 'previous'
  | 'pause'
  | 'resume'
  | 'volume'
  | 'seek'
  | 'time'
  | 'shuffle'
  | 'repeat'

const OPERATION_TEXT: Readonly<Record<PlaybackOperation, string>> = {
  play: 'start playback',
  next: 'skip to next track',
  previous: 'skip to previous track',
  pause: 'pause playback',
  resume: 'resume playback',
  volume: 'change volume',
  seek: 'seek to position',
  time: 'get playback time',
  shuffle: 'change shuffle mode',
  repeat: 'change repeat mode',
}

export const mapPlaybackErrorMessage = (
  error: PlaybackApiError,
  operation: PlaybackOperation = 'play',
): string => {
  const operationText = OPERATION_TEXT[operation]

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
