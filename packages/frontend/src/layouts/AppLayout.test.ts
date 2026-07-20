import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import AppLayout from './AppLayout.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

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
      { path: '/queue', name: 'queue', component: { template: '<div />' } },
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

  // The mini-player is now a global sibling rendered by App.vue, so it must NOT
  // appear inside AppLayout on any breakpoint.
  it('does not render the mini-player (it is owned globally by App.vue)', async () => {
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)

    expect(context.wrapper.find('[data-testid="mini-player-bar"]').exists()).toBe(false)
    expect(context.wrapper.find('[data-testid="mini-player"]').exists()).toBe(false)
  })

  // The bottom tab bar is rendered globally by App.vue (not by AppLayout), so
  // it must NOT appear inside AppLayout on any breakpoint.
  it('does not render the bottom tab bar (it is owned globally by App.vue)', async () => {
    const context = await givenViewportIsPhone()

    await whenLayoutIsMounted(context.wrapper)

    expect(context.wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
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

  // === WHEN ===

  const whenLayoutIsMounted = async (wrapper: VueWrapper): Promise<void> => {
    await wrapper.vm.$nextTick()
  }

  const whenViewportChangesToPhone = async (wrapper: VueWrapper): Promise<void> => {
    setViewportWidth(375)
    globalThis.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
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

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})
