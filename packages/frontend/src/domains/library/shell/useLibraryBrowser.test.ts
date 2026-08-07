import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { Result } from '@signalform/shared'
import type {
  LibraryAlbum,
  LibraryAlbumsResponse,
  LibraryApiError,
  LibraryGenre,
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
  useRouter: (): { readonly push: ReturnType<typeof vi.fn> } => ({ push: vi.fn() }),
}))

import { useLibraryBrowser } from './useLibraryBrowser'
import { getLibraryAlbums, getLibraryGenres } from '@/platform/api/libraryApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)

type AlbumsResult = Result<LibraryAlbumsResponse, LibraryApiError>

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

const serverError: AlbumsResult = {
  ok: false,
  error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
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

const queryOfCall = (index: number): Record<string, unknown> => {
  const call = mockGetLibraryAlbums.mock.calls[index]
  return (call?.[2] ?? {}) as Record<string, unknown>
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

const titlesOf = (albums: readonly LibraryAlbum[]): readonly string[] =>
  albums.map((entry) => entry.title)

const PAGE_SIZE = 60

const fullPage = (): readonly LibraryAlbum[] =>
  Array.from({ length: PAGE_SIZE }, (_, index) => album(String(index + 1), `Album ${index + 1}`))

describe('useLibraryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], false))
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial load', () => {
    it('requests the first page of 60 with the default sort and no filters', async () => {
      const browser = await mountBrowser()

      expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
      expect(mockGetLibraryAlbums).toHaveBeenCalledWith(60, 0, {
        sort: 'artist-az',
        decade: 'all',
        genreId: undefined,
        search: undefined,
      })
      expect(browser.currentStatus.value).toBe('success')
      expect(titlesOf(browser.albums.value)).toEqual(['Kid A'])
    })

    it('sends the sort, decade and genre restored from sessionStorage', async () => {
      sessionStorage.setItem('library-sort-by', 'title-az')
      sessionStorage.setItem('library-decade-filter', '1990s')
      sessionStorage.setItem('library-genre-filter', '153')

      const browser = await mountBrowser()

      expect(queryOfCall(0)).toEqual({
        sort: 'title-az',
        decade: '1990s',
        genreId: 153,
        search: undefined,
      })
      expect(browser.genreFilter.value).toBe(153)
      expect(browser.hasActiveFilters.value).toBe(true)
    })

    it('drops a genre name left over from the pre-id storage format', async () => {
      sessionStorage.setItem('library-genre-filter', 'Rock')

      const browser = await mountBrowser()

      expect(browser.genreFilter.value).toBeNull()
      expect(queryOfCall(0)['genreId']).toBeUndefined()
    })

    it('reports the error state when the first page fails with 503', async () => {
      mockGetLibraryAlbums.mockResolvedValue(serverError)

      const browser = await mountBrowser()

      expect(browser.currentStatus.value).toBe('error')
      expect(browser.albums.value).toEqual([])
      expect(browser.showsLoadMore.value).toBe(false)
    })
  })

  describe('pagination', () => {
    it('appends the next page behind the first instead of replacing it', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('1', 'Kid A'), album('2', 'Amnesiac')], true),
      )
      const browser = await mountBrowser()

      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('3', 'Bends'), album('4', 'Zeppelin')], false),
      )
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(titlesOf(browser.albums.value)).toEqual(['Kid A', 'Amnesiac', 'Bends', 'Zeppelin'])
      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(60, 2, expect.any(Object))
    })

    it('keeps the active filters on the follow-up page request', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], true))
      const browser = await mountBrowser()

      browser.setGenreFilter(7)
      await flushPromises()
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(queryOfCall(2)).toEqual({
        sort: 'artist-az',
        decade: 'all',
        genreId: 7,
        search: undefined,
      })
    })

    it('has no more pages when a full page comes back with hasMore false', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page(fullPage(), false))

      const browser = await mountBrowser()

      expect(browser.albums.value).toHaveLength(PAGE_SIZE)
      expect(browser.showsLoadMore.value).toBe(false)
    })

    it('has more pages when a short page comes back with hasMore true', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], true))

      const browser = await mountBrowser()

      expect(browser.albums.value.length).toBeLessThan(PAGE_SIZE)
      expect(browser.showsLoadMore.value).toBe(true)
    })

    it('does not fire a request when there is nothing left to load', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], false))
      const browser = await mountBrowser()

      await browser.loadMoreCurrent()
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
    })

    it('flags a failed follow-up page and keeps the albums already shown', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
      const browser = await mountBrowser()

      mockGetLibraryAlbums.mockResolvedValueOnce(serverError)
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(browser.loadMoreCurrentFailed.value).toBe(true)
      expect(browser.currentStatus.value).toBe('success')
      expect(titlesOf(browser.albums.value)).toEqual(['Kid A'])
    })

    it('ignores a second load-more while one is still in flight', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
      const browser = await mountBrowser()

      const pending = deferred<AlbumsResult>()
      mockGetLibraryAlbums.mockReturnValueOnce(pending.promise)

      const first = browser.loadMoreCurrent()
      await browser.loadMoreCurrent()

      expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(2)

      pending.resolve(page([album('2', 'Amnesiac')], true))
      await first
      await flushPromises()
    })
  })

  describe('filter changes', () => {
    it('starts over at offset 0 and drops the pages already loaded', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
      const browser = await mountBrowser()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('2', 'Amnesiac')], true))
      await browser.loadMoreCurrent()
      await flushPromises()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('9', 'Nevermind')], false))
      browser.setDecadeFilter('1990s')
      await flushPromises()

      expect(titlesOf(browser.albums.value)).toEqual(['Nevermind'])
      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ decade: '1990s' }),
      )
    })

    it('offers load more for the current filter combination, not for the previous one', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
      const browser = await mountBrowser()
      expect(browser.showsLoadMore.value).toBe(true)

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('9', 'Nevermind')], false))
      browser.setGenreFilter(153)
      await flushPromises()

      expect(browser.showsLoadMore.value).toBe(false)
    })

    it('persists sort, decade and genre and clears them together', async () => {
      const browser = await mountBrowser()

      browser.setSortBy('title-az')
      browser.setDecadeFilter('2000s')
      browser.setGenreFilter(42)
      await flushPromises()

      expect(sessionStorage.getItem('library-sort-by')).toBe('title-az')
      expect(sessionStorage.getItem('library-decade-filter')).toBe('2000s')
      expect(sessionStorage.getItem('library-genre-filter')).toBe('42')

      mockGetLibraryAlbums.mockClear()
      browser.clearAllFilters()
      await flushPromises()

      expect(sessionStorage.getItem('library-decade-filter')).toBeNull()
      expect(sessionStorage.getItem('library-genre-filter')).toBeNull()
      expect(browser.hasActiveFilters.value).toBe(false)
      expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
      expect(queryOfCall(0)).toEqual({
        sort: 'title-az',
        decade: 'all',
        genreId: undefined,
        search: undefined,
      })
    })

    it('persists the view mode in localStorage', async () => {
      const browser = await mountBrowser()

      browser.setViewMode('list')

      expect(localStorage.getItem('library-view-mode')).toBe('list')
      expect(browser.viewMode.value).toBe('list')
    })
  })

  describe('reconciled filters', () => {
    it('clears the decade when recently-added is chosen and names the adjusted field', async () => {
      const browser = await mountBrowser()

      browser.setDecadeFilter('1990s')
      await flushPromises()

      browser.setSortBy('recently-added')
      await flushPromises()

      expect(browser.sortBy.value).toBe('recently-added')
      expect(browser.decadeFilter.value).toBe('all')
      expect(browser.adjustedFilter.value).toBe('decade')
      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ sort: 'recently-added', decade: 'all' }),
      )
    })

    it('falls back to the default sort when a decade is chosen under recently-added', async () => {
      const browser = await mountBrowser()

      browser.setSortBy('recently-added')
      await flushPromises()

      browser.setDecadeFilter('2010s')
      await flushPromises()

      expect(browser.sortBy.value).toBe('artist-az')
      expect(browser.decadeFilter.value).toBe('2010s')
      expect(browser.adjustedFilter.value).toBe('sort')
      expect(sessionStorage.getItem('library-sort-by')).toBe('artist-az')
      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ sort: 'artist-az', decade: '2010s' }),
      )
    })

    it('drops the adjustment notice as soon as a combination needs no correction', async () => {
      const browser = await mountBrowser()

      browser.setSortBy('recently-added')
      browser.setDecadeFilter('2010s')
      await flushPromises()
      expect(browser.adjustedFilter.value).toBe('sort')

      browser.setSortBy('title-az')
      await flushPromises()

      expect(browser.adjustedFilter.value).toBeNull()
    })
  })

  describe('genres', () => {
    // Neither the names nor the counts run in the order the server sends them,
    // so any client-side re-sort would move the entries the assertions pin down.
    const SCRAMBLED_NAMES = 'MQAZXDKPRLWEBSJUTNCFGH'
    const warmGenres: readonly LibraryGenre[] = Array.from({ length: 22 }, (_, index) => ({
      id: index + 1,
      name: `Genre ${SCRAMBLED_NAMES[index]}`,
      albumCount: ((index * 7) % 22) + 3,
    }))

    it('keeps the server ranking and splits the first 20 off as chips', async () => {
      mockGetLibraryGenres.mockResolvedValue({ ok: true, value: warmGenres })

      const browser = await mountBrowser()

      expect(browser.genreChips.value).toHaveLength(20)
      expect(browser.genreChips.value[0]).toEqual({ id: 1, name: 'Genre M', albumCount: 3 })
      expect(browser.genreChips.value[19]).toEqual({ id: 20, name: 'Genre F', albumCount: 4 })
      expect(browser.genreRest.value).toEqual([
        { id: 21, name: 'Genre G', albumCount: 11 },
        { id: 22, name: 'Genre H', albumCount: 18 },
      ])
    })

    it('accepts the cold response where the counts are not warm yet', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [
          { id: 7, name: 'Ambient' },
          { id: 91, name: 'Jazz' },
          { id: 153, name: 'Rock' },
        ],
      })

      const browser = await mountBrowser()

      expect(browser.genreChips.value.map((genre) => genre.name)).toEqual([
        'Ambient',
        'Jazz',
        'Rock',
      ])
      expect(browser.genreChips.value[0]?.albumCount).toBeUndefined()
      expect(browser.genreRest.value).toEqual([])
    })

    it('leaves the album list intact when the genre endpoint fails', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: false,
        error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
      })

      const browser = await mountBrowser()

      expect(browser.genreChips.value).toEqual([])
      expect(browser.genreRest.value).toEqual([])
      expect(browser.currentStatus.value).toBe('success')
      expect(titlesOf(browser.albums.value)).toEqual(['Kid A'])
    })
  })

  describe('search', () => {
    it('waits out the debounce and sends only the final term', async () => {
      vi.useFakeTimers()
      const browser = await mountBrowser()
      mockGetLibraryAlbums.mockClear()

      browser.setSearchQuery('to')
      browser.setSearchQuery('tote')
      browser.setSearchQuery('tote hosen')
      await vi.advanceTimersByTimeAsync(299)

      expect(mockGetLibraryAlbums).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
      expect(queryOfCall(0)['search']).toBe('tote hosen')
    })

    it('sends no search param once the field is cleared again', async () => {
      vi.useFakeTimers()
      const browser = await mountBrowser()

      browser.setSearchQuery('hosen')
      await vi.advanceTimersByTimeAsync(300)
      mockGetLibraryAlbums.mockClear()

      browser.setSearchQuery('   ')
      await vi.advanceTimersByTimeAsync(300)

      expect(queryOfCall(0)['search']).toBeUndefined()
      expect(browser.hasActiveFilters.value).toBe(false)
    })
  })

  describe('stale responses', () => {
    it('discards a first-page response that arrives after a filter change', async () => {
      const slowFirstPage = deferred<AlbumsResult>()
      mockGetLibraryAlbums.mockReturnValueOnce(slowFirstPage.promise)

      const browser = await mountBrowser()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('9', 'Nevermind')], false))
      browser.setDecadeFilter('1990s')
      await flushPromises()

      slowFirstPage.resolve(page([album('1', 'Kid A'), album('2', 'Amnesiac')], true))
      await flushPromises()

      expect(titlesOf(browser.albums.value)).toEqual(['Nevermind'])
      expect(browser.showsLoadMore.value).toBe(false)
      expect(browser.currentStatus.value).toBe('success')
    })

    it('discards a follow-up page that arrives after a filter change', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
      const browser = await mountBrowser()

      const slowSecondPage = deferred<AlbumsResult>()
      mockGetLibraryAlbums.mockReturnValueOnce(slowSecondPage.promise)
      const pendingLoadMore = browser.loadMoreCurrent()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('9', 'Nevermind')], false))
      browser.setGenreFilter(153)
      await flushPromises()

      slowSecondPage.resolve(page([album('2', 'Amnesiac')], true))
      await pendingLoadMore
      await flushPromises()

      expect(titlesOf(browser.albums.value)).toEqual(['Nevermind'])
      expect(browser.isLoadingMoreCurrent.value).toBe(false)
    })

    it('lets an error from an abandoned request not poison the new one', async () => {
      const slowFirstPage = deferred<AlbumsResult>()
      mockGetLibraryAlbums.mockReturnValueOnce(slowFirstPage.promise)

      const browser = await mountBrowser()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('9', 'Nevermind')], false))
      browser.setSortBy('title-az')
      await flushPromises()

      slowFirstPage.resolve(serverError)
      await flushPromises()

      expect(browser.currentStatus.value).toBe('success')
      expect(titlesOf(browser.albums.value)).toEqual(['Nevermind'])
    })
  })
})
