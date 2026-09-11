/**
 * Scroll position across a push and back (docs/mobile-pwa.md rule 7).
 *
 * Own file because QueueView.test.ts is already 66 KB.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { RouterView, type Router } from 'vue-router'
import { ok, type Result, type QueueTrack } from '@signalform/shared'
import { setupTestEnv, createTestRouter } from '@/test-utils'

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: ReturnType<typeof ref<boolean>>
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone: ref(true),
    isTablet: ref(false),
    isDesktop: ref(false),
  }),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    socket: {},
    connectionState: { value: 'connected' },
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    onReconnect: vi.fn(),
  })),
}))

vi.mock('@/platform/api/queueApi', () => ({
  getQueue: vi.fn(),
  jumpToTrack: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  setRadioMode: vi.fn(),
  clearQueue: vi.fn(),
  removeMultipleFromQueue: vi.fn(),
}))

import QueueView from './QueueView.vue'
import { getQueue, type QueueApiError } from '@/platform/api/queueApi'

const mockGetQueue = vi.mocked(getQueue)

type QueueResponse = {
  readonly tracks: readonly QueueTrack[]
  readonly radioModeActive: boolean
  readonly radioBoundaryIndex: number | null
}

// The current track sits deep in the list on purpose: centring it is what a
// restored position has to win against, and a current track at index 0 would
// scroll to roughly where the restore lands anyway.
const makeTracks = (currentIndex: number | undefined): readonly QueueTrack[] =>
  Array.from({ length: 40 }, (_, index) => ({
    id: String(index + 1),
    position: index + 1,
    title: `Track ${String(index + 1)}`,
    artist: 'Artist',
    album: 'Album',
    duration: 180 + index,
    isCurrent: index === currentIndex,
    addedBy: 'user' as const,
  }))

const makeResponse = (
  currentIndex: number | undefined = undefined,
): Result<QueueResponse, QueueApiError> =>
  ok({
    tracks: makeTracks(currentIndex),
    radioModeActive: false,
    radioBoundaryIndex: null,
  })

// Navigating is what unmounts QueueView, exactly as in the app. Unmounting the
// test app instead would not do: vue-router resets currentRoute to
// START_LOCATION before the component's own teardown runs, so the destination
// the scroll memory reads would always be the start route.
// depth mirrors the real router: /queue is a tab, /playlists a pushed screen.
const mountApp = async (): Promise<{
  readonly router: Router
  readonly wrapper: VueWrapper
}> => {
  const router = await createTestRouter(
    [
      { path: '/queue', name: 'queue', component: QueueView, meta: { depth: 1 } },
      {
        path: '/playlists',
        name: 'playlists',
        component: { template: '<div />' },
        meta: { depth: 2 },
      },
      { path: '/library', name: 'library', component: { template: '<div />' }, meta: { depth: 1 } },
    ],
    '/queue',
  )

  const wrapper = mount(
    defineComponent({
      setup: () => (): ReturnType<typeof h> => h(RouterView),
    }),
    { global: { plugins: [router] } },
  )
  await flushPromises()

  return { router, wrapper }
}

const trackListOf = (wrapper: VueWrapper): HTMLElement | undefined => {
  const list = wrapper.find('[data-testid="queue-track-list"]').element
  return list instanceof HTMLElement ? list : undefined
}

const scrollTrackList = (wrapper: VueWrapper, top: number): void => {
  trackListOf(wrapper)?.scrollTo({ top })
}

// -1 when the list is missing, so a case that lost it fails loudly instead of
// comparing 0 to 0.
const trackListScrollTop = (wrapper: VueWrapper): number => trackListOf(wrapper)?.scrollTop ?? -1

const navigate = async (router: Router, path: string): Promise<void> => {
  await router.push(path)
  await flushPromises()
}

describe('QueueView – scroll position across navigation', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    mockGetQueue.mockResolvedValue(makeResponse())
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('restores the track list position after a push and back', async () => {
    const { router, wrapper } = await mountApp()
    scrollTrackList(wrapper, 900)

    await navigate(router, '/playlists')
    await navigate(router, '/queue')

    expect(trackListScrollTop(wrapper)).toBe(900)
  })

  it('centres the current track on a first visit', async () => {
    mockGetQueue.mockResolvedValue(makeResponse(25))
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    await mountApp()

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' })
  })

  it('leaves a restored position alone instead of centring the current track', async () => {
    mockGetQueue.mockResolvedValue(makeResponse(25))

    const { router, wrapper } = await mountApp()
    scrollTrackList(wrapper, 900)

    await navigate(router, '/playlists')
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()
    await navigate(router, '/queue')

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(trackListScrollTop(wrapper)).toBe(900)
  })

  // The queue is a tab, and a tab switch is a fresh arrival rather than a
  // return: restoring there would fight the view's own arrival scroll.
  it('does not restore a position when the queue is reached from another tab', async () => {
    const { router, wrapper } = await mountApp()
    scrollTrackList(wrapper, 900)

    await navigate(router, '/library')
    await navigate(router, '/queue')

    expect(trackListScrollTop(wrapper)).toBe(0)
  })

  // The pushed screen still shows the bottom navigation, so the trip can end on
  // a different tab. That arrival wants the current track, not an offset saved
  // two screens ago.
  it('does not restore a position when another tab is visited on the way back', async () => {
    mockGetQueue.mockResolvedValue(makeResponse(25))

    const { router, wrapper } = await mountApp()
    scrollTrackList(wrapper, 900)

    await navigate(router, '/playlists')
    // The current track advances while the user is away, so the arrival watcher
    // really runs on the way back: the store is still warm, and an unchanged
    // current track would leave it silent whatever the scroll memory says.
    mockGetQueue.mockResolvedValue(makeResponse(30))
    await navigate(router, '/library')
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()
    await navigate(router, '/queue')

    expect(trackListScrollTop(wrapper)).toBe(0)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' })
  })

  // A user who scrolled back to the top before leaving saved the top: reading
  // that as "nothing saved" would throw them down to the current track.
  it('keeps the list at the top when the saved position is the top', async () => {
    mockGetQueue.mockResolvedValue(makeResponse(25))

    const { router, wrapper } = await mountApp()
    scrollTrackList(wrapper, 900)
    scrollTrackList(wrapper, 0)

    await navigate(router, '/playlists')
    mockGetQueue.mockResolvedValue(makeResponse(30))
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()
    await navigate(router, '/queue')

    expect(scrollIntoView).not.toHaveBeenCalledWith({ behavior: 'instant', block: 'center' })
    expect(trackListScrollTop(wrapper)).toBe(0)
  })
})
