/**
 * Shuffle/repeat buttons of PlaybackControls.
 *
 * Sibling file to PlaybackControls.test.ts (transport buttons), kept separate
 * so neither file has to be loaded to work on the other.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { RepeatMode, ShuffleMode } from '@signalform/shared'
import PlaybackControls from '@/domains/playback/ui/PlaybackControls.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    nextTrack: vi.fn().mockResolvedValue(ok(undefined)),
    previousTrack: vi.fn().mockResolvedValue(ok(undefined)),
    pausePlayback: vi.fn().mockResolvedValue(ok(undefined)),
    resumePlayback: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    setShuffleMode: vi.fn().mockResolvedValue(ok(undefined)),
    setRepeatMode: vi.fn().mockResolvedValue(ok(undefined)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

type ModesTestContext = {
  readonly cycleShuffleSpy: ReturnType<typeof vi.spyOn>
  readonly cycleRepeatSpy: ReturnType<typeof vi.spyOn>
  readonly store: ReturnType<typeof usePlaybackStore>
  readonly wrapper: VueWrapper
}

const givenModes = async (shuffle: ShuffleMode, repeat: RepeatMode): Promise<void> => {
  const store = usePlaybackStore()
  store.$patch({ shuffleMode: shuffle, repeatMode: repeat })
  await nextTick()
}

const whenControlsAreMounted = async (): Promise<ModesTestContext> => {
  const store = usePlaybackStore()
  const context: ModesTestContext = {
    cycleShuffleSpy: vi.spyOn(store, 'cycleShuffleMode'),
    cycleRepeatSpy: vi.spyOn(store, 'cycleRepeatMode'),
    store,
    wrapper: mount(PlaybackControls),
  }
  await nextTick()
  return context
}

const clickButton = async (wrapper: VueWrapper, testId: string): Promise<void> => {
  await wrapper.find(`[data-testid="${testId}"]`).trigger('click')
  await nextTick()
}

describe('PlaybackControls shuffle/repeat buttons', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders both mode buttons', async () => {
    const context = await whenControlsAreMounted()

    expect(context.wrapper.find('[data-testid="shuffle-button"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="repeat-button"]').exists()).toBe(true)
  })

  it('triggers cycleShuffleMode on click', async () => {
    const context = await whenControlsAreMounted()

    await clickButton(context.wrapper, 'shuffle-button')

    expect(context.cycleShuffleSpy).toHaveBeenCalledTimes(1)
    expect(context.cycleRepeatSpy).not.toHaveBeenCalled()
  })

  it('triggers cycleRepeatMode on click', async () => {
    const context = await whenControlsAreMounted()

    await clickButton(context.wrapper, 'repeat-button')

    expect(context.cycleRepeatSpy).toHaveBeenCalledTimes(1)
    expect(context.cycleShuffleSpy).not.toHaveBeenCalled()
  })

  it('marks the off state as not pressed and without the active dot', async () => {
    const context = await whenControlsAreMounted()
    await givenModes('off', 'off')

    expect(context.wrapper.find('[data-testid="shuffle-button"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(context.wrapper.find('[data-testid="repeat-button"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(context.wrapper.find('[data-testid="shuffle-active-dot"]').exists()).toBe(false)
    expect(context.wrapper.find('[data-testid="repeat-active-dot"]').exists()).toBe(false)
  })

  it('marks an active mode with aria-pressed and a non-colour indicator', async () => {
    const context = await whenControlsAreMounted()
    await givenModes('songs', 'playlist')

    expect(context.wrapper.find('[data-testid="shuffle-button"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(context.wrapper.find('[data-testid="repeat-button"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(context.wrapper.find('[data-testid="shuffle-active-dot"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="repeat-active-dot"]').exists()).toBe(true)
  })

  it('draws repeat track with a different icon than repeat playlist', async () => {
    const context = await whenControlsAreMounted()

    await givenModes('off', 'playlist')
    const playlistIcon = context.wrapper.find('[data-testid="repeat-icon-playlist"]')
    expect(playlistIcon.exists()).toBe(true)
    const playlistPath = playlistIcon.find('path').attributes('d')

    await givenModes('off', 'track')
    const trackIcon = context.wrapper.find('[data-testid="repeat-icon-track"]')
    expect(trackIcon.exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="repeat-icon-playlist"]').exists()).toBe(false)

    expect(trackIcon.find('path').attributes('d')).not.toBe(playlistPath)
  })

  it('draws shuffle albums with an extra marker that shuffle songs does not have', async () => {
    const context = await whenControlsAreMounted()

    await givenModes('songs', 'off')
    expect(context.wrapper.find('[data-testid="shuffle-icon-songs"] rect').exists()).toBe(false)

    await givenModes('albums', 'off')
    expect(context.wrapper.find('[data-testid="shuffle-icon-albums"] rect').exists()).toBe(true)
  })

  it.each<readonly [ShuffleMode, string]>([
    ['off', 'Shuffle off'],
    ['songs', 'Shuffle songs'],
    ['albums', 'Shuffle albums'],
  ])('labels the shuffle button with the current mode (%s)', async (mode, label) => {
    const context = await whenControlsAreMounted()
    await givenModes(mode, 'off')

    expect(context.wrapper.find('[data-testid="shuffle-button"]').attributes('aria-label')).toBe(
      label,
    )
  })

  it.each<readonly [RepeatMode, string]>([
    ['off', 'Repeat off'],
    ['playlist', 'Repeat queue'],
    ['track', 'Repeat track'],
  ])('labels the repeat button with the current mode (%s)', async (mode, label) => {
    const context = await whenControlsAreMounted()
    await givenModes('off', mode)

    expect(context.wrapper.find('[data-testid="repeat-button"]').attributes('aria-label')).toBe(
      label,
    )
  })

  it('keeps the mode buttons at the 44px touch target', async () => {
    const context = await whenControlsAreMounted()

    const modeButtonIds: readonly string[] = ['shuffle-button', 'repeat-button']

    modeButtonIds.forEach((testId) => {
      const classes = context.wrapper.find(`[data-testid="${testId}"]`).classes()
      expect(classes).toContain('min-h-11')
      expect(classes).toContain('min-w-11')
    })
  })
})
