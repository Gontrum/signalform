import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { ok, err } from '@signalform/shared'
import TagAlbumsView from './TagAlbumsView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { TagAlbum, TagAlbumsPage, TagsApiError } from '@/platform/api/tagsApi'

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

const createRouter = async (initialPath: string): Promise<Router> =>
  createTestRouter(
    [
      { path: '/tags', name: 'tag-albums', component: TagAlbumsView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    initialPath,
  )

const mountView = async (initialPath = '/tags?q=qsound'): Promise<VueWrapper> => {
  setupTestEnv()
  const router = await createRouter(initialPath)
  const wrapper = mount(TagAlbumsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const localAlbum: TagAlbum = {
  artist: 'Madonna',
  title: 'The Immaculate Collection',
  year: 1990,
  coverArtUrl: '/api/playback/cover?src=madonna',
  source: 'local',
  albumId: '883',
}

const tidalAlbum: TagAlbum = {
  artist: 'Sting',
  title: 'The Soul Cages',
  year: 1991,
  coverArtUrl: '/api/playback/cover?src=sting',
  source: 'tidal',
}

const page = (overrides: Partial<TagAlbumsPage> = {}): TagAlbumsPage => ({
  albums: [localAlbum, tidalAlbum],
  hasMore: false,
  totalCandidates: 2,
  ...overrides,
})

const discogsError: TagsApiError = {
  type: 'SERVER_ERROR',
  status: 503,
  message: 'Discogs unreachable',
  code: 'DISCOGS_UNREACHABLE',
}

describe('TagAlbumsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveAlbum.mockResolvedValue(ok({ albumId: null }))
  })

  it('loads page 1 on mount and renders the concrete album values', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const wrapper = await mountView()

    expect(mockGetTagAlbumsPage).toHaveBeenCalledWith('qsound', 0, 12)

    const titles = wrapper.findAll('[data-testid="tag-album-title"]').map((el) => el.text())
    const artists = wrapper.findAll('[data-testid="tag-album-artist"]').map((el) => el.text())
    const years = wrapper.findAll('[data-testid="tag-album-year"]').map((el) => el.text())

    expect(titles).toEqual(['The Immaculate Collection', 'The Soul Cages'])
    expect(artists).toEqual(['Madonna', 'Sting'])
    expect(years).toEqual(['1990', '1991'])
  })

  it('shows the page title with the tag query', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="page-header"] h1').text()).toBe('Tag: qsound')
  })

  it('renders a cover image for every album, from both sources', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const wrapper = await mountView()

    const covers = wrapper
      .findAll('[data-testid="tag-album-cover"] img')
      .map((img) => img.attributes('src'))

    expect(covers).toEqual(['/api/playback/cover?src=madonna', '/api/playback/cover?src=sting'])
    expect(wrapper.find('[data-testid="tag-album-cover-placeholder"]').exists()).toBe(false)
  })

  it('makes every card clickable, whatever its source', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const wrapper = await mountView()

    const cards = wrapper.findAll('[data-testid="tag-album-card"]')
    expect(cards).toHaveLength(2)
    expect(cards.map((card) => card.element.tagName)).toEqual(['BUTTON', 'BUTTON'])
  })

  it('navigates straight to the album detail page for a local album', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const router = await createRouter('/tags?q=qsound')
    const pushSpy = vi.spyOn(router, 'push')
    setupTestEnv()
    const wrapper = mount(TagAlbumsView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="tag-album-card"]')[0]?.trigger('click')
    await flushPromises()

    expect(mockResolveAlbum).not.toHaveBeenCalled()
    expect(pushSpy).toHaveBeenCalledWith({ name: 'album-detail', params: { albumId: '883' } })
  })

  it('labels the source badge per source and keeps it non-interactive', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const wrapper = await mountView()

    const badges = wrapper.findAll('[data-testid="tag-album-source-badge"]')
    expect(badges.map((badge) => badge.text())).toEqual(['Local', 'Tidal'])
    expect(badges.map((badge) => badge.element.tagName)).toEqual(['SPAN', 'SPAN'])
  })

  it('pages over candidates, not over the albums that survived the filter', async () => {
    mockGetTagAlbumsPage.mockResolvedValueOnce(
      ok(
        page({
          albums: [{ ...tidalAlbum, title: 'First' }],
          hasMore: true,
          totalCandidates: 75,
        }),
      ),
    )
    mockGetTagAlbumsPage.mockResolvedValueOnce(
      ok(
        page({
          albums: [{ ...localAlbum, title: 'Second' }],
          hasMore: false,
          totalCandidates: 75,
        }),
      ),
    )

    const wrapper = await mountView()

    expect(wrapper.findAll('[data-testid="tag-album-title"]').map((el) => el.text())).toEqual([
      'First',
    ])

    const loadMoreButton = wrapper.find('[data-testid="tag-albums-load-more"]')
    expect(loadMoreButton.exists()).toBe(true)

    await loadMoreButton.trigger('click')
    await flushPromises()

    expect(mockGetTagAlbumsPage).toHaveBeenNthCalledWith(2, 'qsound', 12, 12)
    expect(wrapper.findAll('[data-testid="tag-album-title"]').map((el) => el.text())).toEqual([
      'First',
      'Second',
    ])
    expect(wrapper.find('[data-testid="tag-albums-load-more"]').exists()).toBe(false)
  })

  it('keeps the load-more button while hasMore holds, even when a page adds no album', async () => {
    mockGetTagAlbumsPage.mockResolvedValueOnce(
      ok(page({ albums: [tidalAlbum], hasMore: true, totalCandidates: 75 })),
    )
    mockGetTagAlbumsPage.mockResolvedValueOnce(
      ok(page({ albums: [], hasMore: true, totalCandidates: 75 })),
    )

    const wrapper = await mountView()
    await wrapper.find('[data-testid="tag-albums-load-more"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="tag-album-item"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="tag-albums-load-more"]').exists()).toBe(true)
  })

  it('shows an understandable error when Discogs is unreachable', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(err(discogsError))

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="error-state"]').text()).toBe(
      'Discogs is unreachable — please try again.',
    )
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })

  it('shows the empty state when the first page has no albums', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(
      ok(page({ albums: [], hasMore: false, totalCandidates: 0 })),
    )

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })
})
