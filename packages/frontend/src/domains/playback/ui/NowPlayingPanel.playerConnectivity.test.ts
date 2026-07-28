/**
 * Player connectivity banner tests (docs/review/06-resilience-lms.md Fix 0).
 *
 * Split from NowPlayingPanel.test.ts (already over the repo's 20KB
 * single-file threshold — see AGENTS.md "Testing") and kept separate from
 * Fix 1's NowPlayingPanel.transport.test.ts since this is a semantically
 * distinct banner: this one is for the physical/software audio player (e.g.
 * a UPnPBridge-connected speaker) losing its own connection to LMS, not the
 * browser<->backend Socket.IO transport, and not the "LMS server itself
 * unreachable" case. Mirrors NowPlayingPanel.transport.test.ts's mocking
 * approach, driving the banner directly via store.$patch.
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

describe('NowPlayingPanel — player connectivity banner', () => {
  type TestContext = {
    readonly router: Router
    readonly wrapper: VueWrapper
  }

  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    // The socket connection is an app-wide singleton (see app/useWebSocket.ts)
    // that otherwise persists across every test in this file.
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

  describe('player-error-banner', () => {
    it('is absent when the player is connected', async () => {
      const context = await createMountedContext()

      expect(context.wrapper.find('[data-testid="player-error-banner"]').exists()).toBe(false)
    })

    it('appears with the playerError text when playerError is set', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ playerError: 'Speaker lost connection to server' })
      })

      const banner = context.wrapper.find('[data-testid="player-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Speaker lost connection to server')
    })

    it('disappears again once playerError is cleared', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ playerError: 'Speaker lost connection to server' })
      })
      expect(context.wrapper.find('[data-testid="player-error-banner"]').exists()).toBe(true)

      await patchPlaybackStore((store) => {
        store.$patch({ playerError: null })
      })
      expect(context.wrapper.find('[data-testid="player-error-banner"]').exists()).toBe(false)
    })

    it('has no action button — purely informational (nothing the app can do remotely about a speaker WiFi drop)', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({ playerError: 'Speaker lost connection to server' })
      })

      const banner = context.wrapper.find('[data-testid="player-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.find('button').exists()).toBe(false)
    })

    it('can be shown at the same time as the LMS error banner (distinct root causes)', async () => {
      const context = await createMountedContext()
      await patchPlaybackStore((store) => {
        store.$patch({
          playerError: 'Speaker lost connection to server',
          lmsError: 'Cannot connect to music server',
        })
      })

      expect(context.wrapper.find('[data-testid="player-error-banner"]').exists()).toBe(true)
      expect(context.wrapper.find('[data-testid="lms-error-banner"]').exists()).toBe(true)
    })
  })
})
