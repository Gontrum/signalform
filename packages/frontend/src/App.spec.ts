import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { ok } from '@signalform/shared'
import App from './App.vue'
import { useLmsHealth } from '@/domains/lms/shell/useLmsHealth'
import { setupTestEnv, createTestRouter } from '@/test-utils'

// The home route is just a routed leaf component (SearchPanel.vue in the
// real router) — App.vue itself now owns the global chrome (MainNavBar,
// AppLayout, NowPlayingPanel), so a trivial stub is enough here; the
// composition under test lives in App.vue, not in whatever the route renders.
const homeStub = { template: '<div data-testid="home-stub">Home</div>' }

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

// App.vue wraps every non-immersive route in AppLayout, whose right column
// always renders NowPlayingPanel (which embeds VolumeControl and calls the
// playback API on mount) — so this mock is needed file-wide, not just for
// the home route.
vi.mock('@/platform/api/playbackApi', async () => {
  const { mockPlaybackApiModule } = await import('@/test-utils')
  return mockPlaybackApiModule()
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

// NowPlayingPanel also owns the sleep-timer control, which fetches its state
// on mount via useSleepTimer — mocked file-wide for the same reason as the
// playbackApi mock above, and so remount-guard tests can spy on call counts.
vi.mock('@/platform/api/sleepTimerApi', () => ({
  getSleepTimer: vi.fn().mockResolvedValue(ok(0)),
  setSleepTimer: vi.fn().mockResolvedValue(ok(undefined)),
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
  const router = await createTestRouter([{ path: '/', name: 'home', component: homeStub }])
  return mount(App, { global: { plugins: [router] } })
}

const createMountedAppAt = async (initialPath: string): Promise<VueWrapper> => {
  const router = await createTestRouter(
    [
      { path: '/', name: 'home', component: homeStub },
      { path: '/library', name: 'library', component: { template: '<div />' } },
      { path: '/now-playing', name: 'now-playing', component: { template: '<div />' } },
      { path: '/setup', name: 'setup', component: { template: '<div />' } },
    ],
    initialPath,
  )
  return mount(App, { global: { plugins: [router] } })
}

// Depth-annotated routes matching the real router's meta, so afterEach's
// push/pop transition-name logic can be exercised end to end.
const createMountedAppWithDepthRoutes = async (): Promise<{
  readonly wrapper: VueWrapper
  readonly router: Awaited<ReturnType<typeof createTestRouter>>
}> => {
  const router = await createTestRouter([
    { path: '/', name: 'home', component: homeStub, meta: { depth: 1 } },
    {
      path: '/now-playing',
      name: 'now-playing',
      component: { template: '<div />' },
      meta: { depth: 2 },
    },
    { path: '/library', name: 'library', component: { template: '<div />' }, meta: { depth: 1 } },
    // Non-immersive depth-2 drill-down (e.g. album-detail, unified-artist in
    // the real router): unlike now-playing, this stays wrapped in AppLayout,
    // so it exercises the nested left-panel Transition rather than the outer
    // immersive-switch Transition.
    {
      path: '/detail',
      name: 'detail',
      component: { template: '<div />' },
      meta: { depth: 2 },
    },
  ])
  const wrapper = mount(App, { global: { plugins: [router] } })
  return { wrapper, router }
}

const findTransitionName = (wrapper: VueWrapper): string | undefined => {
  const name: unknown = wrapper.findComponent({ name: 'Transition' }).props('name')
  return typeof name === 'string' ? name : undefined
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
    // The shell fills the usable viewport (`h-dvh` = 100dvh, which on an iOS
    // standalone PWA is the real window height).
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

  it('renders the routed content wrapper that fills the remaining height', async () => {
    const wrapper = await createMountedApp()

    const content = wrapper.find('[data-testid="app-content"]')
    expect(content.exists()).toBe(true)
    expect(content.classes()).toContain('flex-1')
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

  it('hides the bottom nav on the now-playing route on a phone viewport', async () => {
    setViewportWidth(375)

    const wrapper = await createMountedAppAt('/now-playing')
    await flushPromises()

    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
  })

  it('hides the bottom nav on the setup route on a phone viewport', async () => {
    setViewportWidth(375)

    const wrapper = await createMountedAppAt('/setup')
    await flushPromises()

    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
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

  describe('push/pop page transitions', () => {
    it('sets the "push" transition when navigating to a deeper route', async () => {
      const { wrapper, router } = await createMountedAppWithDepthRoutes()
      await flushPromises()

      await router.push('/now-playing')
      await flushPromises()

      expect(findTransitionName(wrapper)).toBe('push')
    })

    it('sets the "pop" transition when navigating back to a shallower route', async () => {
      const { wrapper, router } = await createMountedAppWithDepthRoutes()
      await router.push('/now-playing')
      await flushPromises()

      await router.push('/')
      await flushPromises()

      expect(findTransitionName(wrapper)).toBe('pop')
    })

    it('sets no transition when switching between same-depth routes', async () => {
      const { wrapper, router } = await createMountedAppWithDepthRoutes()
      await flushPromises()

      await router.push('/library')
      await flushPromises()

      expect(findTransitionName(wrapper)).toBe('')
    })

    // A plain Vue <Transition> only reacts to its own direct slot child
    // changing identity (mount/unmount or a key change on that direct
    // child) — a key change nested further down does not bubble up. Since
    // AppLayout itself is intentionally unkeyed now (so it and
    // NowPlayingPanel persist across non-immersive navigations), the outer
    // Transition wrapping AppLayout/immersive-branch no longer sees a
    // direct-child change for navigations *within* the non-immersive
    // branch (e.g. Library -> an album/artist detail screen). The push/pop
    // slide for that class of navigation is therefore played by a second,
    // nested Transition scoped to just the routed left-panel content.
    it('sets the "push" transition for a depth-1 -> depth-2 navigation that stays non-immersive (nested left-panel Transition)', async () => {
      const { wrapper, router } = await createMountedAppWithDepthRoutes()
      await flushPromises()

      await router.push('/detail')
      await flushPromises()

      expect(findTransitionName(wrapper)).toBe('push')
      // Both the outer (immersive-switch) and nested (left-panel) Transition
      // exist for a non-immersive route — this is the specific mechanism
      // that lets the nested one actually receive a direct-child key change.
      expect(wrapper.findAllComponents({ name: 'Transition' })).toHaveLength(2)
    })

    it('renders only the outer Transition (no nested left-panel Transition) on an immersive route', async () => {
      const wrapper = await createMountedAppAt('/now-playing')
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'Transition' })).toHaveLength(1)
    })
  })

  // App.vue is the single source of truth for MainNavBar/AppLayout/
  // NowPlayingPanel placement: MainNavBar renders exactly once, above the
  // routed content, for every non-immersive route (regardless of which view
  // is routed), and every non-immersive route is wrapped in AppLayout with
  // NowPlayingPanel always in the right column on tablet/desktop. Immersive
  // routes (now-playing, setup) bypass all of this and render full-screen.
  describe('global chrome — MainNavBar, AppLayout, NowPlayingPanel', () => {
    it('renders MainNavBar exactly once on a non-immersive route on tablet/desktop', async () => {
      const wrapper = await createMountedAppAt('/library')
      await flushPromises()

      expect(wrapper.findAll('[data-testid="main-nav"]')).toHaveLength(1)
    })

    it('does not render MainNavBar on the now-playing immersive route', async () => {
      const wrapper = await createMountedAppAt('/now-playing')
      await flushPromises()

      expect(wrapper.find('[data-testid="main-nav"]').exists()).toBe(false)
    })

    it('does not render MainNavBar on the setup immersive route', async () => {
      const wrapper = await createMountedAppAt('/setup')
      await flushPromises()

      expect(wrapper.find('[data-testid="main-nav"]').exists()).toBe(false)
    })

    it('wraps a non-home route in AppLayout and renders NowPlayingPanel in the right column', async () => {
      const wrapper = await createMountedAppAt('/library')
      await flushPromises()

      const rightPanel = wrapper.find('[data-testid="right-panel"]')
      expect(rightPanel.exists()).toBe(true)
      expect(rightPanel.find('[data-testid="now-playing-panel"]').exists()).toBe(true)

      const leftPanel = wrapper.find('[data-testid="left-panel"]')
      expect(leftPanel.exists()).toBe(true)
    })

    it('bypasses AppLayout for the now-playing immersive route (no left/right panels)', async () => {
      const wrapper = await createMountedAppAt('/now-playing')
      await flushPromises()

      expect(wrapper.find('[data-testid="left-panel"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="right-panel"]').exists()).toBe(false)
    })

    it('bypasses AppLayout for the setup immersive route (no left/right panels)', async () => {
      const wrapper = await createMountedAppAt('/setup')
      await flushPromises()

      expect(wrapper.find('[data-testid="left-panel"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="right-panel"]').exists()).toBe(false)
    })

    it('hides MainNavBar and the right panel on a phone viewport, showing BottomNavBar instead', async () => {
      setViewportWidth(375)

      const wrapper = await createMountedAppAt('/library')
      await flushPromises()

      expect(wrapper.find('[data-testid="main-nav"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="right-panel"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(true)
    })

    // Regression guard: AppLayout used to be keyed by route.path, which forced
    // Vue to fully unmount/remount the whole AppLayout subtree — including
    // NowPlayingPanel in #right — on every navigation between two
    // non-immersive routes, not just when the left-slot content actually
    // changed. That defeated Now Playing's purpose as persistent global
    // chrome: useNowPlayingPanel/useSleepTimer would refetch their state (and
    // any open sleep-timer popover would silently reset) on every nav. The
    // key must live on the routed left-slot content only.
    it('does not remount NowPlayingPanel (no repeated playback/sleep-timer fetch) across sequential non-immersive route navigations', async () => {
      const { getPlaybackStatus } = await import('@/platform/api/playbackApi')
      const { getSleepTimer } = await import('@/platform/api/sleepTimerApi')

      const { wrapper, router } = await createMountedAppWithDepthRoutes()
      await flushPromises()

      // Capture the post-mount baseline rather than hardcoding a literal
      // count: getPlaybackStatus is called both by usePlaybackStore's own
      // one-time sync init AND by useNowPlayingPanel's onMounted, so the
      // exact number reflects those two call sites, not just this
      // component's mount. What this test actually guards is that neither
      // count grows across subsequent non-immersive navigations, which
      // would mean NowPlayingPanel (and the sleep timer) got torn down and
      // remounted.
      const playbackCallsAfterMount = vi.mocked(getPlaybackStatus).mock.calls.length
      const sleepTimerCallsAfterMount = vi.mocked(getSleepTimer).mock.calls.length
      expect(sleepTimerCallsAfterMount).toBe(1)
      expect(wrapper.find('[data-testid="now-playing-panel"]').exists()).toBe(true)

      await router.push('/library')
      await flushPromises()
      await router.push('/')
      await flushPromises()

      expect(getPlaybackStatus).toHaveBeenCalledTimes(playbackCallsAfterMount)
      expect(getSleepTimer).toHaveBeenCalledTimes(sleepTimerCallsAfterMount)
      expect(wrapper.find('[data-testid="now-playing-panel"]').exists()).toBe(true)
    })
  })
})
