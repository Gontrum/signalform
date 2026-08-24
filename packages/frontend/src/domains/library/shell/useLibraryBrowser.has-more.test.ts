/**
 * useLibraryBrowser — the next page comes from the server's `hasMore`, never
 * from a count. Asserted through `showsLoadMore`, the only way the flag leaves
 * the composable: it is what puts the load-more control on the screen.
 *
 * Sibling of useLibraryBrowser.test.ts so the pagination-flag cases do not
 * grow the main suite any further.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { Result } from '@signalform/shared'
import type {
  LibraryAlbum,
  LibraryAlbumsResponse,
  LibraryApiError,
} from '@/platform/api/libraryApi'

vi.mock('@/platform/api/libraryApi', () => ({
  getLibraryAlbums: vi.fn(),
  getLibraryGenres: vi.fn(),
  getRescanStatus: vi.fn(),
  triggerLibraryRescan: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({ playAlbum: vi.fn() }))
vi.mock('@/platform/api/queueApi', () => ({ addAlbumToQueue: vi.fn() }))
vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbums: vi.fn(),
  getTidalFeaturedAlbums: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: (): { readonly query: Record<string, string> } => ({ query: {} }),
  useRouter: (): { readonly push: ReturnType<typeof vi.fn> } => ({ push: vi.fn() }),
}))

import { useLibraryBrowser } from './useLibraryBrowser'
import { getLibraryAlbums, getLibraryGenres } from '@/platform/api/libraryApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)

type AlbumsResult = Result<LibraryAlbumsResponse, LibraryApiError>

const PAGE_SIZE = 60

const album = (id: string, title: string): LibraryAlbum => ({
  id,
  title,
  artist: `Artist ${id}`,
  releaseYear: 1999,
  coverArtUrl: `/cover/${id}.jpg`,
})

const page = (albums: readonly LibraryAlbum[], hasMore: boolean): AlbumsResult => ({
  ok: true,
  value: { albums, hasMore },
})

const fullPage = (): readonly LibraryAlbum[] =>
  Array.from({ length: PAGE_SIZE }, (_, index) => album(String(index + 1), `Album ${index + 1}`))

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

const mountBrowser = async (): Promise<ReturnType<typeof useLibraryBrowser>> => {
  let result: ReturnType<typeof useLibraryBrowser> | undefined
  const TestComponent = defineComponent({
    setup(): () => VNode {
      result = useLibraryBrowser((key) => key)
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  return result!
}

describe('useLibraryBrowser — the next page the server announced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], false))
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  it('closes pagination when the follow-up page reports no further page', async () => {
    mockGetLibraryAlbums.mockResolvedValueOnce(page(fullPage(), true))
    const browser = await mountBrowser()

    mockGetLibraryAlbums.mockResolvedValueOnce(page([album('99', 'Amnesiac')], false))
    await browser.loadMoreCurrent()
    await flushPromises()

    expect(browser.albums.value).toHaveLength(PAGE_SIZE + 1)
    expect(browser.showsLoadMore.value).toBe(false)

    await browser.loadMoreCurrent()
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(2)
  })

  it('keeps pagination open when the follow-up page reports another one', async () => {
    mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
    const browser = await mountBrowser()

    mockGetLibraryAlbums.mockResolvedValueOnce(page([album('2', 'Amnesiac')], true))
    await browser.loadMoreCurrent()
    await flushPromises()

    expect(browser.albums.value.length).toBeLessThan(PAGE_SIZE)
    expect(browser.showsLoadMore.value).toBe(true)
  })

  it('leaves the load-more control up after a follow-up page fails, so the retry stays reachable', async () => {
    mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
    const browser = await mountBrowser()

    mockGetLibraryAlbums.mockResolvedValueOnce({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })
    await browser.loadMoreCurrent()
    await flushPromises()

    expect(browser.loadMoreCurrentFailed.value).toBe(true)
    expect(browser.showsLoadMore.value).toBe(true)
  })

  it('takes the load-more control away while a filter change waits for its first page', async () => {
    mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
    const browser = await mountBrowser()
    expect(browser.showsLoadMore.value).toBe(true)

    const pendingFirstPage = deferred<AlbumsResult>()
    mockGetLibraryAlbums.mockReturnValueOnce(pendingFirstPage.promise)
    browser.setDecadeFilter('1990s')
    await flushPromises()

    expect(browser.showsLoadMore.value).toBe(false)

    pendingFirstPage.resolve(page([album('9', 'Nevermind')], true))
    await flushPromises()

    expect(browser.showsLoadMore.value).toBe(true)
  })

  it('offers no load more when the first page of a filter fails', async () => {
    mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
    const browser = await mountBrowser()

    mockGetLibraryAlbums.mockResolvedValueOnce({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })
    browser.setGenreFilter(153)
    await flushPromises()

    expect(browser.currentStatus.value).toBe('error')
    expect(browser.showsLoadMore.value).toBe(false)
  })
})
