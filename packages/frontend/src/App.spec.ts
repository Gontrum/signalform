import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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

vi.mock('@/platform/api/usersApi', () => ({
  getUsers: vi.fn().mockResolvedValue(ok({ users: [] })),
}))

vi.mock('@/platform/api/lmsWakeApi', () => ({
  wakeLms: vi.fn().mockResolvedValue(undefined),
}))

const createMountedApp = async (): Promise<VueWrapper> => {
  const router = await createTestRouter([{ path: '/', name: 'home', component: HomeView }])
  return mount(App, { global: { plugins: [router] } })
}

describe('App.vue', () => {
  beforeEach(() => {
    setupTestEnv()
    localStorage.clear()
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

  it('does not show the user select dialog when no selection is needed', async () => {
    const wrapper = await createMountedApp()
    await flushPromises()
    expect(wrapper.find('[data-testid="user-select-dialog"]').exists()).toBe(false)
  })

  it('sends a wake-on-LAN call on mount', async () => {
    const { wakeLms } = await import('@/platform/api/lmsWakeApi')
    await createMountedApp()
    await flushPromises()
    expect(wakeLms).toHaveBeenCalledOnce()
  })

  it('throttles wake calls on visibility changes to once per minute', async () => {
    const { wakeLms } = await import('@/platform/api/lmsWakeApi')
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    await createMountedApp()
    await flushPromises()
    expect(wakeLms).toHaveBeenCalledTimes(1)

    // Becoming visible again within the throttle window: no new call
    document.dispatchEvent(new Event('visibilitychange'))
    expect(wakeLms).toHaveBeenCalledTimes(1)

    // After the 60s window: wake again
    nowSpy.mockReturnValue(1_000_000 + 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(wakeLms).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it('shows the user select dialog when multiple users exist without a selection', async () => {
    const { getUsers } = await import('@/platform/api/usersApi')
    vi.mocked(getUsers).mockResolvedValueOnce(
      ok({
        users: [
          { id: 'u1', name: 'Ada', hasLastFmSession: false },
          { id: 'u2', name: 'Ben', hasLastFmSession: false },
        ],
      }),
    )

    const wrapper = await createMountedApp()
    await flushPromises()

    expect(wrapper.find('[data-testid="user-select-dialog"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="user-select-option"]')).toHaveLength(2)
  })
})
