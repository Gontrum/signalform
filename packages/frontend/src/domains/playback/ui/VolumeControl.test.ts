/**
 * VolumeControl Component Tests
 *
 * Tests for volume slider, mute button, and volume display.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VolumeControl from '@/domains/playback/ui/VolumeControl.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'

// Prevent real network requests from onMounted → fetchCurrentVolume → getVolume
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
    seek: vi.fn().mockResolvedValue(ok(undefined)),
    getCurrentTime: vi.fn().mockResolvedValue(ok(0)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

describe('VolumeControl', () => {
  const setPlaybackStoreState = (
    playbackStore: ReturnType<typeof usePlaybackStore>,
    state: {
      readonly currentVolume?: number | null
      readonly isMuted?: boolean
      readonly isLoading?: boolean
    },
  ): void => {
    playbackStore.$patch(state)
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders slider, mute button, and volume display', () => {
    const wrapper = mount(VolumeControl)

    expect(wrapper.find('input[type="range"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label*="Mute"]').exists()).toBe(true)
    expect(wrapper.find('.volume-display').exists()).toBe(true)
  })

  it('displays current volume percentage', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { currentVolume: 73 })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.volume-display').text()).toBe('73%')
  })

  it('displays default volume (50%) when currentVolume is null', () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { currentVolume: null })

    expect(wrapper.find('.volume-display').text()).toBe('50%')
  })

  it('slider has correct value attribute', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { currentVolume: 65 })
    await wrapper.vm.$nextTick()

    const slider = wrapper.find('input[type="range"]')
    expect(slider.attributes('value')).toBe('65')
  })

  it('slider has correct min and max attributes', () => {
    const wrapper = mount(VolumeControl)

    const slider = wrapper.find('input[type="range"]')
    expect(slider.attributes('min')).toBe('0')
    expect(slider.attributes('max')).toBe('100')
  })

  it('calls setVolume when slider changes', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    const setVolumeSpy = vi.spyOn(store, 'setVolume').mockResolvedValue()

    const slider = wrapper.find('input[type="range"]')
    await slider.setValue(75)

    // Wait for debounce (300ms)
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(setVolumeSpy).toHaveBeenCalledWith(75)
  })

  it('shows unmute icon when not muted', () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { isMuted: false })

    const button = wrapper.find('button')
    expect(button.attributes('aria-label')).toBe('Mute')

    // Speaker icon should be visible (not muted icon)
    const svgIcons = wrapper.findAll('svg')
    expect(svgIcons.length).toBeGreaterThan(0)
  })

  it('shows mute icon when muted', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { isMuted: true })
    await wrapper.vm.$nextTick()

    const button = wrapper.find('button')
    expect(button.attributes('aria-label')).toBe('Unmute')
  })

  it('calls toggleMute when mute button clicked', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    const toggleMuteSpy = vi.spyOn(store, 'toggleMute').mockResolvedValue()

    const button = wrapper.find('button')
    await button.trigger('click')

    expect(toggleMuteSpy).toHaveBeenCalledOnce()
  })

  it('disables controls when loading', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { isLoading: true })
    await wrapper.vm.$nextTick()

    const slider = wrapper.find('input[type="range"]')
    const button = wrapper.find('button')

    expect(slider.attributes('disabled')).toBeDefined()
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('enables controls when not loading', () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { isLoading: false })

    const slider = wrapper.find('input[type="range"]')
    const button = wrapper.find('button')

    expect(slider.attributes('disabled')).toBeUndefined()
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('fetches current volume on mount', () => {
    const store = usePlaybackStore()
    const fetchVolumeSpy = vi.spyOn(store, 'fetchCurrentVolume').mockResolvedValue(true)

    mount(VolumeControl)

    expect(fetchVolumeSpy).toHaveBeenCalledOnce()
  })

  it('has proper ARIA labels', () => {
    const wrapper = mount(VolumeControl)

    const container = wrapper.find('[role="group"]')
    expect(container.attributes('aria-label')).toBe('Volume control')

    const slider = wrapper.find('input[type="range"]')
    expect(slider.attributes('aria-label')).toBe('Volume slider')

    const volumeDisplay = wrapper.find('.volume-display')
    expect(volumeDisplay.attributes('aria-live')).toBe('polite')
  })

  it('applies muted class to button when muted', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { isMuted: true })
    await wrapper.vm.$nextTick()

    const button = wrapper.find('button')
    expect(button.classes()).toContain('muted')
  })

  it('removes muted class from button when not muted', () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { isMuted: false })

    const button = wrapper.find('button')
    expect(button.classes()).not.toContain('muted')
  })

  it('updates volume display reactively', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    setPlaybackStoreState(store, { currentVolume: 30 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.volume-display').text()).toBe('30%')

    setPlaybackStoreState(store, { currentVolume: 80 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.volume-display').text()).toBe('80%')
  })

  it('debounces rapid slider changes', async () => {
    vi.useFakeTimers()

    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()
    const setVolumeSpy = vi.spyOn(store, 'setVolume').mockResolvedValue()

    const slider = wrapper.find('input[type="range"]')

    // Rapid changes
    await slider.setValue(60)
    await slider.setValue(70)
    await slider.setValue(80)

    // Before debounce timeout - should not be called yet
    expect(setVolumeSpy).not.toHaveBeenCalled()

    // Advance timers past debounce delay (300ms)
    vi.advanceTimersByTime(350)

    // Should only be called once with the last value
    expect(setVolumeSpy).toHaveBeenCalledOnce()
    expect(setVolumeSpy).toHaveBeenCalledWith(80)

    vi.useRealTimers()
  })

  it('optimistically updates volume on slider input', async () => {
    const wrapper = mount(VolumeControl)
    const store = usePlaybackStore()

    // Wait for onMounted → fetchCurrentVolume to complete
    await flushPromises()

    setPlaybackStoreState(store, { currentVolume: 50 })

    const slider = wrapper.find('input[type="range"]')
    await slider.setValue(75)

    // Volume should update immediately (optimistic)
    expect(store.currentVolume).toBe(75)
  })
})
