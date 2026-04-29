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
  deriveRadioBoundaryIndex,
  getCurrentQueueTrack,
  getUpcomingQueueTracks,
  mapQueueMutationError,
  reorderQueueTracks,
} from '../core/service'

type QueueStoreSnapshot = {
  readonly tracks: readonly QueueTrack[]
  readonly radioModeActive: boolean
  readonly radioBoundaryIndex: number | null
}

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
  const hasPendingQueueMutationSync = ref(false)
  const latestQueueSyncTimestamp = ref(0)

  const currentTrack = computed(() => getCurrentQueueTrack(tracks.value))
  const upcomingTracks = computed(() => getUpcomingQueueTracks(tracks.value))
  const isMutatingQueue = computed(
    () =>
      removeBusyTrackId.value !== null ||
      reorderBusyTrackId.value !== null ||
      isRadioModeUpdating.value,
  )

  const advanceQueueSyncTimestamp = (): number => {
    const nextTimestamp = Math.max(Date.now(), latestQueueSyncTimestamp.value + 1)
    latestQueueSyncTimestamp.value = nextTimestamp
    return nextTimestamp
  }

  const applyQueueUpdate = (payload: QueueUpdatedPayload): void => {
    if (payload.timestamp < latestQueueSyncTimestamp.value) {
      return
    }

    latestQueueSyncTimestamp.value = payload.timestamp
    tracks.value = payload.tracks
    isRadioMode.value = payload.radioModeActive
    radioBoundaryIndex.value = payload.radioBoundaryIndex ?? null
    removeBusyTrackId.value = null
    reorderBusyTrackId.value = null
    lastMutationError.value = null
  }

  const applyQueueSnapshot = (snapshot: QueueStoreSnapshot): void => {
    tracks.value = snapshot.tracks
    isRadioMode.value = snapshot.radioModeActive
    radioBoundaryIndex.value = snapshot.radioBoundaryIndex
  }

  const resetMutationState = (): void => {
    removeBusyTrackId.value = null
    reorderBusyTrackId.value = null
    lastMutationError.value = null
  }

  const commitQueueSnapshot = (snapshot: QueueStoreSnapshot): void => {
    advanceQueueSyncTimestamp()
    applyQueueSnapshot(snapshot)
    hasPendingQueueMutationSync.value = false
    isJumping.value = false
    jumpError.value = null
    resetMutationState()
  }

  const fetchQueue = async (): Promise<void> => {
    if (activeQueueFetch.value !== null) {
      pendingQueueRefresh.value = true
      await activeQueueFetch.value
      return
    }

    isLoading.value = true
    const fetchUntilSettled = async (): Promise<void> => {
      pendingQueueRefresh.value = false
      jumpError.value = null

      const result = await getQueue()
      if (result.ok) {
        advanceQueueSyncTimestamp()
        applyQueueSnapshot(result.value)
        error.value = null
      } else {
        error.value = result.error.message
      }

      if (pendingQueueRefresh.value) {
        await fetchUntilSettled()
      }
    }

    activeQueueFetch.value = fetchUntilSettled().finally(() => {
      activeQueueFetch.value = null
      isLoading.value = false
    })

    await activeQueueFetch.value
  }

  const jumpToTrack = async (trackIndex: number): Promise<void> => {
    if (isJumping.value || hasPendingQueueMutationSync.value) {
      return
    }

    isJumping.value = true
    jumpError.value = null

    const result = await apiJumpToTrack(trackIndex)
    if (result.ok) {
      if (result.value !== undefined) {
        commitQueueSnapshot(result.value)
        return
      }

      await fetchQueue()
    } else {
      jumpError.value = 'Failed to jump to track'
    }

    isJumping.value = false
  }

  const removeTrack = async (trackId: string, trackIndex: number): Promise<void> => {
    if (isMutatingQueue.value || hasPendingQueueMutationSync.value) {
      return
    }

    removeBusyTrackId.value = trackId
    lastMutationError.value = null

    const result = await apiRemoveFromQueue(trackIndex)
    if (result.ok) {
      if (result.value !== undefined) {
        commitQueueSnapshot(result.value)
        return
      }

      resetMutationState()
      await fetchQueue()
      return
    }

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
    if (isMutatingQueue.value || hasPendingQueueMutationSync.value) {
      return
    }

    const previousSnapshot = {
      tracks: tracks.value,
      radioModeActive: isRadioMode.value,
      radioBoundaryIndex: radioBoundaryIndex.value,
    }
    const optimisticTracks = reorderQueueTracks(tracks.value, fromIndex, toIndex)

    reorderBusyTrackId.value = trackId
    lastMutationError.value = null
    hasPendingQueueMutationSync.value = true
    applyQueueSnapshot({
      tracks: optimisticTracks,
      radioModeActive: isRadioMode.value,
      radioBoundaryIndex: deriveRadioBoundaryIndex(optimisticTracks),
    })
    reorderBusyTrackId.value = null

    const result = await apiReorderQueue(fromIndex, toIndex)
    if (result.ok) {
      if (result.value !== undefined) {
        commitQueueSnapshot(result.value)
        return
      }

      await fetchQueue()
      hasPendingQueueMutationSync.value = false
      return
    }

    if (!result.ok) {
      applyQueueSnapshot(previousSnapshot)
      hasPendingQueueMutationSync.value = false
      lastMutationError.value = mapQueueMutationError(result.error, 'Failed to reorder queue')
      await fetchQueue()
    }
  }

  const setRadioMode = async (enabled: boolean): Promise<void> => {
    if (isRadioModeUpdating.value) {
      return
    }

    isRadioModeUpdating.value = true
    radioModeError.value = null

    const result = await apiSetRadioMode(enabled)
    if (result.ok) {
      commitQueueSnapshot(result.value)
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
    jumpToTrack,
    removeTrack,
    reorderTrack,
    setRadioMode,
  }
})
