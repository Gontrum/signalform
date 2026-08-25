import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { ok, err } from '@signalform/shared'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { TagAlbum, TagAlbumsPage, TagsApiError } from '@/platform/api/tagsApi'
import TagAlbumGrid from '../ui/TagAlbumGrid.vue'
import { useTagAlbums } from './useTagAlbums'

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

const TagAlbumsHarness = defineComponent({
  name: 'TagAlbumsHarness',
  setup() {
    const {
      status,
      errorKind,
      albums,
      hasMore,
      isLoadingMore,
      resolvingKey,
      loadMore,
      handleAlbumClick,
    } = useTagAlbums()

    return (): VNode =>
      h(TagAlbumGrid, {
        status: status.value,
        errorKind: errorKind.value,
        albums: albums.value,
        hasMore: hasMore.value,
        isLoadingMore: isLoadingMore.value,
        resolvingKey: resolvingKey.value,
        onLoadMore: () => void loadMore(),
        onAlbumClick: (album: TagAlbum, key: string) => void handleAlbumClick(album, key),
      })
  },
})

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

type MountedHarness = {
  readonly wrapper: VueWrapper
  readonly router: Router
  readonly pushSpy: MockInstance<Router['push']>
}

const mountHarness = async (initialPath = '/?tag=qsound'): Promise<MountedHarness> => {
  setupTestEnv()
  const router = await createTestRouter(
    [
      { path: '/', name: 'home', component: TagAlbumsHarness },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    initialPath,
  )
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(TagAlbumsHarness, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, pushSpy }
}

const firstCard = (wrapper: VueWrapper): Omit<DOMWrapper<Element>, 'exists'> =>
  wrapper.get('[data-testid="tag-album-card"]')

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

describe('useTagAlbums', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveAlbum.mockResolvedValue(ok({ albumId: null }))
  })

  it('requests the first page for the vocabulary tag, with no text', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const { wrapper } = await mountHarness('/?tag=qsound')

    expect(mockGetTagAlbumsPage).toHaveBeenCalledWith('qsound', '', 0, 12)
    expect(wrapper.findAll('[data-testid="tag-album-title"]').map((el) => el.text())).toEqual([
      'The Immaculate Collection',
      'The Soul Cages',
    ])
  })

  it('passes the free text alongside the tag', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    await mountHarness('/?tag=sacd&q=miles%20davis')

    expect(mockGetTagAlbumsPage).toHaveBeenCalledWith('sacd', 'miles davis', 0, 12)
  })

  it('makes no request for an unknown tag and reports an empty success', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const { wrapper } = await mountHarness('/?tag=not-a-vocabulary-entry')

    expect(mockGetTagAlbumsPage).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false)
  })

  it('makes no request when the tag coordinate is absent', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const { wrapper } = await mountHarness('/?q=qsound')

    expect(mockGetTagAlbumsPage).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('reloads when only the text changes while the tag stays put', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const { router } = await mountHarness('/?tag=sacd')
    expect(mockGetTagAlbumsPage).toHaveBeenCalledTimes(1)

    await router.push('/?tag=sacd&q=coltrane')
    await flushPromises()

    expect(mockGetTagAlbumsPage).toHaveBeenCalledTimes(2)
    expect(mockGetTagAlbumsPage).toHaveBeenLastCalledWith('sacd', 'coltrane', 0, 12)
  })

  it('reloads when only the tag changes while the text stays put', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))

    const { router } = await mountHarness('/?tag=sacd&q=coltrane')

    await router.push('/?tag=hdcd&q=coltrane')
    await flushPromises()

    expect(mockGetTagAlbumsPage).toHaveBeenLastCalledWith('hdcd', 'coltrane', 0, 12)
  })

  it('pages over candidates, not over the albums that survived the filter', async () => {
    mockGetTagAlbumsPage.mockResolvedValueOnce(
      ok(page({ albums: [{ ...tidalAlbum, title: 'First' }], hasMore: true, totalCandidates: 75 })),
    )
    mockGetTagAlbumsPage.mockResolvedValueOnce(
      ok(page({ albums: [{ ...localAlbum, title: 'Second' }], hasMore: false })),
    )

    const { wrapper } = await mountHarness('/?tag=qsound&q=blue')

    await wrapper.get('[data-testid="tag-albums-load-more"]').trigger('click')
    await flushPromises()

    expect(mockGetTagAlbumsPage).toHaveBeenNthCalledWith(2, 'qsound', 'blue', 12, 12)
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

    const { wrapper } = await mountHarness()
    await wrapper.get('[data-testid="tag-albums-load-more"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="tag-album-item"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="tag-albums-load-more"]').exists()).toBe(true)
  })

  it('surfaces an unreachable Discogs as its own error kind', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(err(discogsError))

    const { wrapper } = await mountHarness()

    expect(wrapper.find('[data-testid="error-state"]').text()).toBe(
      'Discogs is unreachable — please try again.',
    )
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })

  it('navigates straight to the album detail page for a local album', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page({ albums: [localAlbum] })))

    const { wrapper, pushSpy } = await mountHarness()
    await firstCard(wrapper).trigger('click')
    await flushPromises()

    expect(mockResolveAlbum).not.toHaveBeenCalled()
    expect(pushSpy).toHaveBeenCalledWith({ name: 'album-detail', params: { albumId: '883' } })
  })

  it('resolves a Tidal candidate against LMS before navigating', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page({ albums: [tidalAlbum] })))
    mockResolveAlbum.mockResolvedValue(ok({ albumId: '7_Sting.2.0.1.50' }))

    const { wrapper, pushSpy } = await mountHarness()
    await firstCard(wrapper).trigger('click')
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

  it('stays on the intact list when the candidate cannot be resolved', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page()))
    mockResolveAlbum.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'LMS is down' }),
    )

    const { wrapper, pushSpy } = await mountHarness()
    await wrapper.findAll('[data-testid="tag-album-card"]')[1]?.trigger('click')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="tag-album-item"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false)
  })

  it('marks the clicked card as busy and swallows further clicks while resolving', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(page({ albums: [tidalAlbum] })))
    const pendingResolve = deferred<unknown>()
    mockResolveAlbum.mockReturnValue(pendingResolve.promise)

    const { wrapper } = await mountHarness()
    await firstCard(wrapper).trigger('click')
    await flushPromises()

    expect(firstCard(wrapper).attributes('aria-busy')).toBe('true')
    expect(firstCard(wrapper).attributes('disabled')).toBeDefined()

    await firstCard(wrapper).trigger('click')
    expect(mockResolveAlbum).toHaveBeenCalledTimes(1)

    pendingResolve.resolve(ok({ albumId: null }))
    await flushPromises()

    expect(firstCard(wrapper).attributes('aria-busy')).toBe('false')
    expect(firstCard(wrapper).attributes('disabled')).toBeUndefined()
  })
})
