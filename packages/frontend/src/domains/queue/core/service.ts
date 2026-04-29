import type { QueueTrack } from '@signalform/shared'
import type { QueueAutoScrollConfig, QueueDropPosition, QueueMutationError } from './types'

export const getQueueEntryKey = (track: QueueTrack): string => `${track.position}:${track.id}`

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

export const deriveRadioBoundaryIndex = (tracks: readonly QueueTrack[]): number | null => {
  const firstRadioTrackIndex = tracks.findIndex((track) => track.addedBy === 'radio')
  return firstRadioTrackIndex >= 0 ? firstRadioTrackIndex : null
}

export const reorderQueueTracks = (
  tracks: readonly QueueTrack[],
  fromIndex: number,
  toIndex: number,
): readonly QueueTrack[] => {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= tracks.length ||
    toIndex >= tracks.length ||
    fromIndex === toIndex
  ) {
    return tracks
  }

  const movedTrack = tracks[fromIndex]

  if (movedTrack === undefined) {
    return tracks
  }

  const remainingTracks = tracks.filter((_, index) => index !== fromIndex)
  const reordered = [
    ...remainingTracks.slice(0, toIndex),
    movedTrack,
    ...remainingTracks.slice(toIndex),
  ]

  return reordered.map((track, index) => ({
    ...track,
    position: index + 1,
  }))
}

export const isRadioTrack = (
  track: QueueTrack,
  trackIndex: number,
  radioBoundaryIndex: number | null,
): boolean =>
  track.addedBy === 'radio' ||
  (track.addedBy === undefined && radioBoundaryIndex !== null && trackIndex >= radioBoundaryIndex)

export const isQueueRowBusy = (
  trackKey: string,
  removeBusyTrackId: string | null,
  reorderBusyTrackId: string | null,
): boolean => removeBusyTrackId === trackKey || reorderBusyTrackId === trackKey

export const isQueueDropTarget = (
  trackIndex: number,
  dragOverIndex: number | null,
  dragFromIndex: number | null,
): boolean => dragOverIndex === trackIndex && dragFromIndex !== null && dragFromIndex !== trackIndex

export const getQueueDropPosition = (
  dragOverIndex: number | null,
  dragFromIndex: number | null,
): QueueDropPosition | null => {
  if (dragOverIndex === null || dragFromIndex === null || dragOverIndex === dragFromIndex) {
    return null
  }

  return dragFromIndex < dragOverIndex ? 'after' : 'before'
}

export const getQueueDropIndicatorLabel = (
  trackIndex: number,
  dragOverIndex: number | null,
  dragFromIndex: number | null,
  messages: { readonly before: string; readonly after: string },
): string | null => {
  const dropPosition = getQueueDropPosition(dragOverIndex, dragFromIndex)
  if (!isQueueDropTarget(trackIndex, dragOverIndex, dragFromIndex) || dropPosition === null) {
    return null
  }

  return dropPosition === 'after' ? messages.after : messages.before
}

export const parseQueueTrackIndex = (indexValue: string | undefined): number | null => {
  if (typeof indexValue !== 'string') {
    return null
  }

  const parsedIndex = Number.parseInt(indexValue, 10)
  return Number.isNaN(parsedIndex) ? null : parsedIndex
}

export const getQueueAutoScrollDelta = (
  pointerClientY: number,
  containerTop: number,
  containerBottom: number,
  config: QueueAutoScrollConfig,
): number => {
  const topZoneBottom = containerTop + config.thresholdPx
  const bottomZoneTop = containerBottom - config.thresholdPx

  if (pointerClientY < topZoneBottom) {
    const distanceIntoZone = topZoneBottom - pointerClientY
    const intensity = Math.min(distanceIntoZone / config.thresholdPx, 1)
    return -Math.max(1, Math.round(config.maxStepPx * intensity))
  }

  if (pointerClientY > bottomZoneTop) {
    const distanceIntoZone = pointerClientY - bottomZoneTop
    const intensity = Math.min(distanceIntoZone / config.thresholdPx, 1)
    return Math.max(1, Math.round(config.maxStepPx * intensity))
  }

  return 0
}
