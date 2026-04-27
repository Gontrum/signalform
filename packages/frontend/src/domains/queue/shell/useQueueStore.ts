import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { QueueTrack, QueueUpdatedPayload } from '@signalform/shared'
import { useWebSocket } from '@/app/useWebSocket'
import {
  getQueue,
  jumpToTrack as apiJumpToTrack,
  removeFromQueue as apiRemoveFromQueue,
  reorderQueue as apiReorderQueue,
  setRadioMode as apiSetRadioMode,
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
  const isRadioModeUpdating = ref(false)
  const radioModeError = ref<string | null>(null)
  const radioBoundaryIndex = ref<number | null>(null)
  const radioUnavailableMessage = ref<string | null>(null)
  const pendingQueueRefresh = ref(false)
  const activeQueueFetch = ref<Promise<void> | null>(null)

  const currentTrack = computed(() => getCurrentQueueTrack(tracks.value))
  const upcomingTracks = computed(() => getUpcomingQueueTracks(tracks.value))
  const isMutatingQueue = computed(
    () => removeBusyTrackId.value !== null || reorderBusyTrackId.value !== null,
  )

  const applyQueueUpdate = (payload: QueueUpdatedPayload): void => {
    tracks.value = payload.tracks
    isRadioMode.value = payload.radioModeActive
    radioBoundaryIndex.value = payload.radioBoundaryIndex ?? null
    removeBusyTrackId.value = null
    reorderBusyTrackId.value = null
    lastMutationError.value = null
  }

  const applyQueueSnapshot = (snapshot: {
    readonly tracks: readonly QueueTrack[]
    readonly radioModeActive: boolean
    readonly radioBoundaryIndex: number | null
  }): void => {
    tracks.value = snapshot.tracks
    isRadioMode.value = snapshot.radioModeActive
    radioBoundaryIndex.value = snapshot.radioBoundaryIndex
  }

  const runQueueFetch = async (): Promise<void> => {
    pendingQueueRefresh.value = false
    jumpError.value = null

    const result = await getQueue()
    if (result.ok) {
      applyQueueSnapshot(result.value)
      error.value = null
    } else {
      error.value = result.error.message
    }

    if (pendingQueueRefresh.value) {
      await runQueueFetch()
    }
  }

  const fetchQueue = async (): Promise<void> => {
    if (activeQueueFetch.value !== null) {
      pendingQueueRefresh.value = true
      await activeQueueFetch.value
      return
    }

    isLoading.value = true
    activeQueueFetch.value = runQueueFetch().finally(() => {
      activeQueueFetch.value = null
      isLoading.value = false
    })

    await activeQueueFetch.value
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

  const setRadioMode = async (enabled: boolean): Promise<void> => {
    if (isRadioModeUpdating.value) {
      return
    }

    isRadioModeUpdating.value = true
    radioModeError.value = null

    const result = await apiSetRadioMode(enabled)
    if (result.ok) {
      applyQueueSnapshot(result.value)
    } else {
      radioModeError.value = mapQueueMutationError(result.error, 'Failed to update radio mode')
    }

    isRadioModeUpdating.value = false
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
    isRadioModeUpdating,
    radioModeError,
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
