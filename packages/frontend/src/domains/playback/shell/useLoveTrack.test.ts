import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ok } from '@signalform/shared'

const { mockSubscribe, mockOn, mockOnReconnect } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockOn: vi.fn(),
  mockOnReconnect: vi.fn(),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): {
    readonly on: typeof mockOn
    readonly subscribe: typeof mockSubscribe
    readonly onReconnect: typeof mockOnReconnect
  } => ({
    on: mockOn,
    subscribe: mockSubscribe,
    onReconnect: mockOnReconnect,
  }),
}))

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(okResult(undefined)),
    nextTrack: vi.fn(),
    previousTrack: vi.fn(),
    pausePlayback: vi.fn(),
    resumePlayback: vi.fn(),
    setVolume: vi.fn(),
    getVolume: vi.fn().mockResolvedValue(okResult(50)),
    seek: vi.fn(),
    getCurrentTime: vi.fn().mockResolvedValue(okResult(0)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        okResult({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

vi.mock('@/platform/api/lastFmLoveApi', () => ({
  loveTrack: vi.fn(),
  unloveTrack: vi.fn(),
}))

vi.mock('@/platform/api/usersApi', () => ({
  getUsers: vi.fn(),
}))

// Import AFTER mocks
import { useLoveTrack } from '@/domains/playback/shell/useLoveTrack'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { useUserStore } from '@/domains/user/shell/useUserStore'
import { loveTrack, unloveTrack } from '@/platform/api/lastFmLoveApi'
import { getUsers } from '@/platform/api/usersApi'

const mockLoveTrack = vi.mocked(loveTrack)
const mockUnloveTrack = vi.mocked(unloveTrack)
const mockGetUsers = vi.mocked(getUsers)

const setCurrentTrack = async (id: string): Promise<void> => {
  const playbackStore = usePlaybackStore()
  // Drain the store's initial status sync so it cannot overwrite the patch below.
  await flushPromises()
  playbackStore.$patch({
    currentTrack: {
      id,
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
    },
  })
}

describe('useLoveTrack', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('hasLastFmSession reflects the selected user in the user store', async () => {
    mockGetUsers.mockResolvedValue(
      ok({
        users: [
          { id: 'u1', name: 'Ada', hasLastFmSession: true, lastFmUsername: 'ada_fm' },
          { id: 'u2', name: 'Ben', hasLastFmSession: false },
        ],
      }),
    )
    const userStore = useUserStore()
    await userStore.load()

    const { hasLastFmSession } = useLoveTrack()
    expect(hasLastFmSession.value).toBe(false)

    userStore.selectUser('u1')
    expect(hasLastFmSession.value).toBe(true)

    userStore.selectUser('u2')
    expect(hasLastFmSession.value).toBe(false)
  })

  it('toggleLove loves the current track and sets isLoved', async () => {
    mockLoveTrack.mockResolvedValue(true)
    await setCurrentTrack('1')

    const { isLoved, toggleLove } = useLoveTrack()
    await toggleLove()

    expect(mockLoveTrack).toHaveBeenCalledWith('Pink Floyd', 'Breathe')
    expect(isLoved.value).toBe(true)
  })

  it('toggleLove unloves an already loved track', async () => {
    mockLoveTrack.mockResolvedValue(true)
    mockUnloveTrack.mockResolvedValue(true)
    await setCurrentTrack('1')

    const { isLoved, toggleLove } = useLoveTrack()
    await toggleLove()
    await toggleLove()

    expect(mockUnloveTrack).toHaveBeenCalledWith('Pink Floyd', 'Breathe')
    expect(isLoved.value).toBe(false)
  })

  it('reverts isLoved when the love request fails', async () => {
    mockLoveTrack.mockResolvedValue(false)
    await setCurrentTrack('1')

    const { isLoved, toggleLove } = useLoveTrack()
    await toggleLove()

    expect(isLoved.value).toBe(false)
  })

  it('does nothing when no track is playing', async () => {
    const { toggleLove } = useLoveTrack()
    await toggleLove()

    expect(mockLoveTrack).not.toHaveBeenCalled()
    expect(mockUnloveTrack).not.toHaveBeenCalled()
  })

  it('resets isLoved when the track changes', async () => {
    mockLoveTrack.mockResolvedValue(true)
    await setCurrentTrack('1')

    const { isLoved, toggleLove } = useLoveTrack()
    await toggleLove()
    expect(isLoved.value).toBe(true)

    await setCurrentTrack('2')
    await nextTick()

    expect(isLoved.value).toBe(false)
  })
})
