import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed } from 'vue'
import type { Router } from 'vue-router'
import MiniPlayer from './MiniPlayer.vue'
import { usePhonePlaybackShortcut } from '@/domains/playback/shell/usePhonePlaybackShortcut'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { setupTestEnv, createTestRouter } from '@/test-utils'

vi.mock('@/domains/playback/shell/usePhonePlaybackShortcut', () => ({
  usePhonePlaybackShortcut: vi.fn(),
}))

const mockUsePhonePlaybackShortcut = vi.mocked(usePhonePlaybackShortcut)

type PlaybackShortcutState = {
  readonly title?: string
  readonly artist?: string
  readonly isPlaying?: boolean
  readonly hasQueuedTracks?: boolean
  readonly shouldShow?: boolean
  readonly label?: string
}

// Drives a real playback store so the mini-player reads a correctly-typed store,
// while the shortcut composable's derived flags are stubbed for control.
const stubPhonePlaybackShortcut = (state: PlaybackShortcutState = {}): void => {
  const playbackStore = usePlaybackStore()
  const hasTrack = state.title !== undefined || state.artist !== undefined
  playbackStore.$patch({
    currentTrack: hasTrack
      ? {
          id: '1',
          title: state.title ?? '',
          artist: state.artist ?? '',
          album: 'Test Album',
          url: 'track://1',
        }
      : null,
    isPlaying: state.isPlaying ?? false,
    isPaused: false,
  })

  mockUsePhonePlaybackShortcut.mockReturnValue({
    playbackStore,
    hasQueuedTracks: computed(() => state.hasQueuedTracks ?? false),
    shouldShowPhonePlaybackShortcut: computed(() => state.shouldShow ?? true),
    phonePlaybackShortcutLabel: computed(() => state.label ?? 'Open Now Playing'),
  })
}

const mountMiniPlayer = async (): Promise<{
  readonly wrapper: VueWrapper
  readonly router: Router
}> => {
  const router = await createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/now-playing', name: 'now-playing', component: { template: '<div />' } },
    { path: '/queue', name: 'queue', component: { template: '<div />' } },
  ])
  const wrapper = mount(MiniPlayer, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('MiniPlayer', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the current track title and artist when a track is playing', async () => {
    stubPhonePlaybackShortcut({ title: 'Test Track', artist: 'Test Artist', isPlaying: true })

    const { wrapper } = await mountMiniPlayer()

    expect(wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mini-player-title"]').text()).toBe('Test Track')
    expect(wrapper.find('[data-testid="mini-player-artist"]').text()).toBe('Test Artist')
  })

  it('is not rendered when the phone playback shortcut should be hidden', async () => {
    stubPhonePlaybackShortcut({ shouldShow: false })

    const { wrapper } = await mountMiniPlayer()

    expect(wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(false)
  })

  it('navigates to Now Playing when the mini-player is clicked', async () => {
    stubPhonePlaybackShortcut({ title: 'Test Track', artist: 'Test Artist' })

    const { wrapper, router } = await mountMiniPlayer()

    await wrapper.find('[data-testid="mini-player"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/now-playing')
  })

  it('navigates to the queue when the queue shortcut is clicked', async () => {
    stubPhonePlaybackShortcut({ title: 'Test Track', artist: 'Test Artist' })

    const { wrapper, router } = await mountMiniPlayer()

    await wrapper.find('[data-testid="mini-player-queue"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/queue')
  })

  it('toggles playback without navigating when playing (calls pause)', async () => {
    stubPhonePlaybackShortcut({ title: 'Test Track', artist: 'Test Artist', isPlaying: true })

    const { wrapper, router } = await mountMiniPlayer()
    const playbackStore = usePlaybackStore()
    const pauseSpy = vi.spyOn(playbackStore, 'pause').mockResolvedValue(undefined)
    const resumeSpy = vi.spyOn(playbackStore, 'resume').mockResolvedValue(undefined)

    await wrapper.find('[data-testid="mini-player-playpause"]').trigger('click')
    await flushPromises()

    expect(pauseSpy).toHaveBeenCalledTimes(1)
    expect(resumeSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('toggles playback without navigating when paused (calls resume)', async () => {
    const playbackStore = usePlaybackStore()
    playbackStore.$patch({
      currentTrack: {
        id: '1',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        url: 'track://1',
      },
      isPlaying: false,
      isPaused: true,
    })

    mockUsePhonePlaybackShortcut.mockReturnValue({
      playbackStore,
      hasQueuedTracks: computed(() => false),
      shouldShowPhonePlaybackShortcut: computed(() => true),
      phonePlaybackShortcutLabel: computed(() => 'Now Playing'),
    })

    const { wrapper, router } = await mountMiniPlayer()
    const pauseSpy = vi.spyOn(playbackStore, 'pause').mockResolvedValue(undefined)
    const resumeSpy = vi.spyOn(playbackStore, 'resume').mockResolvedValue(undefined)

    await wrapper.find('[data-testid="mini-player-playpause"]').trigger('click')
    await flushPromises()

    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(pauseSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('falls back to queue labels when only queued tracks exist', async () => {
    stubPhonePlaybackShortcut({ hasQueuedTracks: true, label: 'View Full Queue' })

    const { wrapper } = await mountMiniPlayer()

    expect(wrapper.find('[data-testid="mini-player-title"]').text()).toBe('Queue')
    expect(wrapper.find('[data-testid="mini-player-artist"]').text()).toBe('View Full Queue')
  })
})
