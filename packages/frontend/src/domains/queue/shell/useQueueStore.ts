import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { QueueTrack, QueueUpdatedPayload } from '@signalform/shared'
import { useWebSocket } from '@/app/useWebSocket'
import {
  getQueue,
  jumpToTrack as apiJumpToTrack,
  removeFromQueue as apiRemoveFromQueue,
  reorderQueue as apiReorderQueue,
} from '@/platform/api/queueApi'
import {
  getCurrentQueueTrack,
  getUpcomingQueueTracks,
  mapQueueMutationError,
} from '../core/service'

export const useQueueStore = defineStore('queue', () => {
  const tracks = ref<readonly QueueTrack[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const jumpError = ref<string | null>(null)
  const isJumping = ref(false)
  const removeBusyTrackId = ref<string | null>(null)
  const reorderBusyTrackId = ref<string | null>(null)
  const lastMutationError = ref<string | null>(null)
  const isRadioMode = ref(false)
  const radioBoundaryIndex = ref<number | null>(null)
  const radioUnavailableMessage = ref<string | null>(null)

  const currentTrack = computed(() => getCurrentQueueTrack(tracks.value))
  const upcomingTracks = computed(() => getUpcomingQueueTracks(tracks.value))
  const isMutatingQueue = computed(
    () => removeBusyTrackId.value !== null || reorderBusyTrackId.value !== null,
  )

  const applyQueueUpdate = (payload: QueueUpdatedPayload): void => {
    tracks.value = payload.tracks
    radioBoundaryIndex.value = payload.radioBoundaryIndex ?? null
    removeBusyTrackId.value = null
    reorderBusyTrackId.value = null
    lastMutationError.value = null
  }

  const fetchQueue = async (): Promise<void> => {
    if (isLoading.value) {
      return
    }

    jumpError.value = null
    isLoading.value = true

    const result = await getQueue()
    if (result.ok) {
      tracks.value = result.value.tracks
      radioBoundaryIndex.value = result.value.radioBoundaryIndex
      error.value = null
    } else {
      error.value = result.error.message
    }

    isLoading.value = false
  }

  const updateQueue = (newTracks: readonly QueueTrack[]): void => {
    tracks.value = newTracks
    removeBusyTrackId.value = null
    reorderBusyTrackId.value = null
    lastMutationError.value = null
  }

  const jumpToTrack = async (trackIndex: number): Promise<void> => {
    if (isJumping.value) {
      return
    }

    isJumping.value = true
    jumpError.value = null

    const result = await apiJumpToTrack(trackIndex)
    if (!result.ok) {
      jumpError.value = 'Failed to jump to track'
    }

    isJumping.value = false
  }

  const removeTrack = async (trackId: string, trackIndex: number): Promise<void> => {
    if (isMutatingQueue.value) {
      return
    }

    removeBusyTrackId.value = trackId
    lastMutationError.value = null

    const result = await apiRemoveFromQueue(trackIndex)
    if (!result.ok) {
      removeBusyTrackId.value = null
      lastMutationError.value = mapQueueMutationError(result.error, 'Failed to remove track')
      await fetchQueue()
    }
  }

  const reorderTrack = async (
    trackId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> => {
    if (isMutatingQueue.value) {
      return
    }

    reorderBusyTrackId.value = trackId
    lastMutationError.value = null

    const result = await apiReorderQueue(fromIndex, toIndex)
    if (!result.ok) {
      reorderBusyTrackId.value = null
      lastMutationError.value = mapQueueMutationError(result.error, 'Failed to reorder queue')
      await fetchQueue()
    }
  }

  const clearMutationState = (): void => {
    removeBusyTrackId.value = null
    reorderBusyTrackId.value = null
    lastMutationError.value = null
  }

  const setRadioMode = (enabled: boolean): void => {
    isRadioMode.value = enabled
  }

  const { on, subscribe } = useWebSocket()
  subscribe()

  const radioUnavailableTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  on('player.queue.updated', (payload) => {
    applyQueueUpdate(payload)
  })

  on('player.radio.unavailable', (payload) => {
    if (radioUnavailableTimer.value !== null) {
      clearTimeout(radioUnavailableTimer.value)
    }

    radioUnavailableMessage.value = payload.message

    radioUnavailableTimer.value = setTimeout(() => {
      radioUnavailableMessage.value = null
      radioUnavailableTimer.value = null
    }, 10_000)
  })

  on('player.radio.started', () => {
    radioUnavailableMessage.value = null
  })

  return {
    tracks,
    isLoading,
    error,
    jumpError,
    isJumping,
    removeBusyTrackId,
    reorderBusyTrackId,
    lastMutationError,
    isMutatingQueue,
    isRadioMode,
    radioBoundaryIndex,
    radioUnavailableMessage,
    currentTrack,
    upcomingTracks,
    fetchQueue,
    updateQueue,
    jumpToTrack,
    removeTrack,
    reorderTrack,
    clearMutationState,
    setRadioMode,
  }
})
