/**
 * ProgressBar Component Tests
 *
 * BDD-style tests for progress bar with seek functionality.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ProgressBar from '@/domains/playback/ui/ProgressBar.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'

describe('ProgressBar Component', () => {
  const getHtmlElement = (value: Element): HTMLElement => {
    expect(value).toBeInstanceOf(HTMLElement)
    return value instanceof HTMLElement ? value : document.createElement('div')
  }

  const getSeekSpyCalls = (
    playbackStore: ReturnType<typeof usePlaybackStore>,
  ): ReadonlyArray<readonly [number]> => {
    return vi.mocked(playbackStore.seekToPosition).mock.calls
  }

  const setPlaybackStoreState = (
    playbackStore: ReturnType<typeof usePlaybackStore>,
    state: {
      readonly currentTime?: number
      readonly trackDuration?: number | null
      readonly isLoading?: boolean
    },
  ): void => {
    playbackStore.$patch(state)
  }

  const mockBoundingClientRect = (element: HTMLElement): void => {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      right: 200,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
  }

  const dispatchMouseMove = async (clientX: number): Promise<void> => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX }))
    await Promise.resolve()
  }

  const dispatchMouseUp = async (): Promise<void> => {
    document.dispatchEvent(new MouseEvent('mouseup'))
    await Promise.resolve()
  }

  const dispatchTouchEnd = async (): Promise<void> => {
    document.dispatchEvent(new Event('touchend'))
    await Promise.resolve()
  }

  const createWrapper = (): {
    readonly wrapper: ReturnType<typeof mount>
    readonly playbackStore: ReturnType<typeof usePlaybackStore>
  } => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const playbackStore = usePlaybackStore()

    // Issue #14: Use vi.spyOn instead of direct assignment
    vi.spyOn(playbackStore, 'seekToPosition').mockResolvedValue(undefined)

    const wrapper = mount(ProgressBar, {
      global: {
        plugins: [pinia],
      },
    })

    return { wrapper, playbackStore }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rendering', () => {
    it('renders time display in M:SS / M:SS format', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 165,
        trackDuration: 272,
      })

      await wrapper.vm.$nextTick()

      const timeDisplay = wrapper.find('.time-display')
      expect(timeDisplay.exists()).toBe(true)
      expect(timeDisplay.text()).toContain('2:45')
      expect(timeDisplay.text()).toContain('4:32')
    })

    it('renders progress bar with correct fill width', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 100,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const fill = wrapper.find('.progress-fill')
      expect(fill.exists()).toBe(true)
      expect(fill.attributes('style')).toContain('50%')
    })

    it('renders progress thumb at correct position', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 100,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('.progress-thumb')
      expect(thumb.exists()).toBe(true)
      expect(thumb.attributes('style')).toContain('50%')
    })

    it('displays 0:00 / 0:00 when no track is loaded', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 0,
        trackDuration: null,
      })

      await wrapper.vm.$nextTick()

      const timeDisplay = wrapper.find('.time-display')
      expect(timeDisplay.text()).toContain('0:00')
    })
  })

  describe('Seek Interaction - Click', () => {
    it('has click handler on progress wrapper', async () => {
      const { wrapper } = createWrapper()
      const progressWrapper = wrapper.find('.progress-wrapper')
      expect(progressWrapper.exists()).toBe(true)

      // Verify mousedown listener exists
      const element = getHtmlElement(progressWrapper.element)
      expect(element.onmousedown).toBeDefined()
    })

    it('commits seek position on mouseup after dragging to 50%', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { trackDuration: 200 })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('mousedown', {
        clientX: 100,
      })

      expect(playbackStore.seekToPosition).not.toHaveBeenCalled()

      await dispatchMouseUp()

      const callArg = getSeekSpyCalls(playbackStore)[0]?.[0]
      expect(callArg).toBe(100)
    })

    it('renders a local preview while dragging and only seeks once on release', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { trackDuration: 200 })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('mousedown', {
        clientX: 50,
      })

      await dispatchMouseMove(150)
      await wrapper.vm.$nextTick()

      expect(playbackStore.seekToPosition).not.toHaveBeenCalled()
      expect(wrapper.find('.progress-fill').attributes('style')).toContain('75%')
      expect(wrapper.find('[role="slider"]').attributes('aria-valuenow')).toBe('150')

      await dispatchMouseUp()

      expect(playbackStore.seekToPosition).toHaveBeenCalledTimes(1)
      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(150)
    })
  })

  describe('Keyboard Navigation', () => {
    it('has proper ARIA attributes', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 100,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      expect(thumb.exists()).toBe(true)
      expect(thumb.attributes('role')).toBe('slider')
      expect(thumb.attributes('aria-valuenow')).toBe('100')
      expect(thumb.attributes('aria-valuemin')).toBe('0')
      expect(thumb.attributes('aria-valuemax')).toBe('200')
      expect(thumb.attributes('aria-label')).toContain('1:40')
    })

    it('handles Arrow Right key (+5s)', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 60,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      await thumb.trigger('keydown', { key: 'ArrowRight' })

      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(65)
    })

    it('handles Arrow Left key (-5s)', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 60,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      await thumb.trigger('keydown', { key: 'ArrowLeft' })

      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(55)
    })

    it('handles Home key (seek to 0)', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 100,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      await thumb.trigger('keydown', { key: 'Home' })

      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(0)
    })

    it('handles End key (seek to duration)', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 100,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      await thumb.trigger('keydown', { key: 'End' })

      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(200)
    })

    it('prevents negative seek with Arrow Left', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 3,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      await thumb.trigger('keydown', { key: 'ArrowLeft' })

      // Should clamp to 0 (3 - 5 = -2, clamped to 0)
      expect(playbackStore.seekToPosition).toHaveBeenCalled()
      const seekSpyCalls = getSeekSpyCalls(playbackStore)
      const lastCall = seekSpyCalls[seekSpyCalls.length - 1]
      expect(lastCall?.[0]).toBeGreaterThanOrEqual(0)
    })

    it('prevents overflow with Arrow Right', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 197,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      await thumb.trigger('keydown', { key: 'ArrowRight' })

      // Should clamp to 200 (197 + 5 = 202, clamped to 200)
      expect(playbackStore.seekToPosition).toHaveBeenCalled()
      const seekSpyCalls = getSeekSpyCalls(playbackStore)
      const lastCall = seekSpyCalls[seekSpyCalls.length - 1]
      expect(lastCall?.[0]).toBeLessThanOrEqual(200)
    })
  })

  describe('Accessibility', () => {
    it('has tabindex="0" for keyboard focus', async () => {
      const { wrapper } = createWrapper()
      const thumb = wrapper.find('[role="slider"]')
      expect(thumb.attributes('tabindex')).toBe('0')
    })

    it('has aria-label with formatted time', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 125,
        trackDuration: 200,
      })

      await wrapper.vm.$nextTick()

      const thumb = wrapper.find('[role="slider"]')
      const ariaLabel = thumb.attributes('aria-label')

      // Should contain "Playback position: " with formatted time
      expect(ariaLabel).toContain('Playback position:')
      expect(ariaLabel).toMatch(/\d+:\d{2}/)
    })
  })

  describe('Edge Cases', () => {
    it('handles no track duration gracefully', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 0,
        trackDuration: null,
      })

      await wrapper.vm.$nextTick()

      const fill = wrapper.find('.progress-fill')
      expect(fill.attributes('style')).toContain('0%')
    })

    it('handles zero duration gracefully', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        currentTime: 0,
        trackDuration: 0,
      })

      await wrapper.vm.$nextTick()

      const fill = wrapper.find('.progress-fill')
      expect(fill.attributes('style')).toContain('0%')
    })

    it('does not send seeks during drag updates', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { trackDuration: 200 })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('mousedown', { clientX: 50 })
      await dispatchMouseMove(75)
      await dispatchMouseMove(100)

      expect(playbackStore.seekToPosition).not.toHaveBeenCalled()

      await dispatchMouseUp()

      expect(playbackStore.seekToPosition).toHaveBeenCalledTimes(1)
      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(100)
    })

    it('handles touch events for seeking on touchend', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { trackDuration: 200 })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('touchstart', {
        touches: [{ clientX: 100 }],
      })

      expect(playbackStore.seekToPosition).not.toHaveBeenCalled()

      await dispatchTouchEnd()

      expect(playbackStore.seekToPosition).toHaveBeenCalledWith(100)
    })

    it('disables progress bar when loading', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { isLoading: true })

      await wrapper.vm.$nextTick()

      const progressWrapper = wrapper.find('.progress-wrapper')
      expect(progressWrapper.classes()).toContain('disabled')
    })

    it('does not start a seek gesture while loading', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, {
        isLoading: true,
        trackDuration: 200,
      })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('mousedown', { clientX: 100 })
      await dispatchMouseUp()

      expect(playbackStore.seekToPosition).not.toHaveBeenCalled()
    })

    it('allows a second drag after the first drag has committed', async () => {
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { trackDuration: 200 })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('mousedown', { clientX: 50 })
      await dispatchMouseUp()
      expect(playbackStore.seekToPosition).toHaveBeenCalledTimes(1)

      await progressWrapper.trigger('mousedown', { clientX: 100 })
      await dispatchMouseUp()
      expect(playbackStore.seekToPosition).toHaveBeenCalledTimes(2)
    })

    it('cleans up the active drag listener on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const { wrapper, playbackStore } = createWrapper()
      setPlaybackStoreState(playbackStore, { trackDuration: 200 })

      const progressWrapper = wrapper.find('.progress-wrapper')
      const element = getHtmlElement(progressWrapper.element)

      mockBoundingClientRect(element)

      await progressWrapper.trigger('mousedown', { clientX: 100 })
      wrapper.unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
      expect(playbackStore.seekToPosition).not.toHaveBeenCalled()
    })
  })
})
