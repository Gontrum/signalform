/**
 * TagAlbumsView — the Tidal card's click path: resolve the candidate against
 * LMS first, then navigate. Split out of TagAlbumsView.test.ts because it
 * needs its own resolve-mock choreography.
 */
import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import { mount, flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { ok, err } from '@signalform/shared'
import TagAlbumsView from './TagAlbumsView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { TagAlbum, TagAlbumsPage } from '@/platform/api/tagsApi'

const { mockGetTagAlbumsPage, mockResolveAlbum } = vi.hoisted(() => ({
  mockGetTagAlbumsPage: vi.fn(),
  mockResolveAlbum: vi.fn(),
}))

vi.mock('@/platform/api/tagsApi', () => ({
  getTagAlbumsPage: mockGetTagAlbumsPage,
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  resolveAlbum: mockResolveAlbum,
}))

const tidalAlbum: TagAlbum = {
  artist: 'Sting',
  title: 'The Soul Cages',
  year: 1991,
  coverArtUrl: '/api/playback/cover?src=sting',
  source: 'tidal',
}

const localAlbum: TagAlbum = {
  artist: 'Madonna',
  title: 'The Immaculate Collection',
  year: 1990,
  coverArtUrl: '/api/playback/cover?src=madonna',
  source: 'local',
  albumId: '883',
}

const page: TagAlbumsPage = {
  albums: [tidalAlbum, localAlbum],
  hasMore: false,
  totalCandidates: 2,
}

type MountedView = {
  readonly wrapper: VueWrapper
  readonly pushSpy: MockInstance<Router['push']>
}

const mountView = async (): Promise<MountedView> => {
  setupTestEnv()
  const router: Router = await createTestRouter(
    [
      { path: '/tags', name: 'tag-albums', component: TagAlbumsView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    '/tags?q=qsound',
  )
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(TagAlbumsView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, pushSpy }
}

const deferred = <T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// The Tidal candidate is the first album of the fixture page.
const tidalCard = (wrapper: VueWrapper): Omit<DOMWrapper<Element>, 'exists'> =>
  wrapper.get('[data-testid="tag-album-card"]')

describe('TagAlbumsView — Tidal card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTagAlbumsPage.mockResolvedValue(ok(page))
  })

  it('resolves the candidate and navigates to the resolved Tidal album', async () => {
    mockResolveAlbum.mockResolvedValue(ok({ albumId: '7_Sting.2.0.1.50' }))

    const { wrapper, pushSpy } = await mountView()
    await tidalCard(wrapper).trigger('click')
    await flushPromises()

    expect(mockResolveAlbum).toHaveBeenCalledWith('The Soul Cages', 'Sting')
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'album-detail',
      params: { albumId: '7_Sting.2.0.1.50' },
      state: {
        tidalTitle: 'The Soul Cages',
        tidalArtist: 'Sting',
        tidalCoverArtUrl: '/api/playback/cover?src=sting',
      },
    })
  })

  it('stays on the intact list when the candidate resolves to null', async () => {
    mockResolveAlbum.mockResolvedValue(ok({ albumId: null }))

    const { wrapper, pushSpy } = await mountView()
    await tidalCard(wrapper).trigger('click')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="tag-album-item"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false)
  })

  it('stays on the intact list when the resolve request itself fails', async () => {
    mockResolveAlbum.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'LMS is down' }),
    )

    const { wrapper, pushSpy } = await mountView()
    await tidalCard(wrapper).trigger('click')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="tag-album-item"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="tag-album-title"]').map((el) => el.text())).toEqual([
      'The Soul Cages',
      'The Immaculate Collection',
    ])
  })

  it('marks the clicked card as busy and swallows further clicks while resolving', async () => {
    const pendingResolve = deferred<unknown>()
    mockResolveAlbum.mockReturnValue(pendingResolve.promise)

    const { wrapper } = await mountView()
    await tidalCard(wrapper).trigger('click')
    await flushPromises()

    expect(tidalCard(wrapper).attributes('aria-busy')).toBe('true')
    expect(tidalCard(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="tag-album-resolving"]').exists()).toBe(true)

    await tidalCard(wrapper).trigger('click')
    expect(mockResolveAlbum).toHaveBeenCalledTimes(1)

    // Resolving to null keeps the view mounted, so the card's state after the
    // request is observable — a successful resolve navigates away instead.
    pendingResolve.resolve(ok({ albumId: null }))
    await flushPromises()

    expect(tidalCard(wrapper).attributes('aria-busy')).toBe('false')
    expect(tidalCard(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="tag-album-resolving"]').exists()).toBe(false)
  })

  it('gives both sources the same navigation aria-label', async () => {
    mockResolveAlbum.mockResolvedValue(ok({ albumId: null }))

    const { wrapper } = await mountView()

    expect(
      wrapper
        .findAll('[data-testid="tag-album-card"]')
        .map((card) => card.attributes('aria-label')),
    ).toEqual(['View The Soul Cages by Sting', 'View The Immaculate Collection by Madonna'])
  })
})
