/**
 * usePlaybackStore Direct Composable Tests
 *
 * Tests rollback logic, fallback defaults, and state transitions directly
 * against the store — not mediated through UI components.
 *
 * Uses setActivePinia(createPinia()) for isolated store per test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from '@signalform/shared'
import { flushPromises } from '@vue/test-utils'

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const { mockSubscribe, websocketOnMock } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  websocketOnMock: vi.fn<(event: string, handler: (payload: unknown) => void) => void>(),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/platform/api/playbackApi', () => ({
  playTrack: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  setVolume: vi.fn(),
  getVolume: vi.fn(),
  seek: vi.fn(),
  getCurrentTime: vi.fn(),
  getPlaybackStatus: vi.fn(),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): {
    readonly on: typeof websocketOnMock
    readonly subscribe: typeof mockSubscribe
  } => ({
    on: websocketOnMock,
    subscribe: mockSubscribe,
  }),
}))

vi.mock('@/utils/runtimeUrls', () => ({
  getApiUrl: (path: string): string => `http://localhost:3001${path}`,
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { usePlaybackStore } from './usePlaybackStore'
import {
  pausePlayback,
  resumePlayback,
  setVolume as apiSetVolume,
  getVolume as apiGetVolume,
  seek as apiSeek,
  getCurrentTime as apiGetCurrentTime,
  getPlaybackStatus,
} from '@/platform/api/playbackApi'
import type { PlaybackApiError } from '@/platform/api/playbackApi'

const networkErr: PlaybackApiError = { type: 'NETWORK_ERROR', message: 'ECONNREFUSED' }

const mockSetVolume = vi.mocked(apiSetVolume)
const mockGetVolume = vi.mocked(apiGetVolume)
const mockSeek = vi.mocked(apiSeek)
const mockGetCurrentTime = vi.mocked(apiGetCurrentTime)
const mockPausePlayback = vi.mocked(pausePlayback)
const mockResumePlayback = vi.mocked(resumePlayback)
const mockGetPlaybackStatus = vi.mocked(getPlaybackStatus)

const createDeferred = <T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} => {
  let resolve!: (value: T) => void

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockGetPlaybackStatus.mockResolvedValue(err(networkErr))
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── setVolume — rollback paths ───────────────────────────────────────────────

describe('setVolume', () => {
  it('sets currentVolume to the new level on success', async () => {
    mockSetVolume.mockResolvedValue(ok(undefined))

    const store = usePlaybackStore()
    await store.setVolume(75)

    expect(store.currentVolume).toBe(75)
  })

  it('sets error message and calls fetchCurrentVolume when API fails', async () => {
    mockSetVolume.mockResolvedValue(err(networkErr))
    mockGetVolume.mockResolvedValue(ok(60))

    const store = usePlaybackStore()
    await store.setVolume(75)

    // Error must be set
    expect(store.error).not.toBeNull()
    // Rollback must have fetched current volume
    expect(mockGetVolume).toHaveBeenCalledTimes(1)
    // Volume must reflect the rolled-back value from API
    expect(store.currentVolume).toBe(60)
  })

  it('falls back to currentVolume=50 when both setVolume and fetchCurrentVolume fail', async () => {
    mockSetVolume.mockResolvedValue(err(networkErr))
    mockGetVolume.mockResolvedValue(err(networkErr))

    const store = usePlaybackStore()
    await store.setVolume(75)

    // Error set
    expect(store.error).not.toBeNull()
    // Fallback to safe default
    expect(store.currentVolume).toBe(50)
    expect(store.isMuted).toBe(false)
  })
})

// ─── fetchCurrentVolume ───────────────────────────────────────────────────────

describe('fetchCurrentVolume', () => {
  it('updates currentVolume and returns true on success', async () => {
    mockGetVolume.mockResolvedValue(ok(72))

    const store = usePlaybackStore()
    const success = await store.fetchCurrentVolume()

    expect(success).toBe(true)
    expect(store.currentVolume).toBe(72)
  })

  it('sets currentVolume=50 as fallback and returns false on failure', async () => {
    mockGetVolume.mockResolvedValue(err(networkErr))

    const store = usePlaybackStore()
    const success = await store.fetchCurrentVolume()

    expect(success).toBe(false)
    expect(store.currentVolume).toBe(50)
    expect(store.error).not.toBeNull()
  })

  it('sets isMuted=true when fetched volume is 0', async () => {
    mockGetVolume.mockResolvedValue(ok(0))

    const store = usePlaybackStore()
    await store.fetchCurrentVolume()

    expect(store.isMuted).toBe(true)
  })
})

// ─── toggleMute ───────────────────────────────────────────────────────────────

describe('toggleMute', () => {
  it('saves currentVolume and sets volume to 0 when unmuted', async () => {
    mockSetVolume.mockResolvedValue(ok(undefined))

    const store = usePlaybackStore()
    store.$patch({ currentVolume: 65 })

    await store.toggleMute()

    expect(mockSetVolume).toHaveBeenCalledWith(0)
    expect(store.isMuted).toBe(true)
  })

  it('restores volumeBeforeMute when already muted', async () => {
    mockSetVolume.mockResolvedValue(ok(undefined))

    const store = usePlaybackStore()
    store.$patch({ currentVolume: 65 })

    // Mute first
    await store.toggleMute()
    expect(store.isMuted).toBe(true)

    // Unmute — should restore 65
    await store.toggleMute()

    expect(mockSetVolume).toHaveBeenLastCalledWith(65)
    expect(store.isMuted).toBe(false)
  })

  it('restores volume to 50 when volumeBeforeMute is null', async () => {
    mockSetVolume.mockResolvedValue(ok(undefined))

    const store = usePlaybackStore()
    // Force muted state without going through toggleMute (simulates external state)
    store.$patch({ isMuted: true })

    await store.toggleMute()

    // volumeBeforeMute was null → falls back to 50
    expect(mockSetVolume).toHaveBeenCalledWith(50)
  })
})

// ─── stop ─────────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('resets isPlaying, isPaused, currentTrack, and error', () => {
    const store = usePlaybackStore()
    store.$patch({
      isPlaying: true,
      isPaused: false,
      currentTrack: {
        id: '1',
        title: 'Track',
        artist: 'Artist',
        album: 'Album',
        url: 'file:///track.flac',
        source: 'local',
      },
    })

    store.stop()

    expect(store.isPlaying).toBe(false)
    expect(store.isPaused).toBe(false)
    expect(store.currentTrack).toBeNull()
    expect(store.error).toBeNull()
  })
})

describe('pause and resume reconciliation', () => {
  it('treats pause as successful when the API call errors but status is already paused', async () => {
    mockPausePlayback.mockResolvedValue(err(networkErr))
    mockGetPlaybackStatus.mockResolvedValue(
      ok({ status: 'paused', currentTime: 12, currentTrack: undefined, queuePreview: [] }),
    )

    const store = usePlaybackStore()
    store.$patch({ isPlaying: true, isPaused: false })

    await store.pause()

    expect(store.error).toBeNull()
    expect(store.isPaused).toBe(true)
    expect(store.isPlaying).toBe(false)
  })

  it('treats resume as successful when the API call errors but status is already playing', async () => {
    mockResumePlayback.mockResolvedValue(err(networkErr))
    mockGetPlaybackStatus.mockResolvedValue(
      ok({ status: 'playing', currentTime: 24, currentTrack: undefined, queuePreview: [] }),
    )

    const store = usePlaybackStore()
    store.$patch({ isPlaying: false, isPaused: true })

    await store.resume()

    expect(store.error).toBeNull()
    expect(store.isPaused).toBe(false)
    expect(store.isPlaying).toBe(true)
  })

  it('keeps the error when pause fails and the fetched status is not paused', async () => {
    mockPausePlayback.mockResolvedValue(err(networkErr))
    mockGetPlaybackStatus.mockResolvedValue(
      ok({ status: 'playing', currentTime: 9, currentTrack: undefined, queuePreview: [] }),
    )

    const store = usePlaybackStore()
    store.$patch({ isPlaying: true, isPaused: false })

    await store.pause()

    expect(store.error).not.toBeNull()
    expect(store.isPlaying).toBe(true)
    expect(store.isPaused).toBe(false)
  })
})

describe('initial playback sync', () => {
  it('fetches playback status immediately when the store is created', async () => {
    mockGetPlaybackStatus.mockResolvedValueOnce(
      ok({
        status: 'playing',
        currentTime: 18,
        currentTrack: {
          id: 'track-1',
          title: 'Money',
          artist: 'Pink Floyd',
          album: 'The Dark Side of the Moon',
          url: 'file:///music/money.flac',
          source: 'local',
          duration: 382,
        },
        queuePreview: [
          {
            id: 'track-2',
            title: 'Brain Damage',
            artist: 'Pink Floyd',
          },
        ],
      }),
    )

    const store = usePlaybackStore()
    await flushPromises()

    expect(mockGetPlaybackStatus).toHaveBeenCalledTimes(1)
    expect(store.currentTrack?.title).toBe('Money')
    expect(store.currentTime).toBe(18)
    expect(store.queuePreview).toEqual([
      {
        id: 'track-2',
        title: 'Brain Damage',
        artist: 'Pink Floyd',
      },
    ])
    expect(store.hasCurrentTrack).toBe(true)
  })

  it('clears a stale track when the refreshed status has no current track', async () => {
    mockGetPlaybackStatus.mockResolvedValueOnce(
      ok({
        status: 'stopped',
        currentTime: 0,
        currentTrack: undefined,
        queuePreview: [],
      }),
    )

    const store = usePlaybackStore()
    store.$patch({
      currentTrack: {
        id: 'stale-track',
        title: 'Stale',
        artist: 'Artist',
        album: 'Album',
        url: 'file:///stale.flac',
        source: 'local',
      },
      trackDuration: 120,
      isPlaying: true,
    })

    await flushPromises()

    expect(store.currentTrack).toBeNull()
    expect(store.trackDuration).toBeNull()
    expect(store.isPlaying).toBe(false)
  })

  it('re-syncs playback status when the app regains focus', async () => {
    mockGetPlaybackStatus
      .mockResolvedValueOnce(
        ok({
          status: 'paused',
          currentTime: 11,
          currentTrack: {
            id: 'track-1',
            title: 'Before',
            artist: 'Artist',
            album: 'Album',
            url: 'file:///before.flac',
            source: 'local',
          },
          queuePreview: [
            {
              id: 'track-2',
              title: 'Before Next',
              artist: 'Artist',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({
          status: 'playing',
          currentTime: 44,
          currentTrack: {
            id: 'track-2',
            title: 'After',
            artist: 'Artist',
            album: 'Album',
            url: 'file:///after.flac',
            source: 'local',
          },
          queuePreview: [
            {
              id: 'track-3',
              title: 'After Next',
              artist: 'Artist',
            },
          ],
        }),
      )

    const store = usePlaybackStore()
    await flushPromises()

    window.dispatchEvent(new Event('focus'))
    await flushPromises()

    expect(mockGetPlaybackStatus).toHaveBeenCalledTimes(2)
    expect(store.currentTrack?.title).toBe('After')
    expect(store.currentTime).toBe(44)
    expect(store.queuePreview).toEqual([
      {
        id: 'track-3',
        title: 'After Next',
        artist: 'Artist',
      },
    ])
    expect(store.isCurrentlyPlaying).toBe(true)
  })
})

// ─── seekToPosition — rollback ────────────────────────────────────────────────

describe('seekToPosition', () => {
  it('applies optimistic update, calls API, and reconciles current time', async () => {
    mockSeek.mockResolvedValue(ok(undefined))
    mockGetCurrentTime.mockResolvedValue(ok(92))

    const store = usePlaybackStore()
    store.$patch({ trackDuration: 300 })
    await store.seekToPosition(90)

    expect(store.currentTime).toBe(92)
    expect(mockSeek).toHaveBeenCalledWith(90)
    expect(mockGetCurrentTime).toHaveBeenCalledTimes(1)
  })

  it('rolls back to fetched time when API fails', async () => {
    mockSeek.mockResolvedValue(
      err({ type: 'NETWORK_ERROR', message: 'fail' } satisfies PlaybackApiError),
    )
    mockGetCurrentTime.mockResolvedValue(ok(45))

    const store = usePlaybackStore()
    store.$patch({ trackDuration: 300, currentTime: 30 })

    await store.seekToPosition(90)

    // Error set
    expect(store.error).not.toBeNull()
    // Rollback: fetchCurrentTime was called and returned 45
    expect(mockGetCurrentTime).toHaveBeenCalledTimes(1)
    expect(store.currentTime).toBe(45)
  })

  it('sets error but does not change time when seek position is negative', async () => {
    const store = usePlaybackStore()
    store.$patch({ trackDuration: 300, currentTime: 30 })

    await store.seekToPosition(-1)

    // API must not be called
    expect(mockSeek).not.toHaveBeenCalled()
    // Error set
    expect(store.error).not.toBeNull()
    // Time unchanged
    expect(store.currentTime).toBe(30)
  })

  it('serializes concurrent seeks and commits the latest queued target afterwards', async () => {
    const firstSeek = createDeferred<ReturnType<typeof ok<void>>>()
    mockSeek.mockReturnValueOnce(firstSeek.promise).mockResolvedValueOnce(ok(undefined))
    mockGetCurrentTime.mockResolvedValueOnce(ok(90)).mockResolvedValueOnce(ok(120))

    const store = usePlaybackStore()
    store.$patch({ trackDuration: 300, currentTime: 30 })

    const firstRequest = store.seekToPosition(90)
    expect(store.currentTime).toBe(90)

    await store.seekToPosition(120)
    expect(store.currentTime).toBe(120)
    expect(mockSeek).toHaveBeenCalledTimes(1)

    firstSeek.resolve(ok(undefined))
    await firstRequest

    expect(mockSeek).toHaveBeenCalledTimes(2)
    expect(mockSeek).toHaveBeenNthCalledWith(1, 90)
    expect(mockSeek).toHaveBeenNthCalledWith(2, 120)
    expect(mockGetCurrentTime).toHaveBeenCalledTimes(2)
    expect(store.currentTime).toBe(120)
  })

  it('keeps optimistic seek time when a stale status event arrives before reconciliation finishes', async () => {
    const seekDeferred = createDeferred<ReturnType<typeof ok<void>>>()
    const currentTimeDeferred = createDeferred<ReturnType<typeof ok<number>>>()
    mockSeek.mockReturnValueOnce(seekDeferred.promise)
    mockGetCurrentTime.mockReturnValueOnce(currentTimeDeferred.promise)

    const store = usePlaybackStore()
    store.$patch({
      trackDuration: 300,
      currentTime: 30,
      currentTrack: {
        id: 'track-1',
        title: 'Track',
        artist: 'Artist',
        album: 'Album',
        url: 'file:///track.flac',
        source: 'local',
        duration: 300,
      },
      isPlaying: true,
    })

    const seekRequest = store.seekToPosition(90)

    const statusHandler = websocketOnMock.mock.calls.find(
      ([event]) => event === 'player.statusChanged',
    )?.[1]

    seekDeferred.resolve(ok(undefined))
    await Promise.resolve()

    statusHandler?.({
      playerId: 'player-1',
      status: 'playing',
      currentTime: 31,
      timestamp: Date.now(),
      currentTrack: {
        id: 'track-1',
        title: 'Track',
        artist: 'Artist',
        album: 'Album',
        duration: 300,
        sources: [{ url: 'file:///track.flac', source: 'local' }],
      },
      queuePreview: [],
    })

    expect(store.currentTime).toBe(90)

    currentTimeDeferred.resolve(ok(91))
    await seekRequest

    expect(store.currentTime).toBe(91)
  })
})

// ─── WebSocket: player.statusChanged ─────────────────────────────────────────

describe('WebSocket player.statusChanged handler', () => {
  it('updates isPlaying=true and currentTrack when status is "playing"', () => {
    const store = usePlaybackStore()

    // Find the handler registered for player.statusChanged
    const handler = websocketOnMock.mock.calls.find(
      ([event]) => event === 'player.statusChanged',
    )?.[1]

    expect(handler).toBeDefined()

    handler?.({
      playerId: 'player-1',
      status: 'playing',
      currentTime: 42,
      timestamp: Date.now(),
      currentTrack: {
        id: '1',
        title: 'Money',
        artist: 'Pink Floyd',
        album: 'Dark Side',
        duration: 380,
        sources: [{ url: 'file:///money.flac', source: 'local' }],
      },
      queuePreview: [],
    })

    expect(store.isPlaying).toBe(true)
    expect(store.isPaused).toBe(false)
    expect(store.currentTrack?.title).toBe('Money')
  })

  it('updates isPlaying=false, isPaused=true when status is "paused"', () => {
    const store = usePlaybackStore()

    const handler = websocketOnMock.mock.calls.find(
      ([event]) => event === 'player.statusChanged',
    )?.[1]

    handler?.({
      playerId: 'player-1',
      status: 'paused',
      currentTime: 10,
      timestamp: Date.now(),
      currentTrack: undefined,
      queuePreview: [],
    })

    expect(store.isPlaying).toBe(false)
    expect(store.isPaused).toBe(true)
  })
})

describe('progress ticking', () => {
  it('increments current time locally while playback is running', async () => {
    vi.useFakeTimers()
    mockGetPlaybackStatus.mockResolvedValueOnce(
      ok({
        status: 'playing',
        currentTime: 5,
        queuePreview: [],
        currentTrack: {
          id: 'track-1',
          title: 'Time',
          artist: 'Pink Floyd',
          album: 'The Dark Side of the Moon',
          url: 'file:///music/time.flac',
          source: 'local',
          duration: 10,
        },
      }),
    )

    const store = usePlaybackStore()
    await flushPromises()

    vi.advanceTimersByTime(3000)

    expect(store.currentTime).toBe(8)
  })
})
