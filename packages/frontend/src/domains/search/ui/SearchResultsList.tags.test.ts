/**
 * SearchResultsList — Tags section.
 *
 * Sibling of SearchResultsList.test.ts (see AGENTS.md "Testing", 20 KB rule)
 * — covers only the new `tags` prop: rendering with concrete names/counts,
 * absence when empty, and the click-to-library navigation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import SearchResultsList from './SearchResultsList.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import type { TagSearchMatch } from '@/platform/api/searchApi'

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    playTrackList: vi.fn().mockResolvedValue(ok(undefined)),
    playTidalSearchAlbum: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

const createRouter = async (): Promise<Router> => {
  return createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/library', name: 'library', component: { template: '<div />' } },
  ])
}

const TAGS: readonly TagSearchMatch[] = [
  { query: 'hi-res-audio', displayName: 'Hi-Res Audio', albumCount: 3 },
  { query: 'qsound', displayName: 'QSound', albumCount: 12 },
]

const mountWithTags = async (tags: readonly TagSearchMatch[]): Promise<VueWrapper> => {
  const wrapper = mount(SearchResultsList, {
    props: { results: [], albums: [], artists: [], tags },
    global: { plugins: [await createRouter()] },
  })
  await nextTick()
  return wrapper
}

describe('SearchResultsList — Tags section', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  it('renders the tags section with each tag name and album count', async () => {
    const w = await mountWithTags(TAGS)

    const section = w.find('[data-testid="tag-results"]')
    expect(section.exists()).toBe(true)

    const items = w.findAll('[data-testid="tag-result-item"]')
    expect(items).toHaveLength(2)

    const names = w.findAll('[data-testid="tag-result-name"]').map((el) => el.text())
    expect(names).toEqual(['Hi-Res Audio', 'QSound'])

    const counts = w.findAll('[data-testid="tag-result-count"]').map((el) => el.text())
    expect(counts).toEqual(['3 albums', '12 albums'])
  })

  it('does not render the tags section when tags is empty', async () => {
    const w = await mountWithTags([])

    expect(w.find('[data-testid="tag-results"]').exists()).toBe(false)
  })

  it('does not render the tags section when tags prop is absent', async () => {
    const wrapper = mount(SearchResultsList, {
      props: { results: [], albums: [], artists: [] },
      global: { plugins: [await createRouter()] },
    })
    await nextTick()

    expect(wrapper.find('[data-testid="tag-results"]').exists()).toBe(false)
  })

  it('navigates to the home route with the tag filter applied on click', async () => {
    const router = await createRouter()
    const pushSpy = vi.spyOn(router, 'push')
    const wrapper = mount(SearchResultsList, {
      props: {
        results: [],
        albums: [],
        artists: [],
        tags: [{ query: 'qsound', displayName: 'QSound', albumCount: 7 }],
      },
      global: { plugins: [router] },
    })
    await nextTick()

    const button = wrapper.find('[data-testid="tag-result-item"] button')
    await button.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/',
      query: { tag: 'qsound', full: 'true' },
    })
  })
})
