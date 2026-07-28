/**
 * Transport connection banner tests (resilience fix, docs/review/06-resilience-lms.md Fix 1).
 *
 * Split from NowPlayingPanel.test.ts (already over the repo's 20KB
 * single-file threshold — see AGENTS.md "Testing"). Mirrors that file's
 * mocking approach but deliberately does NOT mock '@/app/useWebSocket':
 * the real composable runs against the globally-mocked 'socket.io-client'
 * (see src/vitest.setup.ts), so `connectionState` starts at 'connecting'
 * and is otherwise driven directly via store.$patch, exactly like the
 * existing `lmsError`-driven LMS banner tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { __resetWebSocketForTests } from '@/app/useWebSocket'
import type { Router } from 'vue-router'

type PlaybackStore = ReturnType<
  typeof import('@/domains/playback/shell/usePlaybackStore').usePlaybackStore
>

const isPhone = ref(false)
const mockHasLastFmSession = ref(false)
const mockIsLoved = ref(false)
const mockToggleLove = vi.fn().mockResolvedValue(undefined)

const mockSleepRemaining = ref(0)
const mockSleepIsActive = ref(false)
const mockSleepSetTimer = vi.fn().mockResolvedValue(undefined)
const mockSleepCancel = vi.fn().mockResolvedValue(undefined)
const mockSleepRefresh = vi.fn().mockResolvedValue(undefined)

// Mock the playback API
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

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(true),
  }),
}))

vi.mock('@/domains/playback/shell/useLoveTrack', () => ({
  useLoveTrack: (): {
    readonly hasLastFmSession: typeof mockHasLastFmSession
    readonly isLoved: typeof mockIsLoved
    readonly isLoving: ReturnType<typeof ref<boolean>>
    readonly toggleLove: typeof mockToggleLove
  } => ({
    hasLastFmSession: mockHasLastFmSession,
    isLoved: mockIsLoved,
    isLoving: ref(false),
    toggleLove: mockToggleLove,
  }),
}))

vi.mock('@/domains/playback/shell/useSleepTimer', () => ({
  useSleepTimer: (): {
    readonly remainingSeconds: typeof mockSleepRemaining
    readonly isActive: typeof mockSleepIsActive
    readonly refresh: typeof mockSleepRefresh
    readonly setTimer: typeof mockSleepSetTimer
    readonly cancel: typeof mockSleepCancel
  } => ({
    remainingSeconds: mockSleepRemaining,
    isActive: mockSleepIsActive,
    refresh: mockSleepRefresh,
    setTimer: mockSleepSetTimer,
    cancel: mockSleepCancel,
  }),
}))

describe('NowPlayingPanel — transport connection banner', () => {
  type TestContext = {
    readonly router: Router
    readonly wrapper: VueWrapper
  }

  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    // The socket connection is an app-wide singleton (see app/useWebSocket.ts)
    // that otherwise persists across every test in this file — without this
    // reset, `connectionState` would leak whatever the previous test last
    // set it to instead of starting fresh at 'connecting'.
    __resetWebSocketForTests()
    isPhone.value = false
    mockHasLastFmSession.value = false
    mockIsLoved.value = false
    mockSleepRemaining.value = 0
    mockSleepIsActive.value = false
  })

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([
      { path: '/', component: { template: '<div />' } },
      { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      { path: '/queue', name: 'queue', component: { template: '<div />' } },
    ])
  }

  const createMountedContext = async (): Promise<TestContext> => {
    const router = await createRouter()
    const wrapper = mount(NowPlayingPanel, { global: { plugins: [router] } })
    await flushPromises()
    await nextTick()
    return { router, wrapper }
  }

  const getPlaybackStore = async (): Promise<PlaybackStore> => {
    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    return usePlaybackStore()
  }

  const patchPlaybackStore = async (
    update: (store: Awaited<ReturnType<typeof getPlaybackStore>>) => void,
  ): Promise<void> => {
    update(await getPlaybackStore())
    await nextTick()
  }

  describe('transport-error-banner', () => {
    it('is absent when connectionState is "connected"', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ connectionState: 'connected' })
      })

      expect(context.wrapper.find('[data-testid="transport-error-banner"]').exists()).toBe(false)
    })

    // The real useWebSocket() composable starts at 'connecting' before the
    // first connect event ever fires (see app/useWebSocket.ts) — this must
    // not flash a warning banner on every fresh app load.
    it('is absent when connectionState is "connecting" (initial-load state)', async () => {
      const context = await createMountedContext()
      const store = await getPlaybackStore()

      expect(store.connectionState).toBe('connecting')
      expect(context.wrapper.find('[data-testid="transport-error-banner"]').exists()).toBe(false)
    })

    it('appears with the "lost" text when connectionState is "disconnected"', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ connectionState: 'disconnected' })
      })

      const banner = context.wrapper.find('[data-testid="transport-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Connection to server lost — reconnecting…')
    })

    it('appears with the "reconnecting" text when connectionState is "reconnecting"', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ connectionState: 'reconnecting' })
      })

      const banner = context.wrapper.find('[data-testid="transport-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Reconnecting to server…')
    })

    it('disappears again once connectionState returns to "connected"', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ connectionState: 'disconnected' })
      })
      expect(context.wrapper.find('[data-testid="transport-error-banner"]').exists()).toBe(true)

      await patchPlaybackStore((store) => {
        store.$patch({ connectionState: 'connected' })
      })
      expect(context.wrapper.find('[data-testid="transport-error-banner"]').exists()).toBe(false)
    })

    it('has no retry-style action button — purely informational (auto-reconnect handles retry)', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ connectionState: 'disconnected' })
      })

      const banner = context.wrapper.find('[data-testid="transport-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.find('button').exists()).toBe(false)
    })
  })
})
