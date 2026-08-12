import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  playTrack,
  nextTrack,
  previousTrack,
  pausePlayback,
  resumePlayback,
  setVolume as apiSetVolume,
  getVolume as apiGetVolume,
  seek as apiSeek,
  getCurrentTime as apiGetCurrentTime,
  getPlaybackStatus,
  setShuffleMode as apiSetShuffleMode,
  setRepeatMode as apiSetRepeatMode,
} from '@/platform/api/playbackApi'
import { mapPlaybackErrorMessage } from '@/utils/errorMessages'
import { useWebSocket } from '@/app/useWebSocket'
import { useI18nStore } from '@/app/i18nStore'
import { getApiUrl } from '@/utils/runtimeUrls'
import type {
  PlayerStatusPayload,
  QueueUpdatedPayload,
  SystemEventPayload,
  QueuePreviewItem,
  RepeatMode,
  ShuffleMode,
} from '@signalform/shared'
import { nextRepeatMode, nextShuffleMode } from '@signalform/shared'
import {
  calculateProgressPercent,
  getPlaybackState,
  mapStatusTrackToTrackInfo,
  mapQueueTracksToQueuePreview,
  normalizeCurrentTime,
  validateSeekPosition,
  validateVolumeLevel,
} from '@/domains/playback/core/service'
import type { TrackInfo } from '@/domains/playback/core/types'

const globalPlaybackSyncHandler = ref<(() => void) | null>(null)
const hasRegisteredGlobalPlaybackSyncListeners = ref(false)

const invokeGlobalPlaybackSync = (): void => {
  globalPlaybackSyncHandler.value?.()
}

/**
 * Playback Store
 *
 * Manages playback state and interactions with playback API.
 * Follows functional programming patterns with Result<T, E> error handling.
 */
export const usePlaybackStore = defineStore('playback', () => {
  const i18nStore = useI18nStore()

  const currentTrack = ref<TrackInfo | null>(null)
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Volume state
  const currentVolume = ref<number | null>(null)
  const isMuted = ref(false)
  const volumeBeforeMute = ref<number | null>(null)

  // Progress state
  const currentTime = ref<number>(0)
  const trackDuration = ref<number | null>(null)
  const pendingSeekTarget = ref<number | null>(null)
  const queuedSeekTarget = ref<number | null>(null)
  const isSeekRequestInFlight = ref(false)

  const queuePreview = ref<readonly QueuePreviewItem[]>([])

  // Shuffle/repeat state — 'off' until the first status arrives, so the
  // buttons never have to render an unknown mode.
  const shuffleMode = ref<ShuffleMode>('off')
  const repeatMode = ref<RepeatMode>('off')

  // LMS connectivity state
  const isLmsDisconnected = ref(false)
  const isRetryingLms = ref(false)
  // Player connectivity state (physical/software player lost its own
  // connection to LMS — distinct root cause from the LMS flag above).
  const isPlayerDisconnected = ref(false)
  // The status read itself failed while the server answered a separate probe:
  // the speaker is off. Deliberately not folded into playerError — that one
  // follows the player_connected flag of a *successful* read and is retracted
  // by its own event, so a shared ref would let one condition's recovery erase
  // the other's message.
  const playerStatusUnavailable = ref(false)
  const hasInitializedSync = ref(false)
  const progressClock = ref<ReturnType<typeof setInterval> | null>(null)
  const playbackSnapshotRevision = ref(0)

  const hasCurrentTrack = computed(() => currentTrack.value !== null)
  const isCurrentlyPlaying = computed(() => isPlaying.value && !isPaused.value)
  const hasError = computed(() => error.value !== null)
  // The flag is the state, the sentence is derived from it: a message stored
  // when the disconnect event arrived would keep the language of that moment,
  // and the language itself arrives from the server config after this store
  // has already been created.
  const lmsError = computed<string | null>(() =>
    isLmsDisconnected.value ? i18nStore.t('player.lmsDisconnected') : null,
  )
  const playerError = computed<string | null>(() =>
    isPlayerDisconnected.value ? i18nStore.t('player.disconnected') : null,
  )
  // A silent speaker is worth reporting only while the server itself answers —
  // once LMS is gone that is the cause the user has to act on, and saying "the
  // music server is reachable" alongside "cannot connect to music server"
  // would be a straight contradiction.
  const playerAlert = computed<string | null>(() => {
    if (playerError.value !== null) {
      return playerError.value
    }

    if (!playerStatusUnavailable.value || lmsError.value !== null) {
      return null
    }

    return i18nStore.t('player.statusUnavailable')
  })
  const hasPlayerAlert = computed(() => playerAlert.value !== null)
  const progressPercent = computed(() =>
    calculateProgressPercent(currentTime.value, trackDuration.value),
  )

  const applyPlaybackSnapshot = (
    status: 'playing' | 'paused' | 'stopped',
    nextCurrentTime: number,
    track?: TrackInfo | null,
    nextQueuePreview?: readonly QueuePreviewItem[],
  ): void => {
    const playbackState = getPlaybackState(status)
    isPlaying.value = playbackState.isPlaying
    isPaused.value = playbackState.isPaused

    const nextTrackId = track?.id
    const currentTrackId = currentTrack.value?.id
    const shouldPreserveOptimisticSeekTime =
      pendingSeekTarget.value !== null &&
      status !== 'stopped' &&
      (track === undefined || nextTrackId === currentTrackId)

    if (!shouldPreserveOptimisticSeekTime) {
      currentTime.value = nextCurrentTime
    }

    if (track !== undefined) {
      currentTrack.value = track
      trackDuration.value = track?.duration ?? null
    }

    if (nextQueuePreview !== undefined) {
      queuePreview.value = nextQueuePreview
    }
  }

  // A missing field means "this message carries no mode information" (older
  // backend, partial WS payload) — keep what the last status established
  // instead of silently reporting 'off'.
  const applyPlaybackModes = (shuffle?: ShuffleMode, repeat?: RepeatMode): void => {
    if (shuffle !== undefined) {
      shuffleMode.value = shuffle
    }

    if (repeat !== undefined) {
      repeatMode.value = repeat
    }
  }

  const advancePlaybackSnapshotRevision = (): void => {
    playbackSnapshotRevision.value += 1
  }

  const stopProgressClock = (): void => {
    if (progressClock.value !== null) {
      clearInterval(progressClock.value)
      progressClock.value = null
    }
  }

  const startProgressClock = (): void => {
    if (progressClock.value !== null) {
      return
    }

    progressClock.value = setInterval(() => {
      if (!isPlaying.value || isPaused.value || currentTrack.value === null) {
        stopProgressClock()
        return
      }

      const nextTime = currentTime.value + 1
      const maxDuration = trackDuration.value

      currentTime.value =
        maxDuration === null ? nextTime : Math.min(nextTime, Math.max(maxDuration, 0))
    }, 1000)
  }

  const reconcileTransportState = async (
    expectedStatus: 'playing' | 'paused',
  ): Promise<boolean> => {
    const statusResult = await getPlaybackStatus()

    if (!statusResult.ok) {
      return false
    }

    const {
      status,
      currentTime: nextCurrentTime,
      currentTrack: track,
      queuePreview: nextQueuePreview,
      shuffle,
      repeat,
    } = statusResult.value

    advancePlaybackSnapshotRevision()
    applyPlaybackSnapshot(status, nextCurrentTime, track ?? null, nextQueuePreview)
    applyPlaybackModes(shuffle, repeat)

    return status === expectedStatus
  }

  const fetchCurrentStatus = async (): Promise<void> => {
    const startRevision = playbackSnapshotRevision.value
    const result = await getPlaybackStatus()
    if (!result.ok) {
      return // Silently fail — WebSocket will sync on next status change
    }

    if (startRevision !== playbackSnapshotRevision.value) {
      return
    }

    const {
      status,
      currentTime: nextCurrentTime,
      currentTrack: track,
      queuePreview: nextQueuePreview,
      shuffle,
      repeat,
    } = result.value
    applyPlaybackSnapshot(status, nextCurrentTime, track ?? null, nextQueuePreview)
    applyPlaybackModes(shuffle, repeat)
  }

  const fetchCurrentTime = async (): Promise<boolean> => {
    const result = await apiGetCurrentTime()

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'time')
      return false
    }

    currentTime.value = result.value
    return true
  }

  const runSeekMutation = async (seconds: number): Promise<void> => {
    pendingSeekTarget.value = seconds
    currentTime.value = seconds

    const result = await apiSeek(seconds)

    if (!result.ok) {
      pendingSeekTarget.value = null
      queuedSeekTarget.value = null
      error.value = mapPlaybackErrorMessage(result.error, 'seek')
      await fetchCurrentTime()
      return
    }

    const didReconcileCurrentTime = await fetchCurrentTime()
    pendingSeekTarget.value = null

    if (!didReconcileCurrentTime) {
      return
    }

    const nextQueuedSeekTarget = queuedSeekTarget.value
    if (nextQueuedSeekTarget === null || nextQueuedSeekTarget === seconds) {
      queuedSeekTarget.value = null
      return
    }

    queuedSeekTarget.value = null
    await runSeekMutation(nextQueuedSeekTarget)
  }

  const syncPlaybackState = (): void => {
    void fetchCurrentStatus().catch(() => undefined)
  }

  const initializePlaybackSync = (): void => {
    if (hasInitializedSync.value) {
      return
    }

    hasInitializedSync.value = true
    globalPlaybackSyncHandler.value = syncPlaybackState
    syncPlaybackState()

    if (hasRegisteredGlobalPlaybackSyncListeners.value) {
      return
    }

    hasRegisteredGlobalPlaybackSyncListeners.value = true

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          invokeGlobalPlaybackSync()
        }
      })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', invokeGlobalPlaybackSync)
      window.addEventListener('pageshow', invokeGlobalPlaybackSync)
      window.addEventListener('orientationchange', invokeGlobalPlaybackSync)
      window.addEventListener('resize', invokeGlobalPlaybackSync)
    }
  }

  // Subscribe and register handlers immediately at store initialization.
  // The store lives for the entire app lifetime (Pinia keeps it alive across navigation),
  // so handlers must be registered once here — not in component lifecycle hooks.
  const { on, subscribe, onReconnect, connectionState } = useWebSocket() // singleton socket — lives for app lifetime

  subscribe()

  // WS events missed while disconnected are gone for good — resync the full
  // playback state once the socket reconnects.
  onReconnect(syncPlaybackState)

  // Listen to player status changes
  on('player.statusChanged', (payload: PlayerStatusPayload) => {
    advancePlaybackSnapshotRevision()
    applyPlaybackSnapshot(
      payload.status,
      normalizeCurrentTime(payload.status, payload.currentTime),
      payload.currentTrack ? mapStatusTrackToTrackInfo(payload.currentTrack) : null,
      payload.queuePreview ?? [],
    )
    applyPlaybackModes(payload.shuffle, payload.repeat)
  })

  on('player.queue.updated', (payload: QueueUpdatedPayload) => {
    advancePlaybackSnapshotRevision()
    queuePreview.value = mapQueueTracksToQueuePreview(payload.tracks)
  })

  // Listen to system events
  on('system.lmsDisconnected', (_payload: SystemEventPayload) => {
    isLmsDisconnected.value = true
  })

  on('system.lmsReconnected', (_payload: SystemEventPayload) => {
    isLmsDisconnected.value = false
    syncPlaybackState()
  })

  on('system.playerDisconnected', (_payload: SystemEventPayload) => {
    isPlayerDisconnected.value = true
  })

  on('system.playerReconnected', (_payload: SystemEventPayload) => {
    isPlayerDisconnected.value = false
    syncPlaybackState()
  })

  on('system.playerStatusUnavailable', (_payload: SystemEventPayload) => {
    playerStatusUnavailable.value = true
  })

  // Also fires when the backend reclassifies "player gone" as "LMS gone", so
  // the resync here can run against a dead LMS — harmless, it fails silently,
  // and the lmsError arriving with it is what playerAlert then shows.
  on('system.playerStatusRestored', (_payload: SystemEventPayload) => {
    playerStatusUnavailable.value = false
    syncPlaybackState()
  })

  /**
   * Play a track
   *
   * @param track - Track information to play
   */
  const play = async (track: TrackInfo): Promise<void> => {
    isLoading.value = true
    error.value = null

    const result = await playTrack(track.url)

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error)
      isLoading.value = false
      return
    }

    // Success - update playback state
    advancePlaybackSnapshotRevision()
    currentTrack.value = track
    isPlaying.value = true
    isPaused.value = false
    isLoading.value = false
  }

  /**
   * Pause playback
   */
  const pause = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    const result = await pausePlayback()

    if (!result.ok) {
      const didReconcile = await reconcileTransportState('paused')
      error.value = didReconcile ? null : mapPlaybackErrorMessage(result.error, 'pause')
      isLoading.value = false
      return
    }

    // Success - update state
    advancePlaybackSnapshotRevision()
    isPaused.value = true
    isPlaying.value = false
    isLoading.value = false
  }

  /**
   * Resume playback
   */
  const resume = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    const result = await resumePlayback()

    if (!result.ok) {
      const didReconcile = await reconcileTransportState('playing')
      error.value = didReconcile ? null : mapPlaybackErrorMessage(result.error, 'resume')
      isLoading.value = false
      return
    }

    // Success - update state
    advancePlaybackSnapshotRevision()
    isPaused.value = false
    isPlaying.value = true
    isLoading.value = false
  }

  /**
   * Stop playback
   */
  const stop = (): void => {
    advancePlaybackSnapshotRevision()
    currentTrack.value = null
    isPlaying.value = false
    isPaused.value = false
    error.value = null
  }

  /**
   * Clear error state
   */
  const clearError = (): void => {
    error.value = null
  }

  /**
   * Skip to next track
   */
  const skipToNext = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    const result = await nextTrack()

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'next')
      isLoading.value = false
      return
    }

    // Success - WebSocket will update currentTrack
    isLoading.value = false
  }

  /**
   * Skip to previous track
   */
  const skipToPrevious = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    const result = await previousTrack()

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'previous')
      isLoading.value = false
      return
    }

    // Success - WebSocket will update currentTrack
    isLoading.value = false
  }

  /**
   * Advance shuffle to the next mode (optimistic, rolled back on failure)
   */
  const cycleShuffleMode = async (): Promise<void> => {
    const previousMode = shuffleMode.value
    const targetMode = nextShuffleMode(previousMode)

    shuffleMode.value = targetMode
    error.value = null

    const result = await apiSetShuffleMode(targetMode)

    if (!result.ok) {
      // Only undo our own optimistic value: a status update that arrived while
      // the call was in flight reports what the player really does and wins.
      if (shuffleMode.value === targetMode) {
        shuffleMode.value = previousMode
      }
      error.value = mapPlaybackErrorMessage(result.error, 'shuffle')
    }
  }

  /**
   * Advance repeat to the next mode (optimistic, rolled back on failure)
   */
  const cycleRepeatMode = async (): Promise<void> => {
    const previousMode = repeatMode.value
    const targetMode = nextRepeatMode(previousMode)

    repeatMode.value = targetMode
    error.value = null

    const result = await apiSetRepeatMode(targetMode)

    if (!result.ok) {
      // Only undo our own optimistic value: a status update that arrived while
      // the call was in flight reports what the player really does and wins.
      if (repeatMode.value === targetMode) {
        repeatMode.value = previousMode
      }
      error.value = mapPlaybackErrorMessage(result.error, 'repeat')
    }
  }

  /**
   * Set volume level optimistically (for immediate UI feedback)
   * Separates the optimistic update from the API call.
   */
  const setVolumeOptimistic = (level: number): void => {
    const validationError = validateVolumeLevel(level)
    if (validationError !== null) {
      error.value = validationError
      return
    }

    // Optimistic update (immediate UI feedback)
    currentVolume.value = level
    isMuted.value = level === 0
  }

  /**
   * Set volume level (0-100) with API call
   */
  const setVolume = async (level: number): Promise<void> => {
    const validationError = validateVolumeLevel(level)
    if (validationError !== null) {
      error.value = validationError
      return
    }

    const result = await apiSetVolume(level)

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'volume')
      // Rollback on error - fetch current volume
      const rollbackResult = await fetchCurrentVolume()
      if (!rollbackResult) {
        // If rollback also fails, set to safe default
        currentVolume.value = 50
        isMuted.value = false
      }
      return
    }

    // Success - update state (no optimistic update here, already done)
    currentVolume.value = level
    isMuted.value = level === 0
  }

  /**
   * Fetch current volume level
   * Returns a boolean to indicate success or failure.
   */
  const fetchCurrentVolume = async (): Promise<boolean> => {
    const result = await apiGetVolume()

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'volume')
      currentVolume.value = 50 // Default fallback
      return false
    }

    currentVolume.value = result.value
    isMuted.value = result.value === 0
    return true
  }

  /**
   * Toggle mute/unmute
   */
  const toggleMute = async (): Promise<void> => {
    if (isMuted.value) {
      // Unmute - restore previous volume
      const volumeToRestore = volumeBeforeMute.value ?? 50
      await setVolume(volumeToRestore)
      isMuted.value = false
      volumeBeforeMute.value = null
    } else {
      // Mute - save current volume and set to 0
      volumeBeforeMute.value = currentVolume.value ?? 50
      await setVolume(0)
      isMuted.value = true
    }
  }

  /**
   * Seek to specific position in track (optimistic update)
   *
   * @param seconds - Position in seconds (>= 0)
   */
  const seekToPosition = async (seconds: number): Promise<void> => {
    const validationError = validateSeekPosition(seconds, trackDuration.value)
    if (validationError !== null) {
      error.value = validationError
      return
    }

    error.value = null

    if (isSeekRequestInFlight.value) {
      pendingSeekTarget.value = seconds
      queuedSeekTarget.value = seconds
      currentTime.value = seconds
      return
    }

    isSeekRequestInFlight.value = true

    try {
      await runSeekMutation(seconds)
    } finally {
      isSeekRequestInFlight.value = false
    }
  }

  /**
   * Set current time (called from WebSocket listener)
   *
   * @param seconds - Current time in seconds
   */
  const setCurrentTime = (seconds: number): void => {
    currentTime.value = seconds
  }

  /**
   * Set track duration (called when track changes)
   *
   * @param seconds - Track duration in seconds
   */
  const setTrackDuration = (seconds: number): void => {
    trackDuration.value = seconds
  }

  /**
   * Retry LMS connection — polls GET /health, re-subscribes socket on success
   */
  const retryLmsConnection = async (): Promise<void> => {
    isRetryingLms.value = true

    const response = await fetch(getApiUrl('/health'))
      .then<Response | null>((value) => value)
      .catch<Response | null>(() => null)

    if (response?.ok) {
      isLmsDisconnected.value = false
      isRetryingLms.value = false
      subscribe()
      syncPlaybackState()
      return
    }

    isRetryingLms.value = false
  }

  watch(
    () => [isPlaying.value, isPaused.value, currentTrack.value] as const,
    ([playing, paused, track]) => {
      if (playing && !paused && track !== null) {
        startProgressClock()
        return
      }

      stopProgressClock()
    },
    { immediate: true },
  )

  initializePlaybackSync()

  return {
    // State
    currentTrack,
    isPlaying,
    isPaused,
    isLoading,
    error,
    currentVolume,
    isMuted,
    volumeBeforeMute,
    currentTime,
    trackDuration,
    queuePreview,
    shuffleMode,
    repeatMode,
    isRetryingLms,
    playerStatusUnavailable,
    connectionState,
    // Getters
    hasCurrentTrack,
    isCurrentlyPlaying,
    hasError,
    isLmsDisconnected,
    isPlayerDisconnected,
    lmsError,
    playerError,
    playerAlert,
    hasPlayerAlert,
    progressPercent,
    // Actions
    play,
    pause,
    resume,
    stop,
    clearError,
    skipToNext,
    skipToPrevious,
    cycleShuffleMode,
    cycleRepeatMode,
    setVolume,
    setVolumeOptimistic,
    fetchCurrentVolume,
    toggleMute,
    seekToPosition,
    fetchCurrentTime,
    fetchCurrentStatus,
    setCurrentTime,
    setTrackDuration,
    retryLmsConnection,
  }
})
