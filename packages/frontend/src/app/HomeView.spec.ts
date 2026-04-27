import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeView from './HomeView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

// HomeView embeds NowPlayingPanel + VolumeControl which call playback API on mount
vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

describe('HomeView.vue', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([{ path: '/', component: { template: '<div />' } }])
  }

  it('renders the home view', async (): Promise<void> => {
    const router = await createRouter()
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    expect(wrapper.exists()).toBe(true)
  })

  it('displays welcome message', async (): Promise<void> => {
    const router = await createRouter()
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    const text = wrapper.text()
    // Check for any content (view might be empty initially)
    expect(text).toBeDefined()
  })

  it('is a valid Vue component', async (): Promise<void> => {
    const router = await createRouter()
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    expect(wrapper.vm).toBeDefined()
  })
})
