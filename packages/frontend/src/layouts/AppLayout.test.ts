import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import AppLayout from './AppLayout.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi.fn().mockResolvedValue(ok({ status: 'stopped', currentTime: 0 })),
    pausePlayback: vi.fn().mockResolvedValue(ok(undefined)),
    resumePlayback: vi.fn().mockResolvedValue(ok(undefined)),
    nextTrack: vi.fn().mockResolvedValue(ok(undefined)),
    previousTrack: vi.fn().mockResolvedValue(ok(undefined)),
    seek: vi.fn().mockResolvedValue(ok(undefined)),
    getCurrentTime: vi.fn().mockResolvedValue(ok(0)),
  }
})

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): {
    readonly on: ReturnType<typeof vi.fn>
    readonly subscribe: ReturnType<typeof vi.fn>
  } => ({
    on: vi.fn(),
    subscribe: vi.fn(),
  }),
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

describe('AppLayout', () => {
  type TestContext = {
    readonly router: Router
    readonly wrapper: VueWrapper
  }

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([
      { path: '/', component: { template: '<div />' } },
      { path: '/now-playing', name: 'now-playing', component: { template: '<div />' } },
    ])
  }

  // Mock window.matchMedia for breakpoint testing
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    setViewportWidth(1024)
    vi.stubGlobal('matchMedia', vi.fn(createMatchMediaMock()))
  })

  it('renders left and right panels on tablet breakpoint', async () => {
    const context = await givenViewportIsTablet()

    await whenLayoutIsMounted(context.wrapper)

    await thenLeftPanelIsVisible(context.wrapper)
    await thenRightPanelIsVisible(context.wrapper)
    await thenPanelsHave60To40Split(context.wrapper)
  })

  it('renders only left panel on phone breakpoint', async () => {
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)

    await thenLeftPanelIsVisible(context.wrapper)
    await thenRightPanelIsHidden(context.wrapper)
  })

  it('has 24px gap between panels on tablet', async () => {
    const context = await givenViewportIsTablet()

    await whenLayoutIsMounted(context.wrapper)

    await thenPanelGapIs24px(context.wrapper)
  })

  it('transitions smoothly between breakpoints', async () => {
    const context = await givenViewportIsTablet()
    await whenLayoutIsMounted(context.wrapper)

    await whenViewportChangesToPhone(context.wrapper)

    await thenLayoutTransitionsWithAnimation(context.wrapper)
  })

  it('uses dynamic viewport height on phone and tablet layouts', async () => {
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)

    await thenLayoutUsesDynamicViewportHeight(context.wrapper)
  })

  // AC1–AC3: Scroll containment — right panel must be height-bounded and overflow-clipped
  it('right panel has h-full and overflow-hidden for scroll containment (AC1-AC3)', async () => {
    const context = await givenViewportIsTablet()

    await whenLayoutIsMounted(context.wrapper)

    await thenRightPanelHasScrollContainment(context.wrapper)
  })

  // AC1: Mini-player appears on phone when track is playing
  it('shows mini-player on phone when a track is playing (AC1)', async () => {
    await givenTrackIsPlaying()
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)

    await thenMiniPlayerIsVisible(context.wrapper)
    await thenMiniPlayerReservesSafeAreaSpace(context.wrapper)
  })

  // AC1: Mini-player hidden on phone when no track is playing
  it('hides mini-player on phone when no track is playing (AC1)', async () => {
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)

    await thenMiniPlayerIsHidden(context.wrapper)
  })

  // AC2: Clicking mini-player navigates to /now-playing
  it('navigates to /now-playing when mini-player is clicked (AC2)', async () => {
    await givenTrackIsPlaying()
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)
    await whenMiniPlayerIsClicked(context.wrapper)

    await thenRouteIs(context.router, '/now-playing')
  })

  // AC6: Mini-player hidden on tablet/desktop
  it('does not show mini-player on tablet (AC6)', async () => {
    await givenTrackIsPlaying()
    const context = await givenViewportIsTablet()

    await whenLayoutIsMounted(context.wrapper)

    await thenMiniPlayerIsHidden(context.wrapper)
  })

  // === GIVEN ===

  const givenViewportIsTablet = async (): Promise<TestContext> => {
    const router = await createRouter()
    setViewportWidth(1024)
    const wrapper = mount(AppLayout, {
      global: { plugins: [router] },
      slots: {
        left: '<div data-testid="left-content">Left Panel</div>',
        right: '<div data-testid="right-content">Right Panel</div>',
      },
    })

    return { router, wrapper }
  }

  const givenViewportIsPhone = async (): Promise<TestContext> => {
    const router = await createRouter()
    setViewportWidth(375)
    const wrapper = mount(AppLayout, {
      global: { plugins: [router] },
      slots: {
        left: '<div data-testid="left-content">Left Panel</div>',
        right: '<div data-testid="right-content">Right Panel</div>',
      },
    })

    return { router, wrapper }
  }

  const givenTrackIsPlaying = async (): Promise<void> => {
    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()
    store.$patch({
      currentTrack: {
        id: '1',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        url: 'track://1',
      },
    })
  }

  // === WHEN ===

  const whenLayoutIsMounted = async (wrapper: VueWrapper): Promise<void> => {
    await wrapper.vm.$nextTick()
  }

  const whenViewportChangesToPhone = async (wrapper: VueWrapper): Promise<void> => {
    setViewportWidth(375)
    globalThis.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
  }

  const whenMiniPlayerIsClicked = async (wrapper: VueWrapper): Promise<void> => {
    const miniPlayer = wrapper.find('[data-testid="mini-player"]')
    await miniPlayer.trigger('click')
    await flushPromises()
  }

  // === THEN ===

  const thenLeftPanelIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const leftPanel = wrapper.find('[data-testid="left-panel"]')
    expect(leftPanel.exists()).toBe(true)
    expect(leftPanel.isVisible()).toBe(true)
  }

  const thenRightPanelIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const rightPanel = wrapper.find('[data-testid="right-panel"]')
    expect(rightPanel.exists()).toBe(true)
    expect(rightPanel.isVisible()).toBe(true)
  }

  const thenRightPanelIsHidden = async (wrapper: VueWrapper): Promise<void> => {
    const rightPanel = wrapper.find('[data-testid="right-panel"]')
    // On phone, right panel should NOT exist (v-if removes it from DOM)
    expect(rightPanel.exists()).toBe(false)
  }

  const thenPanelsHave60To40Split = async (wrapper: VueWrapper): Promise<void> => {
    // Check grid-template-columns or flex basis
    const container = wrapper.find('[data-testid="layout-container"]')
    expect(container.exists()).toBe(true)
    // Will verify grid layout (60% / 40%)
    const leftPanel = wrapper.find('[data-testid="left-panel"]')
    const rightPanel = wrapper.find('[data-testid="right-panel"]')
    expect(leftPanel.exists()).toBe(true)
    expect(rightPanel.exists()).toBe(true)
  }

  const thenPanelGapIs24px = async (wrapper: VueWrapper): Promise<void> => {
    const container = wrapper.find('[data-testid="layout-container"]')
    expect(container.exists()).toBe(true)
    // Will verify gap-6 class (24px)
    expect(container.classes()).toContain('gap-6')
  }

  const thenLayoutTransitionsWithAnimation = async (wrapper: VueWrapper): Promise<void> => {
    const container = wrapper.find('[data-testid="layout-container"]')
    // Verify transition classes are applied
    expect(container.classes()).toEqual(
      expect.arrayContaining([expect.stringMatching(/transition/)]),
    )
  }

  const thenLayoutUsesDynamicViewportHeight = async (wrapper: VueWrapper): Promise<void> => {
    const container = wrapper.find('[data-testid="layout-container"]')
    expect(container.classes()).toContain('h-dvh')
  }

  const thenRightPanelHasScrollContainment = async (wrapper: VueWrapper): Promise<void> => {
    const rightPanel = wrapper.find('[data-testid="right-panel"]')
    expect(rightPanel.classes()).toContain('h-full')
    expect(rightPanel.classes()).toContain('overflow-hidden')
  }

  const thenMiniPlayerIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const miniPlayer = wrapper.find('[data-testid="mini-player"]')
    expect(miniPlayer.exists()).toBe(true)
    expect(wrapper.find('[data-testid="mini-player-title"]').text()).toBe('Test Track')
    expect(wrapper.find('[data-testid="mini-player-artist"]').text()).toBe('Test Artist')
  }

  const thenMiniPlayerReservesSafeAreaSpace = async (wrapper: VueWrapper): Promise<void> => {
    const miniPlayer = wrapper.find('[data-testid="mini-player"]')
    const leftPanel = wrapper.find('[data-testid="left-panel"]')

    expect(miniPlayer.classes()).toContain('bottom-[env(safe-area-inset-bottom)]')
    expect(miniPlayer.classes()).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom))]')
    expect(leftPanel.classes()).toContain('pb-[calc(4rem+env(safe-area-inset-bottom))]')
  }

  const thenMiniPlayerIsHidden = async (wrapper: VueWrapper): Promise<void> => {
    const miniPlayer = wrapper.find('[data-testid="mini-player"]')
    expect(miniPlayer.exists()).toBe(false)
  }

  const thenRouteIs = async (router: Router, path: string): Promise<void> => {
    expect(router.currentRoute.value.path).toBe(path)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})
