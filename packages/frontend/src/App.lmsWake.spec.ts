/**
 * Wake-on-LAN targeting.
 *
 * Split from App.spec.ts (already past the repo's 20KB single-file threshold —
 * see AGENTS.md "Testing") and deliberately wired to the *real* useLmsHealth
 * instead of App.spec.ts's stub: what is under test here is which WebSocket
 * event reaches the `isLmsDown` watcher, so stubbing the composable would
 * assert nothing. A speaker that is merely switched off used to be reported as
 * `system.lmsDisconnected`, which sent a magic packet to a server that was
 * awake the whole time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ok } from '@signalform/shared'
import App from './App.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'

const { websocketOnMock, mockSubscribe, mockOnReconnect } = vi.hoisted(() => ({
  websocketOnMock: vi.fn<(event: string, handler: (payload: unknown) => void) => void>(),
  mockSubscribe: vi.fn(),
  mockOnReconnect: vi.fn<(callback: () => void) => void>(),
}))

vi.mock('@/app/useWebSocket', async () => {
  const { ref } = await import('vue')
  const connectionState = ref<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>(
    'connected',
  )

  return {
    useWebSocket: (): {
      readonly on: typeof websocketOnMock
      readonly subscribe: typeof mockSubscribe
      readonly onReconnect: typeof mockOnReconnect
      readonly connectionState: typeof connectionState
    } => ({
      on: websocketOnMock,
      subscribe: mockSubscribe,
      onReconnect: mockOnReconnect,
      connectionState,
    }),
  }
})

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

vi.mock('@/platform/api/sleepTimerApi', () => ({
  getSleepTimer: vi.fn().mockResolvedValue(ok(0)),
  setSleepTimer: vi.fn().mockResolvedValue(ok(undefined)),
}))

import { wakeLms } from '@/platform/api/lmsWakeApi'

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

const emit = (event: string): void => {
  const handlers = websocketOnMock.mock.calls
    .filter(([registered]) => registered === event)
    .map(([, handler]) => handler)
  handlers.forEach((handler) => {
    handler({ message: event, timestamp: Date.now() })
  })
}

const createMountedApp = async (): Promise<VueWrapper> => {
  const router = await createTestRouter([
    { path: '/', name: 'home', component: { template: '<div />' } },
  ])
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('App.vue — wake-on-LAN targeting', () => {
  beforeEach(() => {
    setupTestEnv()
    localStorage.clear()
    vi.clearAllMocks()
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('matchMedia', vi.fn(createMatchMediaMock()))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends no wake packet when only the speaker stops answering', async () => {
    const wrapper = await createMountedApp()
    // The unconditional wake on mount already happened; everything after this
    // point has to be attributable to the isLmsDown watcher alone.
    const wakesAfterMount = vi.mocked(wakeLms).mock.calls.length
    expect(wakesAfterMount).toBe(1)

    // Past the 60s throttle window, so a watcher that did fire here would
    // actually send a packet rather than be swallowed by the mount wake.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
    emit('system.playerStatusUnavailable')
    await flushPromises()

    expect(wakeLms).toHaveBeenCalledTimes(wakesAfterMount)
    expect(wrapper.find('[data-testid="lms-down-banner"]').exists()).toBe(false)
  })

  it('sends a wake packet when the server itself goes away', async () => {
    const wrapper = await createMountedApp()
    const wakesAfterMount = vi.mocked(wakeLms).mock.calls.length

    // Date.now() advances past the 60s throttle window so the watcher's wake
    // is not swallowed by the mount wake.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
    emit('system.lmsDisconnected')
    await flushPromises()

    expect(wakeLms).toHaveBeenCalledTimes(wakesAfterMount + 1)
    expect(wrapper.find('[data-testid="lms-down-banner"]').exists()).toBe(true)
  })

  it('shows the speaker message in the Now Playing panel while leaving the server alone', async () => {
    const wrapper = await createMountedApp()

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
    emit('system.playerStatusUnavailable')
    await flushPromises()

    const banner = wrapper.find('[data-testid="player-error-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('the music server is reachable')
    expect(wakeLms).toHaveBeenCalledTimes(1)
  })
})
