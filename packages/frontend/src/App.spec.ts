import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ok } from '@signalform/shared'
import App from './App.vue'
import HomeView from './app/HomeView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'

// App renders HomeView which embeds NowPlayingPanel + VolumeControl (playback API on mount)
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

vi.mock('@/platform/api/configApi', () => ({
  getConfig: vi.fn().mockResolvedValue(
    ok({
      lmsHost: '192.168.1.100',
      lmsPort: 9000,
      playerId: 'aa:bb:cc:dd:ee:ff',
      hasLastFmKey: true,
      hasFanartKey: false,
      isConfigured: true,
      configuredAt: '2026-04-03T00:00:00.000Z',
    }),
  ),
}))

const createMountedApp = async (): Promise<VueWrapper> => {
  const router = await createTestRouter([{ path: '/', name: 'home', component: HomeView }])
  return mount(App, { global: { plugins: [router] } })
}

describe('App.vue', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  it('renders fullscreen layout container', async () => {
    const wrapper = await createMountedApp()
    expect(wrapper.find('.h-dvh').exists()).toBe(true)
  })

  it('has RouterView for page content', async () => {
    const wrapper = await createMountedApp()
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })

  it('applies neutral background color', async () => {
    const wrapper = await createMountedApp()
    expect(wrapper.find('.bg-neutral-50').exists()).toBe(true)
  })
})
