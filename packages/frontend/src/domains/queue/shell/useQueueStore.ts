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
  clearQueue as apiClearQueue,
  removeMultipleFromQueue as apiRemoveMultipleFromQueue,
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
  const isSelectMode = ref(false)
  const selectedTrackIds = ref<ReadonlySet<string>>(new Set())
  const isClearingQueue = ref(false)
  const isBatchRemoving = ref(false)

  const currentTrack = computed(() => getCurrentQueueTrack(tracks.value))
  const upcomingTracks = computed(() => getUpcomingQueueTracks(tracks.value))
  const selectedCount = computed(() => selectedTrackIds.value.size)
  const allTracksSelected = computed(
    () => tracks.value.length > 0 && selectedTrackIds.value.size === tracks.value.length,
  )
  const hasSelectedTracks = computed(() => selectedTrackIds.value.size > 0)
  const isMutatingQueue = computed(
    () =>
      removeBusyTrackId.value !== null ||
      reorderBusyTrackId.value !== null ||
      isRadioModeUpdating.value ||
      isClearingQueue.value ||
      isBatchRemoving.value,
  )

  // +1 turns "at or before the last applied state" into strictly older, so
  // in-flight echoes of that state are rejected by the < check below.
  const advanceQueueSyncTimestamp = (): void => {
    latestQueueSyncTimestamp.value = latestQueueSyncTimestamp.value + 1
  }

  const applyQueueUpdate = (payload: QueueUpdatedPayload): void => {
    // Only strictly older events are stale; an equal timestamp can be a
    // genuinely newer server event on the same millisecond — dropping it
    // would leave the queue stale until the next event.
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

    // Only the initial load (empty store) shows the loading state. Background
    // resyncs (reconnect, visibilitychange) with a populated queue swap data
    // silently so QueueView keeps its list mounted and its scroll position.
    if (tracks.value.length === 0) {
      isLoading.value = true
    }

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

  const toggleSelectMode = (): void => {
    if (isSelectMode.value) {
      isSelectMode.value = false
      selectedTrackIds.value = new Set()
    } else {
      isSelectMode.value = true
    }
  }

  const exitSelectMode = (): void => {
    isSelectMode.value = false
    selectedTrackIds.value = new Set()
  }

  const toggleTrackSelection = (trackId: string): void => {
    if (selectedTrackIds.value.has(trackId)) {
      selectedTrackIds.value = new Set([...selectedTrackIds.value].filter((id) => id !== trackId))
    } else {
      selectedTrackIds.value = new Set([...selectedTrackIds.value, trackId])
    }
  }

  const selectAllTracks = (): void => {
    selectedTrackIds.value = new Set(tracks.value.map((t) => t.id))
  }

  const clearQueue = async (): Promise<void> => {
    if (isMutatingQueue.value) {
      return
    }

    isClearingQueue.value = true
    lastMutationError.value = null
    exitSelectMode()

    const result = await apiClearQueue()
    if (result.ok) {
      if (result.value !== undefined) {
        commitQueueSnapshot(result.value)
      } else {
        await fetchQueue()
      }
    } else {
      lastMutationError.value = mapQueueMutationError(result.error, 'Failed to clear queue')
      await fetchQueue()
    }

    isClearingQueue.value = false
  }

  const removeSelectedTracks = async (): Promise<void> => {
    if (isMutatingQueue.value || hasPendingQueueMutationSync.value) {
      return
    }

    const selectedIds = selectedTrackIds.value
    const indicesToRemove = tracks.value
      .filter((t) => selectedIds.has(t.id))
      .map((t) => t.position - 1)

    if (indicesToRemove.length === 0) {
      return
    }

    isBatchRemoving.value = true
    lastMutationError.value = null
    exitSelectMode()

    const result = await apiRemoveMultipleFromQueue(indicesToRemove)
    if (result.ok) {
      if (result.value !== undefined) {
        commitQueueSnapshot(result.value)
      } else {
        hasPendingQueueMutationSync.value = false
        await fetchQueue()
      }
    } else {
      lastMutationError.value = mapQueueMutationError(
        result.error,
        'Failed to remove selected tracks',
      )
      await fetchQueue()
    }

    isBatchRemoving.value = false
  }

  const { on, subscribe, onReconnect } = useWebSocket()
  subscribe()

  // WS events missed while disconnected or backgrounded are gone for good —
  // resync the full queue. The store lives for the app lifetime, so these
  // listeners are registered exactly once and need no teardown.
  onReconnect(() => {
    void fetchQueue()
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void fetchQueue()
      }
    })
  }

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
    isSelectMode,
    selectedTrackIds,
    isClearingQueue,
    isBatchRemoving,
    selectedCount,
    allTracksSelected,
    hasSelectedTracks,
    toggleSelectMode,
    exitSelectMode,
    toggleTrackSelection,
    selectAllTracks,
    clearQueue,
    removeSelectedTracks,
  }
})
