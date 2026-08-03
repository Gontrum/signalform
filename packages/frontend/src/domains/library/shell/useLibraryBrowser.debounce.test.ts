/**
 * useLibraryBrowser — a filter click inside the 300 ms search window.
 *
 * Sibling of useLibraryBrowser.test.ts: the setter loads immediately, so the
 * timer still pending from the keystroke must not fetch the same page again.
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

vi.mock('vue-router', () => ({
  useRouter: (): { readonly push: ReturnType<typeof vi.fn> } => ({ push: vi.fn() }),
}))

import { useLibraryBrowser } from './useLibraryBrowser'
import { getLibraryAlbums, getLibraryArtists, getLibraryGenres } from '@/platform/api/libraryApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryArtists = vi.mocked(getLibraryArtists)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)

type AlbumsResult = Result<LibraryAlbumsResponse, LibraryApiError>
type ArtistsResult = Result<LibraryArtistsResponse, LibraryApiError>

const album = (id: string, title: string): LibraryAlbum => ({
  id,
  title,
  artist: `Artist ${id}`,
  releaseYear: 1999,
  coverArtUrl: `/cover/${id}.jpg`,
})

const albumPage: AlbumsResult = {
  ok: true,
  value: { albums: [album('1', 'Kid A')], hasMore: false },
}

const artistPage: ArtistsResult = {
  ok: true,
  value: { artists: [{ id: '9', name: 'Kraftwerk' }], hasMore: false },
}

const albumQueryOfCall = (index: number): Record<string, unknown> => {
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
  await vi.advanceTimersByTimeAsync(0)
  return result!
}

// The initial load is out of the way; every later call belongs to the case.
const mountAndArm = async (): Promise<ReturnType<typeof useLibraryBrowser>> => {
  const browser = await mountBrowser()
  mockGetLibraryAlbums.mockClear()
  mockGetLibraryArtists.mockClear()
  return browser
}

const PAST_DEBOUNCE_MS = 400

describe('useLibraryBrowser — search debounce vs. filter setters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    vi.useFakeTimers()
    mockGetLibraryAlbums.mockResolvedValue(albumPage)
    mockGetLibraryArtists.mockResolvedValue(artistPage)
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads once when a sort click lands inside the search window', async () => {
    const browser = await mountAndArm()

    browser.setSearchQuery('tote')
    await vi.advanceTimersByTimeAsync(200)
    browser.setSortBy('title-az')
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS)

    expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
    expect(albumQueryOfCall(0)).toMatchObject({ sort: 'title-az', search: 'tote' })
  })

  it('loads once when a decade click lands inside the search window', async () => {
    const browser = await mountAndArm()

    browser.setSearchQuery('tote')
    await vi.advanceTimersByTimeAsync(200)
    browser.setDecadeFilter('1990s')
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS)

    expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
    expect(albumQueryOfCall(0)).toMatchObject({ decade: '1990s', search: 'tote' })
  })

  it('loads once when a genre chip lands inside the search window', async () => {
    const browser = await mountAndArm()

    browser.setSearchQuery('tote')
    await vi.advanceTimersByTimeAsync(200)
    browser.setGenreFilter(153)
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS)

    expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
    expect(albumQueryOfCall(0)).toMatchObject({ genreId: 153, search: 'tote' })
  })

  it('loads once when the filters are cleared inside the search window', async () => {
    const browser = await mountAndArm()

    browser.setSearchQuery('tote')
    await vi.advanceTimersByTimeAsync(200)
    browser.clearAllFilters()
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS)

    expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
    expect(albumQueryOfCall(0)['search']).toBeUndefined()
    expect(browser.searchQuery.value).toBe('')
  })

  it('loads the artists once and no albums when the mode switch lands inside the window', async () => {
    const browser = await mountAndArm()

    browser.setSearchQuery('kraft')
    await vi.advanceTimersByTimeAsync(200)
    browser.setBrowseMode('artists')
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS)

    expect(mockGetLibraryArtists).toHaveBeenCalledTimes(1)
    expect(mockGetLibraryAlbums).not.toHaveBeenCalled()
  })

  it('still loads once for a keystroke that no filter click interrupts', async () => {
    const browser = await mountAndArm()

    browser.setSearchQuery('tote')
    await vi.advanceTimersByTimeAsync(200)

    expect(mockGetLibraryAlbums).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS)

    expect(mockGetLibraryAlbums).toHaveBeenCalledTimes(1)
    expect(albumQueryOfCall(0)['search']).toBe('tote')
  })
})
