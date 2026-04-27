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
} from '@/platform/api/playbackApi'
import { mapPlaybackErrorMessage } from '@/utils/errorMessages'
import { useWebSocket } from '@/app/useWebSocket'
import { getApiUrl } from '@/utils/runtimeUrls'
import type {
  PlayerStatusPayload,
  PlayerTrackChangedPayload,
  PlayerVolumeChangedPayload,
  SystemEventPayload,
  QueuePreviewItem,
} from '@signalform/shared'
import {
  calculateProgressPercent,
  getPlaybackState,
  mapStatusTrackToTrackInfo,
  mapTrackChangedToTrackInfo,
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
  // ── State ──────────────────────────────────────────────────
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

  // Queue preview state (Story 4.6)
  const queuePreview = ref<readonly QueuePreviewItem[]>([])

  // LMS connectivity state (S02: actionable error with retry)
  const lmsError = ref<string | null>(null)
  const isRetryingLms = ref(false)
  const hasInitializedSync = ref(false)
  const progressClock = ref<ReturnType<typeof setInterval> | null>(null)

  // ── Getters (Functional Core) ─────────────────────────────
  const hasCurrentTrack = computed(() => currentTrack.value !== null)
  const isCurrentlyPlaying = computed(() => isPlaying.value && !isPaused.value)
  const hasError = computed(() => error.value !== null)
  const isLmsDisconnected = computed(() => lmsError.value !== null)
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
    currentTime.value = nextCurrentTime

    if (track !== undefined) {
      currentTrack.value = track
      trackDuration.value = track?.duration ?? null
    }

    if (nextQueuePreview !== undefined) {
      queuePreview.value = nextQueuePreview
    }
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
    } = statusResult.value

    applyPlaybackSnapshot(status, nextCurrentTime, track ?? null, nextQueuePreview)

    return status === expectedStatus
  }

  const fetchCurrentStatus = async (): Promise<void> => {
    const result = await getPlaybackStatus()
    if (!result.ok) {
      return // Silently fail — WebSocket will sync on next status change
    }

    const {
      status,
      currentTime: nextCurrentTime,
      currentTrack: track,
      queuePreview: nextQueuePreview,
    } = result.value
    applyPlaybackSnapshot(status, nextCurrentTime, track ?? null, nextQueuePreview)
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

  // ── WebSocket Integration (Imperative Shell) ──────────────
  // Subscribe and register handlers immediately at store initialization.
  // The store lives for the entire app lifetime (Pinia keeps it alive across navigation),
  // so handlers must be registered once here — not in component lifecycle hooks.
  const { on, subscribe } = useWebSocket() // singleton socket — lives for app lifetime

  subscribe()

  // Listen to player status changes
  on('player.statusChanged', (payload: PlayerStatusPayload) => {
    applyPlaybackSnapshot(
      payload.status,
      normalizeCurrentTime(payload.status, payload.currentTime),
      payload.currentTrack ? mapStatusTrackToTrackInfo(payload.currentTrack) : null,
      payload.queuePreview ?? [],
    )
  })

  // Listen to track changes
  on('player.trackChanged', (payload: PlayerTrackChangedPayload) => {
    currentTrack.value = mapTrackChangedToTrackInfo(payload.track)
    trackDuration.value = payload.track.duration
    currentTime.value = 0
  })

  // Listen to volume changes
  on('player.volumeChanged', (payload: PlayerVolumeChangedPayload) => {
    currentVolume.value = payload.volume
    isMuted.value = payload.volume === 0
  })

  // Listen to system events
  on('system.lmsDisconnected', (_payload: SystemEventPayload) => {
    lmsError.value = 'Cannot connect to music server'
  })

  on('system.lmsReconnected', (_payload: SystemEventPayload) => {
    lmsError.value = null
    syncPlaybackState()
  })

  // ── Actions (Imperative Shell) ────────────────────────────

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
    isPaused.value = false
    isPlaying.value = true
    isLoading.value = false
  }

  /**
   * Stop playback
   */
  const stop = (): void => {
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
   * Set volume level optimistically (for immediate UI feedback)
   * Fixed (Issue #1, #5): Separate optimistic update from API call
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
      // Fixed (Issue #15): Handle fetchCurrentVolume errors
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
   * Fixed (Issue #15): Return boolean to indicate success/failure
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

    // Optimistic update (immediate visual feedback)
    currentTime.value = seconds

    const result = await apiSeek(seconds)

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'seek')
      // Rollback on error - fetch current time
      await fetchCurrentTime()
      return
    }

    // Success - optimistic update already done
  }

  /**
   * Fetch current playback time
   */
  const fetchCurrentTime = async (): Promise<void> => {
    const result = await apiGetCurrentTime()

    if (!result.ok) {
      error.value = mapPlaybackErrorMessage(result.error, 'time')
      return
    }

    currentTime.value = result.value
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
      lmsError.value = null
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
    lmsError,
    isRetryingLms,
    // Getters
    hasCurrentTrack,
    isCurrentlyPlaying,
    hasError,
    isLmsDisconnected,
    progressPercent,
    // Actions
    play,
    pause,
    resume,
    stop,
    clearError,
    skipToNext,
    skipToPrevious,
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
