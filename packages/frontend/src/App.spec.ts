import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { ok } from '@signalform/shared'
import App from './App.vue'
import HomeView from './app/HomeView.vue'
import { useLmsHealth } from '@/domains/lms/shell/useLmsHealth'
import { setupTestEnv, createTestRouter } from '@/test-utils'

// Control the global "LMS down" banner via a stubbed composable, so the App
// tests do not depend on the polling/health mechanics (covered separately).
vi.mock('@/domains/lms/shell/useLmsHealth', () => ({
  useLmsHealth: vi.fn(),
}))

const mockUseLmsHealth = vi.mocked(useLmsHealth)

const stubLmsHealth = (isDown: boolean): void => {
  mockUseLmsHealth.mockReturnValue({
    isLmsDown: computed(() => isDown),
    consecutiveFailures: ref(isDown ? 2 : 0),
  })
}

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

const setViewportWidth = (width: number): void => {
  vi.stubGlobal('innerWidth', width)
}

const createMatchMediaMock = (): ((query: string) => MediaQueryList) => {
  return (query: string): MediaQueryList => {
    const minWidthMatch = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query)
    const maxWidthMatch = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query)
    const matches = minWidthMatch
      ? globalThis.innerWidth >= parseFloat(minWidthMatch[1] ?? '0')
      : maxWidthMatch
        ? globalThis.innerWidth <= parseFloat(maxWidthMatch[1] ?? '0')
        : false

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  }
}

const createMountedApp = async (): Promise<VueWrapper> => {
  const router = await createTestRouter([{ path: '/', name: 'home', component: HomeView }])
  return mount(App, { global: { plugins: [router] } })
}

const createMountedAppAt = async (initialPath: string): Promise<VueWrapper> => {
  const router = await createTestRouter(
    [
      { path: '/', name: 'home', component: HomeView },
      { path: '/now-playing', name: 'now-playing', component: { template: '<div />' } },
      { path: '/setup', name: 'setup', component: { template: '<div />' } },
    ],
    initialPath,
  )
  return mount(App, { global: { plugins: [router] } })
}

// The global mini-player only shows when a track is loaded; seed the playback
// store so shouldShowPhonePlaybackShortcut becomes true on a phone viewport.
const givenTrackIsPlaying = async (): Promise<void> => {
  const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
  usePlaybackStore().$patch({
    currentTrack: {
      id: '1',
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      url: 'track://1',
    },
  })
}

describe('App.vue', () => {
  beforeEach(() => {
    setupTestEnv()
    localStorage.clear()
    vi.clearAllMocks()
    stubLmsHealth(false)
    // Default to a desktop viewport so the bottom nav stays hidden unless a
    // test explicitly switches to a phone width.
    setViewportWidth(1024)
    vi.stubGlobal('matchMedia', vi.fn(createMatchMediaMock()))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders fullscreen layout container', async () => {
    const wrapper = await createMountedApp()
    // The shell fills the dynamic viewport (`h-dvh` = 100dvh) with
    // viewport-fit=cover, so iOS standalone PWAs fill the physical screen while
    // the nav's env(safe-area-inset-bottom) self-calibrates the bottom gap.
    const root = wrapper.find('.bg-neutral-50')
    expect(root.exists()).toBe(true)
    expect(root.classes()).toContain('h-dvh')
  })

  it('has RouterView for page content', async () => {
    const wrapper = await createMountedApp()
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })

  it('applies neutral background color', async () => {
    const wrapper = await createMountedApp()
    expect(wrapper.find('.bg-neutral-50').exists()).toBe(true)
  })

  it('applies the top safe-area inset to the content wrapper so it clears the status bar/notch', async () => {
    const wrapper = await createMountedApp()

    const content = wrapper.find('[data-testid="app-content"]')
    expect(content.exists()).toBe(true)
    // jsdom cannot evaluate env(); assert the utility class is present instead.
    expect(content.classes()).toContain('pt-[env(safe-area-inset-top)]')
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

  it('shows the LMS down banner when the LMS is down', async () => {
    stubLmsHealth(true)

    const wrapper = await createMountedApp()
    await flushPromises()

    expect(wrapper.find('[data-testid="lms-down-banner"]').exists()).toBe(true)
  })

  it('hides the LMS down banner when the LMS is reachable', async () => {
    stubLmsHealth(false)

    const wrapper = await createMountedApp()
    await flushPromises()

    expect(wrapper.find('[data-testid="lms-down-banner"]').exists()).toBe(false)
  })

  it('renders the global bottom nav on a phone viewport', async () => {
    setViewportWidth(375)

    const wrapper = await createMountedApp()
    await flushPromises()

    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(true)
  })

  it('does not render the bottom nav on a desktop viewport', async () => {
    setViewportWidth(1024)

    const wrapper = await createMountedApp()
    await flushPromises()

    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
  })

  it('does not render the bottom nav on a tablet viewport', async () => {
    setViewportWidth(900)

    const wrapper = await createMountedApp()
    await flushPromises()

    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
  })

  it('shows the global mini-player on a phone viewport while a track is loaded', async () => {
    setViewportWidth(375)

    const wrapper = await createMountedApp()
    await givenTrackIsPlaying()
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(true)
  })

  it('hides the mini-player on the now-playing route even with a track loaded', async () => {
    setViewportWidth(375)

    const wrapper = await createMountedAppAt('/now-playing')
    await givenTrackIsPlaying()
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(false)
  })

  it('hides the mini-player on the setup route even with a track loaded', async () => {
    setViewportWidth(375)

    const wrapper = await createMountedAppAt('/setup')
    await givenTrackIsPlaying()
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(false)
  })

  it('does not show the mini-player on a desktop viewport', async () => {
    setViewportWidth(1024)

    const wrapper = await createMountedApp()
    await givenTrackIsPlaying()
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(false)
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
