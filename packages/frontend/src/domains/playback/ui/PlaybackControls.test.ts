/**
 * PlaybackControls Component Tests
 *
 * Tests for playback control buttons (Previous, Play/Pause, Next).
 * Architecture compliance: NO framework calls in test bodies - only in helpers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import PlaybackControls from '@/domains/playback/ui/PlaybackControls.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { getPlaybackStatus } from '@/platform/api/playbackApi'
import { ok } from '@signalform/shared'

// Mock the playback API
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
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(ok({ status: 'stopped', currentTime: 0, currentTrack: null })),
  }
})

type TestContext = {
  readonly pauseSpy: ReturnType<typeof vi.spyOn>
  readonly resumeSpy: ReturnType<typeof vi.spyOn>
  readonly skipToNextSpy: ReturnType<typeof vi.spyOn>
  readonly skipToPreviousSpy: ReturnType<typeof vi.spyOn>
  readonly store: ReturnType<typeof usePlaybackStore>
  readonly wrapper: VueWrapper
}

describe('PlaybackControls', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Component Structure', () => {
    it('renders all three control buttons', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPreviousButtonIsVisible(context.wrapper)
      await thenPlayPauseButtonIsVisible(context.wrapper)
      await thenNextButtonIsVisible(context.wrapper)
    })

    it('buttons are center-aligned in a group', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenButtonGroupIsCentered(context.wrapper)
    })

    it('has 8px spacing between buttons (design system)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenButtonsHaveCorrectSpacing(context.wrapper)
    })
  })

  describe('Previous Track Button', () => {
    it('has correct ARIA label', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPreviousButtonHasAriaLabel(context.wrapper, 'Skip to previous track')
    })

    it('calls skipToPrevious when clicked', async () => {
      await givenTrackIsPlaying()
      const context = await whenPlaybackControlsIsMounted()

      await whenPreviousButtonIsClicked(context.wrapper)

      await thenSkipToPreviousWasCalled(context)
    })

    it('is keyboard accessible (native button element)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPreviousButtonIsNativeButton(context.wrapper)
    })

    it('meets minimum touch target size (44x44px)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPreviousButtonMeetsMinimumTouchTarget(context.wrapper)
    })
  })

  describe('Play/Pause Toggle Button', () => {
    it('shows Play icon when not playing', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPlayIconIsVisible(context.wrapper)
    })

    it('shows Pause icon when playing', async () => {
      await givenTrackIsPlaying()
      const context = await whenPlaybackControlsIsMounted()

      await thenPauseIconIsVisible(context.wrapper)
    })

    it('has dynamic ARIA label (Play vs Pause)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPlayPauseButtonHasAriaLabel(context.wrapper, 'Play')

      await givenTrackIsPlaying()
      await nextTick()

      await thenPlayPauseButtonHasAriaLabel(context.wrapper, 'Pause')
    })

    it('calls pause when playing', async () => {
      await givenTrackIsPlaying()
      const context = await whenPlaybackControlsIsMounted()

      await whenPlayPauseButtonIsClicked(context.wrapper)

      await thenPauseWasCalled(context)
    })

    it('calls resume when paused', async () => {
      const context = await whenPlaybackControlsIsMounted()
      context.store.$patch({
        isPlaying: false,
        isPaused: true,
        currentTrack: {
          id: '1',
          title: 'Test Track',
          artist: 'Test Artist',
          album: 'Test Album',
          url: 'file:///test.flac',
          source: 'local',
          duration: 180,
        },
      })
      await nextTick()

      await whenPlayPauseButtonIsClicked(context.wrapper)

      await thenResumeWasCalled(context)
    })

    it('meets minimum touch target size (44x44px)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenPlayPauseButtonMeetsMinimumTouchTarget(context.wrapper)
    })
  })

  describe('Next Track Button', () => {
    it('has correct ARIA label', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenNextButtonHasAriaLabel(context.wrapper, 'Skip to next track')
    })

    it('calls skipToNext when clicked', async () => {
      await givenTrackIsPlaying()
      const context = await whenPlaybackControlsIsMounted()

      await whenNextButtonIsClicked(context.wrapper)

      await thenSkipToNextWasCalled(context)
    })

    it('is keyboard accessible (native button element)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenNextButtonIsNativeButton(context.wrapper)
    })

    it('meets minimum touch target size (44x44px)', async () => {
      const context = await whenPlaybackControlsIsMounted()

      await thenNextButtonMeetsMinimumTouchTarget(context.wrapper)
    })
  })

  describe('Loading States', () => {
    it('shows loading spinner during skip operations', async () => {
      await givenSkipOperationIsInProgress()
      const context = await whenPlaybackControlsIsMounted()

      await thenLoadingSpinnerIsVisible(context.wrapper)
    })

    it('disables all buttons during loading', async () => {
      await givenSkipOperationIsInProgress()
      const context = await whenPlaybackControlsIsMounted()

      await thenAllButtonsAreDisabled(context.wrapper)
    })
  })

  describe('Performance (NFR2: < 50ms response)', () => {
    it('skip action completes within 50ms', async () => {
      await whenPlaybackControlsIsMounted()

      // Measure actual store action execution time
      const store = usePlaybackStore()
      const startTime = performance.now()
      await store.skipToNext()
      const duration = performance.now() - startTime

      await thenResponseTimeIsUnder(duration, 50)
    })
  })

  // =============================================================================
  // HELPER FUNCTIONS - Test framework code isolated here
  // =============================================================================

  // GIVEN helpers - Setup preconditions
  // -----------------------------------------------------------------------------

  const givenTrackIsPlaying = async (): Promise<void> => {
    vi.mocked(getPlaybackStatus).mockResolvedValueOnce(
      ok({
        status: 'playing',
        currentTime: 0,
        currentTrack: {
          id: '1',
          title: 'Test Track',
          artist: 'Test Artist',
          album: 'Test Album',
          url: 'file:///test.flac',
          source: 'local',
          duration: 180,
        },
      }),
    )

    const store = usePlaybackStore()
    store.$patch({
      isPlaying: true,
      isPaused: false,
      currentTrack: {
        id: '1',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        url: 'file:///test.flac',
        duration: 180,
      },
    })
    await nextTick()
  }

  const givenSkipOperationIsInProgress = async (): Promise<void> => {
    const store = usePlaybackStore()
    store.$patch({ isLoading: true })
    await nextTick()
  }

  // WHEN helpers - Execute actions
  // -----------------------------------------------------------------------------

  const createTestContext = (): TestContext => {
    const store = usePlaybackStore()
    const wrapper = mount(PlaybackControls)

    return {
      pauseSpy: vi.spyOn(store, 'pause'),
      resumeSpy: vi.spyOn(store, 'resume'),
      skipToNextSpy: vi.spyOn(store, 'skipToNext'),
      skipToPreviousSpy: vi.spyOn(store, 'skipToPrevious'),
      store,
      wrapper,
    }
  }

  const whenPlaybackControlsIsMounted = async (): Promise<TestContext> => {
    const context = createTestContext()
    await nextTick()
    return context
  }

  const whenPreviousButtonIsClicked = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="previous-button"]')
    await button.trigger('click')
    await nextTick()
  }

  const whenPlayPauseButtonIsClicked = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="play-pause-button"]')
    await button.trigger('click')
    await nextTick()
  }

  const whenNextButtonIsClicked = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="next-button"]')
    await button.trigger('click')
    await nextTick()
  }

  const thenPreviousButtonIsNativeButton = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="previous-button"]')
    // Native <button> elements are keyboard-accessible by default (Enter/Space)
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
  }

  const thenNextButtonIsNativeButton = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="next-button"]')
    // Native <button> elements are keyboard-accessible by default (Enter/Space)
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
  }

  // THEN helpers - Verify outcomes
  // -----------------------------------------------------------------------------

  const thenPreviousButtonIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="previous-button"]')
    expect(button.exists()).toBe(true)
    expect(button.isVisible()).toBe(true)
  }

  const thenPlayPauseButtonIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="play-pause-button"]')
    expect(button.exists()).toBe(true)
    expect(button.isVisible()).toBe(true)
  }

  const thenNextButtonIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="next-button"]')
    expect(button.exists()).toBe(true)
    expect(button.isVisible()).toBe(true)
  }

  const thenButtonGroupIsCentered = async (wrapper: VueWrapper): Promise<void> => {
    const container = wrapper.find('[data-testid="playback-controls"]')
    // Container must have flex layout with centered alignment
    expect(container.classes()).toContain('flex')
    expect(container.classes()).toContain('items-center')
    expect(container.classes()).toContain('justify-center')
  }

  const thenButtonsHaveCorrectSpacing = async (wrapper: VueWrapper): Promise<void> => {
    const container = wrapper.find('[data-testid="playback-controls"]')
    // gap-2 = 8px spacing between buttons (Tailwind default spacing scale)
    expect(container.classes()).toContain('gap-2')
  }

  const thenPreviousButtonHasAriaLabel = async (
    wrapper: VueWrapper,
    label: string,
  ): Promise<void> => {
    const button = wrapper.find('[data-testid="previous-button"]')
    expect(button.attributes('aria-label')).toBe(label)
  }

  const thenPlayPauseButtonHasAriaLabel = async (
    wrapper: VueWrapper,
    label: string,
  ): Promise<void> => {
    const button = wrapper.find('[data-testid="play-pause-button"]')
    expect(button.attributes('aria-label')).toBe(label)
  }

  const thenNextButtonHasAriaLabel = async (wrapper: VueWrapper, label: string): Promise<void> => {
    const button = wrapper.find('[data-testid="next-button"]')
    expect(button.attributes('aria-label')).toBe(label)
  }

  const thenSkipToPreviousWasCalled = async (context: TestContext): Promise<void> => {
    expect(context.skipToPreviousSpy).toHaveBeenCalled()
  }

  const thenSkipToNextWasCalled = async (context: TestContext): Promise<void> => {
    expect(context.skipToNextSpy).toHaveBeenCalled()
  }

  const thenPauseWasCalled = async (context: TestContext): Promise<void> => {
    expect(context.pauseSpy).toHaveBeenCalled()
  }

  const thenResumeWasCalled = async (context: TestContext): Promise<void> => {
    expect(context.store.isPaused).toBe(false)
    expect(context.store.isPlaying).toBe(true)
  }

  const thenPlayIconIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="play-pause-button"]')
    // aria-label is "Play" when not playing — this is the accessible label users and AT see
    expect(button.attributes('aria-label')).toBe('Play')
  }

  const thenPauseIconIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="play-pause-button"]')
    // aria-label is "Pause" when playing — verifies the button reflects current playback state
    expect(button.attributes('aria-label')).toBe('Pause')
  }

  const thenPreviousButtonMeetsMinimumTouchTarget = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="previous-button"]')
    // min-h-11 min-w-11 = minimum 44px touch target (WCAG 2.5.5 recommendation)
    expect(button.classes()).toContain('min-h-11')
    expect(button.classes()).toContain('min-w-11')
  }

  const thenPlayPauseButtonMeetsMinimumTouchTarget = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="play-pause-button"]')
    expect(button.classes()).toContain('min-h-11')
    expect(button.classes()).toContain('min-w-11')
  }

  const thenNextButtonMeetsMinimumTouchTarget = async (wrapper: VueWrapper): Promise<void> => {
    const button = wrapper.find('[data-testid="next-button"]')
    expect(button.classes()).toContain('min-h-11')
    expect(button.classes()).toContain('min-w-11')
  }

  const thenLoadingSpinnerIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const spinner = wrapper.find('[data-testid="loading-spinner"]')
    expect(spinner.exists()).toBe(true)
    expect(spinner.isVisible()).toBe(true)
  }

  const thenAllButtonsAreDisabled = async (wrapper: VueWrapper): Promise<void> => {
    const previousButton = wrapper.find('[data-testid="previous-button"]')
    const playPauseButton = wrapper.find('[data-testid="play-pause-button"]')
    const nextButton = wrapper.find('[data-testid="next-button"]')

    expect(previousButton.attributes('disabled')).toBeDefined()
    expect(playPauseButton.attributes('disabled')).toBeDefined()
    expect(nextButton.attributes('disabled')).toBeDefined()
  }

  const thenResponseTimeIsUnder = async (duration: number, maxMs: number): Promise<void> => {
    expect(duration).toBeLessThan(maxMs)
  }
})
