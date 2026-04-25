import type { QueueTrack } from '@signalform/shared'
import type { QueueMutationError } from './types'

export const mapQueueMutationError = (
  error: QueueMutationError,
  fallbackMessage: string,
): string => {
  if (error.type === 'VALIDATION_ERROR' || error.type === 'SERVER_ERROR') {
    return error.message
  }

  return fallbackMessage
}

export const getCurrentQueueTrack = (tracks: readonly QueueTrack[]): QueueTrack | null =>
  tracks.find((track) => track.isCurrent) ?? null

export const getUpcomingQueueTracks = (tracks: readonly QueueTrack[]): readonly QueueTrack[] => {
  const currentIndex = tracks.findIndex((track) => track.isCurrent)
  return currentIndex === -1 ? [] : tracks.slice(currentIndex + 1)
}

export const isRadioTrack = (trackIndex: number, radioBoundaryIndex: number | null): boolean =>
  radioBoundaryIndex !== null && trackIndex >= radioBoundaryIndex

export const isQueueRowBusy = (
  trackId: string,
  removeBusyTrackId: string | null,
  reorderBusyTrackId: string | null,
): boolean => removeBusyTrackId === trackId || reorderBusyTrackId === trackId

export const isQueueDropTarget = (
  trackIndex: number,
  dragOverIndex: number | null,
  dragFromIndex: number | null,
): boolean => dragOverIndex === trackIndex && dragFromIndex !== null && dragFromIndex !== trackIndex

export const getQueueDropIndicatorLabel = (
  trackIndex: number,
  dragOverIndex: number | null,
  dragFromIndex: number | null,
  messages: { readonly before: string; readonly after: string },
): string | null => {
  if (!isQueueDropTarget(trackIndex, dragOverIndex, dragFromIndex) || dragFromIndex === null) {
    return null
  }

  return dragFromIndex < trackIndex ? messages.after : messages.before
}

export const parseQueueTrackIndex = (indexValue: string | undefined): number | null => {
  if (typeof indexValue !== 'string') {
    return null
  }

  const parsedIndex = Number.parseInt(indexValue, 10)
  return Number.isNaN(parsedIndex) ? null : parsedIndex
}
