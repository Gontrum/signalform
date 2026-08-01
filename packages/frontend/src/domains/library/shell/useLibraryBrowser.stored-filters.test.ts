/**
 * useLibraryBrowser — the filter pair restored from sessionStorage.
 *
 * Regression guard for a production bug: storage written before the browse
 * moved server-side holds 'recently-added' together with a real decade, a
 * combination the backend answers with 400. Reconciliation only ran in
 * setSortBy/setDecadeFilter, so the stored pair went straight into the first
 * request and the library never loaded again for anyone with that pair.
 *
 * Sibling file of useLibraryBrowser.test.ts (17 KB) — see AGENTS.md "Testing".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { DecadeFilter, SortOption } from '@signalform/shared'
import type { LibraryAlbum } from '@/platform/api/libraryApi'

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

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: '/cover/1.jpg',
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

const firstQuery = (): Record<string, unknown> =>
  (mockGetLibraryAlbums.mock.calls[0]?.[2] ?? {}) as Record<string, unknown>

const SORTS: readonly SortOption[] = ['artist-az', 'title-az', 'year-newest', 'recently-added']
const DECADES: readonly DecadeFilter[] = ['all', '2020s', '2010s', '2000s', '1990s', 'older']

// Every pair the old client could persist. Only 'recently-added' plus a real
// decade is rejected by the server, so only those rows may be rewritten — the
// table pins the other 20 as untouched instead of trusting a single sample.
const storedPairs = SORTS.flatMap((sort) => DECADES.map((decade) => [sort, decade] as const))

const expectedPair = (
  sort: SortOption,
  decade: DecadeFilter,
): { readonly sort: SortOption; readonly decade: DecadeFilter } =>
  sort === 'recently-added' && decade !== 'all' ? { sort, decade: 'all' } : { sort, decade }

describe('useLibraryBrowser — filters restored from sessionStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [album], totalCount: 1 } })
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  it.each(storedPairs)(
    'sends a combination the server accepts for stored %s + %s',
    async (sort, decade) => {
      sessionStorage.setItem('library-sort-by', sort)
      sessionStorage.setItem('library-decade-filter', decade)

      const browser = await mountBrowser()
      const expected = expectedPair(sort, decade)

      expect(firstQuery()).toEqual({ ...expected, genreId: undefined, search: undefined })
      expect(browser.sortBy.value).toBe(expected.sort)
      expect(browser.decadeFilter.value).toBe(expected.decade)
      expect(browser.currentStatus.value).toBe('success')
    },
  )

  it.each(storedPairs)('leaves storage consistent for stored %s + %s', async (sort, decade) => {
    sessionStorage.setItem('library-sort-by', sort)
    sessionStorage.setItem('library-decade-filter', decade)

    await mountBrowser()
    const expected = expectedPair(sort, decade)

    // A corrected decade must be gone from storage — otherwise the next reload
    // reads the rejected pair back and the correction repeats forever. Every
    // accepted pair, including a literally stored 'all', stays byte-identical.
    expect(sessionStorage.getItem('library-sort-by')).toBe(sort)
    expect(sessionStorage.getItem('library-decade-filter')).toBe(
      expected.decade === decade ? decade : null,
    )
  })

  it('keeps the genre filter while the decade gives way', async () => {
    sessionStorage.setItem('library-sort-by', 'recently-added')
    sessionStorage.setItem('library-decade-filter', '1990s')
    sessionStorage.setItem('library-genre-filter', '153')

    const browser = await mountBrowser()

    expect(firstQuery()).toEqual({
      sort: 'recently-added',
      decade: 'all',
      genreId: 153,
      search: undefined,
    })
    expect(browser.genreFilter.value).toBe(153)
  })

  it('stays silent about a correction the user did not trigger', async () => {
    sessionStorage.setItem('library-sort-by', 'recently-added')
    sessionStorage.setItem('library-decade-filter', 'older')

    const browser = await mountBrowser()

    expect(browser.adjustedFilter.value).toBeNull()
  })

  it('writes no sort into empty storage', async () => {
    await mountBrowser()

    expect(sessionStorage.getItem('library-sort-by')).toBeNull()
    expect(sessionStorage.getItem('library-decade-filter')).toBeNull()
    expect(firstQuery()).toMatchObject({ sort: 'artist-az', decade: 'all' })
  })

  it('still reconciles after the corrected decade is chosen again', async () => {
    sessionStorage.setItem('library-sort-by', 'recently-added')
    sessionStorage.setItem('library-decade-filter', '1990s')

    const browser = await mountBrowser()
    browser.setDecadeFilter('1990s')
    await flushPromises()

    expect(browser.sortBy.value).toBe('artist-az')
    expect(browser.decadeFilter.value).toBe('1990s')
    expect(browser.adjustedFilter.value).toBe('sort')
    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
      60,
      0,
      expect.objectContaining({ sort: 'artist-az', decade: '1990s' }),
    )
  })
})
