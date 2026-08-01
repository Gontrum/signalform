/**
 * Shuffle/repeat mode state in usePlaybackStore.
 *
 * Sibling file to usePlaybackStore.test.ts, which is already past the 20 KB
 * mark AGENTS.md sets for splitting test files.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from '@signalform/shared'
import type { RepeatMode, ShuffleMode } from '@signalform/shared'
import { flushPromises } from '@vue/test-utils'

const { mockSubscribe, websocketOnMock, mockOnReconnect } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  websocketOnMock: vi.fn<(event: string, handler: (payload: unknown) => void) => void>(),
  mockOnReconnect: vi.fn<(callback: () => void) => void>(),
}))

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
  setShuffleMode: vi.fn(),
  setRepeatMode: vi.fn(),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): {
    readonly on: typeof websocketOnMock
    readonly subscribe: typeof mockSubscribe
    readonly onReconnect: typeof mockOnReconnect
  } => ({
    on: websocketOnMock,
    subscribe: mockSubscribe,
    onReconnect: mockOnReconnect,
  }),
}))

vi.mock('@/utils/runtimeUrls', () => ({
  getApiUrl: (path: string): string => `http://localhost:3001${path}`,
}))

import { usePlaybackStore } from './usePlaybackStore'
import {
  getPlaybackStatus,
  setShuffleMode as apiSetShuffleMode,
  setRepeatMode as apiSetRepeatMode,
} from '@/platform/api/playbackApi'
import type { PlaybackApiError } from '@/platform/api/playbackApi'

const networkErr: PlaybackApiError = { type: 'NETWORK_ERROR', message: 'ECONNREFUSED' }

const mockGetPlaybackStatus = vi.mocked(getPlaybackStatus)
const mockSetShuffleMode = vi.mocked(apiSetShuffleMode)
const mockSetRepeatMode = vi.mocked(apiSetRepeatMode)

const givenStatusReturns = (shuffle?: ShuffleMode, repeat?: RepeatMode): void => {
  mockGetPlaybackStatus.mockResolvedValue(
    ok({
      status: 'playing' as const,
      currentTime: 12,
      queuePreview: [],
      shuffle,
      repeat,
    }),
  )
}

const emitStatusChanged = (payload: {
  readonly shuffle?: ShuffleMode
  readonly repeat?: RepeatMode
}): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'player.statusChanged',
  )?.[1]

  handler?.({
    playerId: 'player-1',
    status: 'playing',
    currentTime: 5,
    timestamp: Date.now(),
    queuePreview: [],
    ...payload,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockGetPlaybackStatus.mockResolvedValue(err(networkErr))
  mockSetShuffleMode.mockResolvedValue(ok(undefined))
  mockSetRepeatMode.mockResolvedValue(ok(undefined))
})

describe('mode state follows the server', () => {
  it('starts at off before any status has arrived', () => {
    const store = usePlaybackStore()

    expect(store.shuffleMode).toBe('off')
    expect(store.repeatMode).toBe('off')
  })

  it('adopts the modes reported by GET /api/playback/status', async () => {
    givenStatusReturns('albums', 'track')

    const store = usePlaybackStore()
    await store.fetchCurrentStatus()

    expect(store.shuffleMode).toBe('albums')
    expect(store.repeatMode).toBe('track')
  })

  it('keeps the known modes when a status omits them', async () => {
    givenStatusReturns('songs', 'playlist')
    const store = usePlaybackStore()
    await store.fetchCurrentStatus()

    givenStatusReturns(undefined, undefined)
    await store.fetchCurrentStatus()

    expect(store.shuffleMode).toBe('songs')
    expect(store.repeatMode).toBe('playlist')
  })

  it('follows a status change made by another LMS client, with no user interaction', () => {
    const store = usePlaybackStore()

    expect(store.shuffleMode).toBe('off')
    expect(store.repeatMode).toBe('off')

    emitStatusChanged({ shuffle: 'songs', repeat: 'playlist' })

    expect(store.shuffleMode).toBe('songs')
    expect(store.repeatMode).toBe('playlist')
    expect(mockSetShuffleMode).not.toHaveBeenCalled()
    expect(mockSetRepeatMode).not.toHaveBeenCalled()
  })

  it('lets a later external change overwrite a mode the user just set', async () => {
    const store = usePlaybackStore()
    await store.cycleShuffleMode()
    expect(store.shuffleMode).toBe('songs')

    emitStatusChanged({ shuffle: 'off' })

    expect(store.shuffleMode).toBe('off')
  })
})

describe('cycleShuffleMode', () => {
  it.each<readonly [ShuffleMode, ShuffleMode]>([
    ['off', 'songs'],
    ['songs', 'albums'],
    ['albums', 'off'],
  ])('sends the successor of %s (%s) and shows it', async (current, expected) => {
    const store = usePlaybackStore()
    emitStatusChanged({ shuffle: current })

    await store.cycleShuffleMode()

    expect(mockSetShuffleMode).toHaveBeenCalledWith(expected)
    expect(store.shuffleMode).toBe(expected)
  })

  it('never posts the mode that is already active', async () => {
    const store = usePlaybackStore()
    emitStatusChanged({ shuffle: 'songs' })

    await store.cycleShuffleMode()

    expect(mockSetShuffleMode).not.toHaveBeenCalledWith('songs')
  })

  it('rolls back to the server mode and reports the error when the call fails', async () => {
    mockSetShuffleMode.mockResolvedValue(err(networkErr))

    const store = usePlaybackStore()
    emitStatusChanged({ shuffle: 'albums' })

    await store.cycleShuffleMode()

    expect(mockSetShuffleMode).toHaveBeenCalledWith('off')
    expect(store.shuffleMode).toBe('albums')
    expect(store.error).toContain('change shuffle mode')
  })

  it('keeps a mode another client set while the failing call was in flight', async () => {
    let failTheCall = (): void => expect.unreachable('setShuffleMode was never called')
    mockSetShuffleMode.mockImplementation(
      () =>
        new Promise((resolve) => {
          failTheCall = (): void => resolve(err(networkErr))
        }),
    )

    const store = usePlaybackStore()
    emitStatusChanged({ shuffle: 'off' })

    const pending = store.cycleShuffleMode()
    await flushPromises()
    expect(mockSetShuffleMode).toHaveBeenCalledWith('songs')
    expect(store.shuffleMode).toBe('songs')

    emitStatusChanged({ shuffle: 'albums' })
    expect(store.shuffleMode).toBe('albums')

    failTheCall()
    await pending

    expect(store.shuffleMode).toBe('albums')
    expect(store.error).toContain('change shuffle mode')
  })
})

describe('cycleRepeatMode', () => {
  it.each<readonly [RepeatMode, RepeatMode]>([
    ['off', 'playlist'],
    ['playlist', 'track'],
    ['track', 'off'],
  ])('sends the successor of %s (%s) and shows it', async (current, expected) => {
    const store = usePlaybackStore()
    emitStatusChanged({ repeat: current })

    await store.cycleRepeatMode()

    expect(mockSetRepeatMode).toHaveBeenCalledWith(expected)
    expect(store.repeatMode).toBe(expected)
  })

  it('never posts the mode that is already active', async () => {
    const store = usePlaybackStore()
    emitStatusChanged({ repeat: 'playlist' })

    await store.cycleRepeatMode()

    expect(mockSetRepeatMode).not.toHaveBeenCalledWith('playlist')
  })

  it('rolls back to the server mode and reports the error when the call fails', async () => {
    mockSetRepeatMode.mockResolvedValue(err(networkErr))

    const store = usePlaybackStore()
    emitStatusChanged({ repeat: 'track' })

    await store.cycleRepeatMode()

    expect(mockSetRepeatMode).toHaveBeenCalledWith('off')
    expect(store.repeatMode).toBe('track')
    expect(store.error).toContain('change repeat mode')
  })

  it('keeps a mode another client set while the failing call was in flight', async () => {
    let failTheCall = (): void => expect.unreachable('setRepeatMode was never called')
    mockSetRepeatMode.mockImplementation(
      () =>
        new Promise((resolve) => {
          failTheCall = (): void => resolve(err(networkErr))
        }),
    )

    const store = usePlaybackStore()
    emitStatusChanged({ repeat: 'off' })

    const pending = store.cycleRepeatMode()
    await flushPromises()
    expect(mockSetRepeatMode).toHaveBeenCalledWith('playlist')
    expect(store.repeatMode).toBe('playlist')

    emitStatusChanged({ repeat: 'track' })
    expect(store.repeatMode).toBe('track')

    failTheCall()
    await pending

    expect(store.repeatMode).toBe('track')
    expect(store.error).toContain('change repeat mode')
  })

  it('leaves shuffle untouched', async () => {
    const store = usePlaybackStore()
    emitStatusChanged({ shuffle: 'albums', repeat: 'off' })

    await store.cycleRepeatMode()
    await flushPromises()

    expect(store.shuffleMode).toBe('albums')
    expect(mockSetShuffleMode).not.toHaveBeenCalled()
  })
})
