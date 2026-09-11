/* eslint-disable vue/one-component-per-file -- test file with a routed host and an app shell */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h, ref, type Component, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { RouterView, type Router } from 'vue-router'
import { createTestRouter } from '@/test-utils'

// The saved position lives in module scope by design, so each case needs a
// fresh copy of the module or the previous case's value leaks into it.
let useQueueScrollMemory: typeof import('./useQueueScrollMemory').useQueueScrollMemory

type Visit = {
  readonly container: Ref<HTMLElement | null>
  readonly isRendered: Ref<boolean>
  readonly hasSavedPosition: boolean
}

// Each navigation to /queue mounts a new host, and the case that follows it
// always wants the newest one.
let latestVisit: Visit | undefined

const makeQueueHost = (): Component =>
  defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(document.createElement('ul'))
      const isRendered = ref(false)
      const { hasSavedPosition } = useQueueScrollMemory(container, () => isRendered.value)
      latestVisit = { container, isRendered, hasSavedPosition }
      return (): ReturnType<typeof h> => h('div')
    },
  })

// Navigating is what unmounts the host, exactly as in the app. Unmounting the
// whole test app instead would not do: vue-router resets currentRoute to
// START_LOCATION before the component's own teardown runs, so the destination
// the memory reads would always be the start route.
const mountApp = async (): Promise<Router> => {
  const router = await createTestRouter(
    [
      { path: '/queue', component: makeQueueHost(), meta: { depth: 1 } },
      { path: '/playlists', component: { template: '<div />' }, meta: { depth: 2 } },
      { path: '/library', component: { template: '<div />' }, meta: { depth: 1 } },
    ],
    '/queue',
  )

  mount(
    defineComponent({
      setup: () => (): ReturnType<typeof h> => h(RouterView),
    }),
    { global: { plugins: [router] } },
  )
  await flushPromises()

  return router
}

const renderList = async (visit: Visit | undefined): Promise<void> => {
  if (visit !== undefined) {
    visit.isRendered.value = true
  }
  await flushPromises()
}

const scrollTo = (visit: Visit | undefined, top: number): void => {
  visit?.container.value?.scrollTo({ top })
}

// -1 when there is no container, so a case that lost its host fails loudly
// instead of comparing 0 to 0.
const scrollTopOf = (visit: Visit | undefined): number => visit?.container.value?.scrollTop ?? -1

const navigate = async (router: Router, path: string): Promise<void> => {
  await router.push(path)
  await flushPromises()
}

describe('useQueueScrollMemory', () => {
  beforeEach(async () => {
    vi.resetModules()
    latestVisit = undefined
    ;({ useQueueScrollMemory } = await import('./useQueueScrollMemory'))
  })

  it('carries the position recorded on the way to a pushed screen into the next visit', async () => {
    const router = await mountApp()
    const first = latestVisit
    await renderList(first)
    // 1200 rather than a small nudge: the value has to be recognisable when it
    // comes back, and distinct from both 0 and any plausible default.
    scrollTo(first, 1200)

    await navigate(router, '/playlists')
    await navigate(router, '/queue')

    const second = latestVisit
    expect(second?.hasSavedPosition).toBe(true)
    // Not restored before the list exists — there would be nothing to scroll.
    expect(scrollTopOf(second)).toBe(0)

    await renderList(second)
    expect(scrollTopOf(second)).toBe(1200)
  })

  // Coming back from another tab is a fresh arrival, and QueueView's own
  // centring of the current track is the right thing to happen there.
  it('forgets the position when the queue is left for another tab', async () => {
    const router = await mountApp()
    const first = latestVisit
    await renderList(first)
    scrollTo(first, 1200)

    await navigate(router, '/library')
    await navigate(router, '/queue')

    const second = latestVisit
    expect(second?.hasSavedPosition).toBe(false)

    await renderList(second)
    expect(scrollTopOf(second)).toBe(0)
  })

  it('reports no saved position when the queue was never scrolled', async () => {
    const router = await mountApp()
    await renderList(latestVisit)

    await navigate(router, '/playlists')
    await navigate(router, '/queue')

    const second = latestVisit
    expect(second?.hasSavedPosition).toBe(false)

    await renderList(second)
    expect(scrollTopOf(second)).toBe(0)
  })

  // Read-and-clear: without it every later arrival at the queue would keep
  // snapping back to the offset of one old round trip.
  it('spends a saved position on a single return', async () => {
    const router = await mountApp()
    const first = latestVisit
    await renderList(first)
    scrollTo(first, 1200)

    await navigate(router, '/playlists')
    await navigate(router, '/queue')
    const second = latestVisit
    await renderList(second)
    expect(scrollTopOf(second)).toBe(1200)

    await navigate(router, '/library')
    await navigate(router, '/queue')

    const third = latestVisit
    expect(third?.hasSavedPosition).toBe(false)
    await renderList(third)
    expect(scrollTopOf(third)).toBe(0)
  })

  it('restores once and then leaves the position the user reached alone', async () => {
    const router = await mountApp()
    const first = latestVisit
    await renderList(first)
    scrollTo(first, 640)

    await navigate(router, '/playlists')
    await navigate(router, '/queue')

    const second = latestVisit
    await renderList(second)
    expect(scrollTopOf(second)).toBe(640)

    // Whatever makes the list re-render later — a websocket queue update, a
    // removed track — must not yank the user back to the restored offset.
    scrollTo(second, 200)
    if (second !== undefined) {
      second.isRendered.value = false
    }
    await flushPromises()
    await renderList(second)

    expect(scrollTopOf(second)).toBe(200)
  })
})
