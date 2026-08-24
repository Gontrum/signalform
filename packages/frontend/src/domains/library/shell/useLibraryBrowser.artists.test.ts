/**
 * useLibraryBrowser — the artist mode: its own pagination, the shared search
 * field, and the reset that a mode switch owes both lists.
 *
 * Sibling of useLibraryBrowser.test.ts so the artist cases do not grow the
 * album suite any further.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { Result } from '@signalform/shared'
import type {
  LibraryAlbum,
  LibraryAlbumsResponse,
  LibraryApiError,
  LibraryArtist,
  LibraryArtistsResponse,
} from '@/platform/api/libraryApi'

vi.mock('@/platform/api/libraryApi', () => ({
  getLibraryAlbums: vi.fn(),
  getLibraryArtists: vi.fn(),
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

const pushMock = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: (): { readonly query: Record<string, string> } => ({ query: {} }),
  useRouter: (): { readonly push: typeof pushMock } => ({ push: pushMock }),
}))

import { useLibraryBrowser } from './useLibraryBrowser'
import { getLibraryAlbums, getLibraryArtists, getLibraryGenres } from '@/platform/api/libraryApi'
import { getTidalAlbums, getTidalFeaturedAlbums } from '@/platform/api/tidalAlbumsApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryArtists = vi.mocked(getLibraryArtists)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)
const mockGetTidalAlbums = vi.mocked(getTidalAlbums)
const mockGetTidalFeaturedAlbums = vi.mocked(getTidalFeaturedAlbums)

type AlbumsResult = Result<LibraryAlbumsResponse, LibraryApiError>
type ArtistsResult = Result<LibraryArtistsResponse, LibraryApiError>

const PAGE_SIZE = 60

const artist = (id: string, name: string): LibraryArtist => ({ id, name })

const artistPage = (artists: readonly LibraryArtist[], hasMore: boolean): ArtistsResult => ({
  ok: true,
  value: { artists, hasMore },
})

// LMS answers alphabetically; these fixtures deliberately do not, so a hidden
// client-side re-sort would show up in the asserted names.
const FIRST_PAGE = [
  artist('17', 'Tocotronic'),
  artist('3', 'ABBA'),
  artist('9', 'Kraftwerk'),
] as const

const SECOND_PAGE = [artist('4', 'Blumfeld'), artist('11', 'Neu!')] as const

const album = (id: string, title: string): LibraryAlbum => ({
  id,
  title,
  artist: `Artist ${id}`,
  releaseYear: 1999,
  coverArtUrl: `/cover/${id}.jpg`,
})

const albumPage = (albums: readonly LibraryAlbum[], hasMore: boolean): AlbumsResult => ({
  ok: true,
  value: { albums, hasMore },
})

const serverError: ArtistsResult = {
  ok: false,
  error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
}

const namesOf = (artists: readonly LibraryArtist[]): readonly string[] =>
  artists.map((entry) => entry.name)

const artistCall = (index: number): readonly unknown[] =>
  mockGetLibraryArtists.mock.calls[index] ?? []

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

const mountInArtistMode = async (): Promise<ReturnType<typeof useLibraryBrowser>> => {
  const browser = await mountBrowser()
  browser.setBrowseMode('artists')
  await flushPromises()
  return browser
}

describe('useLibraryBrowser — artist mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockGetLibraryAlbums.mockResolvedValue(albumPage([album('1', 'Kid A')], false))
    mockGetLibraryArtists.mockResolvedValue(artistPage(FIRST_PAGE, false))
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
    mockGetTidalAlbums.mockResolvedValue({ ok: true, value: { albums: [], totalCount: 0 } })
    mockGetTidalFeaturedAlbums.mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in album mode and asks for no artists until the mode is switched', async () => {
    const browser = await mountBrowser()

    expect(browser.browseMode.value).toBe('albums')
    expect(mockGetLibraryArtists).not.toHaveBeenCalled()
  })

  it('loads the first artist page from offset 0 when the mode is switched', async () => {
    const browser = await mountInArtistMode()

    expect(browser.browseMode.value).toBe('artists')
    expect(mockGetLibraryArtists).toHaveBeenCalledTimes(1)
    expect(artistCall(0)[0]).toBe(PAGE_SIZE)
    expect(artistCall(0)[1]).toBe(0)
  })

  it('keeps the artists in the order the server delivered them', async () => {
    const browser = await mountInArtistMode()

    expect(namesOf(browser.artists.value)).toEqual(['Tocotronic', 'ABBA', 'Kraftwerk'])
  })

  it('reuses the album page size instead of introducing a second one', async () => {
    mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
    const browser = await mountInArtistMode()

    mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, false))
    await browser.loadMoreCurrent()

    expect(artistCall(0)[0]).toBe(mockGetLibraryAlbums.mock.calls[0]?.[0])
    expect(artistCall(1)[0]).toBe(PAGE_SIZE)
  })

  describe('pagination', () => {
    it('appends the next page behind the first instead of replacing it', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      const browser = await mountInArtistMode()

      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, false))
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(namesOf(browser.artists.value)).toEqual([
        'Tocotronic',
        'ABBA',
        'Kraftwerk',
        'Blumfeld',
        'Neu!',
      ])
    })

    it('asks for the next window using the count already on screen', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      const browser = await mountInArtistMode()

      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, false))
      await browser.loadMoreCurrent()

      expect(artistCall(1)[1]).toBe(FIRST_PAGE.length)
    })

    it('takes hasMore from the server rather than from a full page', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      const browser = await mountInArtistMode()

      expect(browser.showsLoadMore.value).toBe(true)

      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, false))
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(browser.showsLoadMore.value).toBe(false)
    })

    it('refuses to load further once the server reported no next page', async () => {
      const browser = await mountInArtistMode()

      await browser.loadMoreCurrent()
      await flushPromises()

      expect(mockGetLibraryArtists).toHaveBeenCalledTimes(1)
      expect(namesOf(browser.artists.value)).toEqual(['Tocotronic', 'ABBA', 'Kraftwerk'])
    })

    it('keeps the retry reachable after a failed follow-up page', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      const browser = await mountInArtistMode()

      mockGetLibraryArtists.mockResolvedValueOnce(serverError)
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(browser.loadMoreCurrentFailed.value).toBe(true)
      expect(browser.showsLoadMore.value).toBe(true)
      expect(namesOf(browser.artists.value)).toEqual(['Tocotronic', 'ABBA', 'Kraftwerk'])
    })

    it('reports the error state when the first artist page fails', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(serverError)
      const browser = await mountInArtistMode()

      expect(browser.currentStatus.value).toBe('error')
      expect(browser.artists.value).toEqual([])
      expect(browser.showsLoadMore.value).toBe(false)
    })
  })

  describe('mode switching', () => {
    it('drops a loaded second page when the mode is switched away and back', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      const browser = await mountInArtistMode()

      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, true))
      await browser.loadMoreCurrent()
      await flushPromises()
      expect(browser.artists.value).toHaveLength(5)

      browser.setBrowseMode('albums')
      await flushPromises()
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      browser.setBrowseMode('artists')
      await flushPromises()

      expect(namesOf(browser.artists.value)).toEqual(['Tocotronic', 'ABBA', 'Kraftwerk'])
      expect(artistCall(2)[1]).toBe(0)
    })

    it('reloads the albums from the first page when switching back', async () => {
      const browser = await mountInArtistMode()
      mockGetLibraryAlbums.mockClear()

      browser.setBrowseMode('albums')
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
      expect(mockGetLibraryAlbums.mock.calls[0]?.[1]).toBe(0)
    })

    it('ignores a switch to the mode that is already active', async () => {
      const browser = await mountInArtistMode()

      browser.setBrowseMode('artists')
      await flushPromises()

      expect(mockGetLibraryArtists).toHaveBeenCalledTimes(1)
    })

    it('discards an artist page that arrives after the mode was left', async () => {
      let resolveArtists!: (value: ArtistsResult) => void
      mockGetLibraryArtists.mockReturnValueOnce(
        new Promise<ArtistsResult>((resolve) => {
          resolveArtists = resolve
        }),
      )

      const browser = await mountBrowser()
      browser.setBrowseMode('artists')
      await flushPromises()

      browser.setBrowseMode('albums')
      await flushPromises()

      resolveArtists(artistPage(FIRST_PAGE, true))
      await flushPromises()

      expect(browser.artists.value).toEqual([])
    })
  })

  describe('search', () => {
    it('sends the debounced term to the artist endpoint while in artist mode', async () => {
      vi.useFakeTimers()
      const browser = await mountBrowser()
      browser.setBrowseMode('artists')
      await vi.advanceTimersByTimeAsync(0)
      mockGetLibraryArtists.mockClear()
      mockGetLibraryAlbums.mockClear()

      browser.setSearchQuery('kraft')
      browser.setSearchQuery('kraftwerk')
      await vi.advanceTimersByTimeAsync(299)

      expect(mockGetLibraryArtists).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(mockGetLibraryArtists).toHaveBeenCalledTimes(1)
      expect(artistCall(0)[2]).toEqual({ search: 'kraftwerk' })
      expect(mockGetLibraryAlbums).not.toHaveBeenCalled()
    })

    it('restarts the artist list at offset 0 for a new term', async () => {
      vi.useFakeTimers()
      mockGetLibraryArtists.mockResolvedValue(artistPage(FIRST_PAGE, true))
      const browser = await mountBrowser()
      browser.setBrowseMode('artists')
      await vi.advanceTimersByTimeAsync(0)

      await browser.loadMoreCurrent()
      await vi.advanceTimersByTimeAsync(0)
      expect(browser.artists.value).toHaveLength(6)

      mockGetLibraryArtists.mockClear()
      mockGetLibraryArtists.mockResolvedValue(artistPage([artist('9', 'Kraftwerk')], false))
      browser.setSearchQuery('kraftwerk')
      await vi.advanceTimersByTimeAsync(300)

      expect(artistCall(0)[1]).toBe(0)
      expect(namesOf(browser.artists.value)).toEqual(['Kraftwerk'])
    })

    it('sends no search param once the field is cleared again', async () => {
      vi.useFakeTimers()
      const browser = await mountBrowser()
      browser.setBrowseMode('artists')
      await vi.advanceTimersByTimeAsync(0)

      browser.setSearchQuery('kraftwerk')
      await vi.advanceTimersByTimeAsync(300)
      mockGetLibraryArtists.mockClear()

      browser.setSearchQuery('   ')
      await vi.advanceTimersByTimeAsync(300)

      expect(artistCall(0)[2]).toEqual({ search: undefined })
    })

    it('carries the current term into the albums when the mode switches back', async () => {
      vi.useFakeTimers()
      const browser = await mountBrowser()
      browser.setBrowseMode('artists')
      await vi.advanceTimersByTimeAsync(0)

      browser.setSearchQuery('kraftwerk')
      await vi.advanceTimersByTimeAsync(300)
      mockGetLibraryAlbums.mockClear()

      browser.setBrowseMode('albums')
      await vi.advanceTimersByTimeAsync(0)

      expect(mockGetLibraryAlbums.mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({ search: 'kraftwerk' }),
      )
    })
  })

  describe('control visibility', () => {
    it('hides the album controls in artist mode and restores them afterwards', async () => {
      const browser = await mountInArtistMode()

      expect(browser.showsAlbumControls.value).toBe(false)
      expect(browser.showsArtistBrowser.value).toBe(true)

      browser.setBrowseMode('albums')
      await flushPromises()

      expect(browser.showsAlbumControls.value).toBe(true)
      expect(browser.showsArtistBrowser.value).toBe(false)
    })

    it('takes the artist browser and its toggle off the Tidal tab', async () => {
      const browser = await mountInArtistMode()

      browser.setSource('tidal')
      await flushPromises()

      expect(browser.showsBrowseModeToggle.value).toBe(false)
      expect(browser.showsArtistBrowser.value).toBe(false)

      browser.setSource('local')
      await flushPromises()

      expect(browser.showsBrowseModeToggle.value).toBe(true)
      expect(browser.showsArtistBrowser.value).toBe(true)
    })

    it('offers load more only while the server announced another artist page', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
      const browser = await mountInArtistMode()

      expect(browser.showsLoadMore.value).toBe(true)

      mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, false))
      await browser.loadMoreCurrent()
      await flushPromises()

      expect(browser.showsLoadMore.value).toBe(false)
    })

    it('announces the empty artist list only once the load succeeded', async () => {
      mockGetLibraryArtists.mockResolvedValueOnce(artistPage([], false))
      const browser = await mountInArtistMode()

      expect(browser.showsEmptyArtists.value).toBe(true)

      mockGetLibraryArtists.mockResolvedValueOnce(serverError)
      browser.setBrowseMode('albums')
      await flushPromises()
      browser.setBrowseMode('artists')
      await flushPromises()

      expect(browser.showsEmptyArtists.value).toBe(false)
    })
  })

  it('routes to the artist detail view by name', async () => {
    const browser = await mountInArtistMode()

    browser.handleNavigateArtist('Kraftwerk')

    expect(pushMock).toHaveBeenCalledWith({ name: 'unified-artist', query: { name: 'Kraftwerk' } })
  })
})
