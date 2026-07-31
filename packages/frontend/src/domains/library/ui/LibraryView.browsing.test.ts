/**
 * LibraryView — genre chips, library search, year headings and the
 * scroll-triggered load-more.
 *
 * Sibling of LibraryView.serverside.test.ts (pagination, sort, decade) so a
 * session touching one of the two does not have to load the other.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import LibraryView from './LibraryView.vue'
import type { VueWrapper } from '@vue/test-utils'
import type { LibraryAlbum } from '@/platform/api/libraryApi'
import { setupTestEnv, createTestRouter } from '@/test-utils'

const isPhone = ref(false)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(true),
  }),
}))

vi.mock('@/platform/api/libraryApi', () => ({
  getLibraryAlbums: vi.fn(),
  getLibraryGenres: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbums: vi.fn(),
  getTidalFeaturedAlbums: vi.fn(),
}))

import { getLibraryAlbums, getLibraryGenres } from '@/platform/api/libraryApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)

type ObserverEntry = { readonly isIntersecting: boolean }
type ObserverCallback = (entries: readonly ObserverEntry[]) => void
type ObserverStub = {
  readonly observe: () => void
  readonly unobserve: () => void
  readonly disconnect: () => void
  readonly takeRecords: () => readonly ObserverEntry[]
}

let intersectionCallback: ObserverCallback | undefined
const disconnectSpy = vi.fn()

// happy-dom ships an IntersectionObserver that never fires; this replacement
// hands the callback back to the test so scrolling can be simulated. It has to
// be a function expression — the observer is invoked with `new`, which an
// arrow function does not support.
vi.stubGlobal(
  'IntersectionObserver',
  function createObserverStub(callback: ObserverCallback): ObserverStub {
    intersectionCallback = callback

    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: disconnectSpy,
      takeRecords: (): readonly ObserverEntry[] => [],
    }
  },
)

const scrollLoadMoreIntoView = async (): Promise<void> => {
  intersectionCallback?.([{ isIntersecting: true }])
  await flushPromises()
}

const album = (id: string, title: string, releaseYear: number | null = 2001): LibraryAlbum => ({
  id,
  title,
  artist: `Artist ${id}`,
  releaseYear,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const page = (
  albums: readonly LibraryAlbum[],
  totalCount: number,
): {
  readonly ok: true
  readonly value: { readonly albums: readonly LibraryAlbum[]; readonly totalCount: number }
} => ({ ok: true, value: { albums, totalCount } }) as const

const mountView = async (): Promise<VueWrapper> => {
  const router = await createTestRouter(
    [
      { path: '/library', name: 'library', component: LibraryView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    '/library',
  )

  const wrapper = mount(LibraryView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const lastQuery = (): Record<string, unknown> => {
  const calls = mockGetLibraryAlbums.mock.calls
  const call = calls[calls.length - 1]
  return (call?.[2] ?? {}) as Record<string, unknown>
}

// Heading and card in one flat list, so the assertion pins the position of
// every heading between the albums, not just how many were rendered.
const gridSequence = (wrapper: VueWrapper): readonly string[] =>
  wrapper.findAll('[data-testid="album-grid"] > *').map((node) => {
    const testid = node.attributes('data-testid') ?? ''
    const title = node.find('[data-testid="album-title"]')

    return `${testid}:${title.exists() ? title.text() : node.text()}`
  })

const setSearch = async (wrapper: VueWrapper, value: string): Promise<void> => {
  vi.useFakeTimers()
  await wrapper.find('[data-testid="library-search-input"]').setValue(value)
  await vi.advanceTimersByTimeAsync(300)
  vi.useRealTimers()
  await flushPromises()
}

describe('LibraryView — genre chips, search, year headings, scroll loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    intersectionCallback = undefined
    mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], 1))
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('genre chips', () => {
    const rankedGenres = {
      ok: true as const,
      value: [
        { id: 153, name: 'Rock', albumCount: 81 },
        { id: 7, name: 'Ambient', albumCount: 40 },
        { id: 91, name: 'Jazz', albumCount: 12 },
      ],
    }

    it('renders the chips in the ranking the endpoint returned, not alphabetically', async () => {
      mockGetLibraryGenres.mockResolvedValue(rankedGenres)

      const wrapper = await mountView()

      expect(
        wrapper.findAll('[data-testid="genre-chips"] button').map((chip) => chip.text()),
      ).toEqual(['Rock', 'Ambient', 'Jazz'])
    })

    it('requests the first page of the clicked genre and marks the chip active', async () => {
      mockGetLibraryGenres.mockResolvedValue(rankedGenres)
      const wrapper = await mountView()

      await wrapper.find('[data-testid="genre-chip-7"]').trigger('click')
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ genreId: 7 }),
      )
      expect(wrapper.find('[data-testid="genre-chip-7"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('[data-testid="genre-chip-153"]').attributes('aria-pressed')).toBe(
        'false',
      )
      expect(sessionStorage.getItem('library-genre-filter')).toBe('7')
    })

    it('drops the genre filter when the active chip is clicked again', async () => {
      mockGetLibraryGenres.mockResolvedValue(rankedGenres)
      const wrapper = await mountView()

      await wrapper.find('[data-testid="genre-chip-7"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="genre-chip-7"]').trigger('click')
      await flushPromises()

      expect(lastQuery()['genreId']).toBeUndefined()
      expect(wrapper.find('[data-testid="genre-chip-7"]').attributes('aria-pressed')).toBe('false')
      expect(sessionStorage.getItem('library-genre-filter')).toBeNull()
    })

    it('mirrors the chip selection into the autocomplete field', async () => {
      mockGetLibraryGenres.mockResolvedValue(rankedGenres)
      const wrapper = await mountView()

      await wrapper.find('[data-testid="genre-chip-91"]').trigger('click')
      await flushPromises()

      expect(
        wrapper.find<HTMLInputElement>('[data-testid="genre-filter-input"]').element.value,
      ).toBe('Jazz')
    })

    it('hides the chip row while the endpoint is still cold and has no counts', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [
          { id: 7, name: 'Ambient' },
          { id: 91, name: 'Jazz' },
          { id: 153, name: 'Rock' },
        ],
      })

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="genre-chips"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="genre-filter-input"]').exists()).toBe(true)
      expect(
        wrapper
          .findAll('#library-genre-options option')
          .map((option) => option.attributes('value')),
      ).toEqual(['Ambient', 'Jazz', 'Rock'])
    })

    it('offers no genre controls at all when the endpoint is unreachable', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: false,
        error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
      })

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="genre-chips"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="genre-filter-input"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })

    it('shows the stored genre in the field once the genre list arrives', async () => {
      mockGetLibraryGenres.mockResolvedValue(rankedGenres)
      sessionStorage.setItem('library-genre-filter', '153')

      const wrapper = await mountView()

      expect(
        wrapper.find<HTMLInputElement>('[data-testid="genre-filter-input"]').element.value,
      ).toBe('Rock')
    })
  })

  describe('genre autocomplete', () => {
    // 21 genres so that 'Zydeco' sits outside the 20 chips and is reachable
    // through the datalist only.
    const chipGenres = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      name: `Genre ${index + 1}`,
      albumCount: 100 - index,
    }))
    const manyGenres = {
      ok: true as const,
      value: [...chipGenres, { id: 900, name: 'Zydeco', albumCount: 3 }],
    }

    it('lists chips and rest together in the datalist', async () => {
      mockGetLibraryGenres.mockResolvedValue(manyGenres)

      const wrapper = await mountView()

      const options = wrapper.findAll('#library-genre-options option')
      expect(options).toHaveLength(21)
      expect(options[20]?.attributes('value')).toBe('Zydeco')
      expect(wrapper.findAll('[data-testid="genre-chips"] button')).toHaveLength(20)
    })

    it('filters by a genre that is not among the chips', async () => {
      mockGetLibraryGenres.mockResolvedValue(manyGenres)
      const wrapper = await mountView()

      await wrapper.find('[data-testid="genre-filter-input"]').setValue('Zydeco')
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ genreId: 900 }),
      )
      expect(wrapper.find('[data-testid="genre-chip-1"]').attributes('aria-pressed')).toBe('false')
    })

    it('ignores a partial entry that matches no genre', async () => {
      mockGetLibraryGenres.mockResolvedValue(manyGenres)
      const wrapper = await mountView()
      const callsBefore = mockGetLibraryAlbums.mock.calls.length

      await wrapper.find('[data-testid="genre-filter-input"]').setValue('Zyd')
      await flushPromises()

      expect(mockGetLibraryAlbums.mock.calls.length).toBe(callsBefore)
    })

    it('clears the genre filter when the field is emptied', async () => {
      mockGetLibraryGenres.mockResolvedValue(manyGenres)
      sessionStorage.setItem('library-genre-filter', '900')
      const wrapper = await mountView()

      await wrapper.find('[data-testid="genre-filter-input"]').setValue('')
      await flushPromises()

      expect(lastQuery()['genreId']).toBeUndefined()
      expect(sessionStorage.getItem('library-genre-filter')).toBeNull()
    })
  })

  describe('library search', () => {
    it('sends the debounced term with the first page', async () => {
      const wrapper = await mountView()

      await setSearch(wrapper, 'tote hosen')

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ search: 'tote hosen' }),
      )
    })

    it('returns to the unfiltered list when the field is cleared', async () => {
      const wrapper = await mountView()

      await setSearch(wrapper, 'tote hosen')
      await setSearch(wrapper, '')

      expect(lastQuery()['search']).toBeUndefined()
      expect(
        wrapper.find<HTMLInputElement>('[data-testid="library-search-input"]').element.value,
      ).toBe('')
    })

    it('keeps the field mounted while the filtered page is loading', async () => {
      const wrapper = await mountView()

      vi.useFakeTimers()
      await wrapper.find('[data-testid="library-search-input"]').setValue('kid')
      mockGetLibraryAlbums.mockReturnValue(new Promise(() => {}))
      await vi.advanceTimersByTimeAsync(300)
      vi.useRealTimers()
      await flushPromises()

      expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="library-search-input"]').exists()).toBe(true)
    })

    it('reports an empty result as a filter miss, not as an empty library', async () => {
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValue(page([], 0))
      await setSearch(wrapper, 'nothing here')

      expect(wrapper.find('[data-testid="no-filter-results"]').text()).toBe(
        'No albums match the current filters',
      )
      expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)
    })
  })

  describe('year headings', () => {
    it('groups the year-newest list by year', async () => {
      mockGetLibraryAlbums.mockResolvedValue(
        page(
          [album('1', 'Later', 2003), album('2', 'Also later', 2003), album('3', 'Earlier', 1999)],
          3,
        ),
      )
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
      await flushPromises()

      expect(gridSequence(wrapper)).toEqual([
        'year-heading:2003',
        'album-card:Later',
        'album-card:Also later',
        'year-heading:1999',
        'album-card:Earlier',
      ])
    })

    it('groups by year when a decade filter drives the order under artist A–Z', async () => {
      mockGetLibraryAlbums.mockResolvedValue(
        page([album('1', 'Zebra', 2015), album('2', 'Apple', 2012)], 2),
      )
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-2010s"]').trigger('click')
      await flushPromises()

      expect(gridSequence(wrapper)).toEqual([
        'year-heading:2015',
        'album-card:Zebra',
        'year-heading:2012',
        'album-card:Apple',
      ])
    })

    it('shows no headings for artist A–Z without a decade filter', async () => {
      mockGetLibraryAlbums.mockResolvedValue(
        page([album('1', 'Zebra', 2015), album('2', 'Apple', 2012)], 2),
      )

      const wrapper = await mountView()

      expect(wrapper.findAll('[data-testid="year-heading"]')).toHaveLength(0)
    })

    it('gives albums without a year their own heading instead of a zero', async () => {
      mockGetLibraryAlbums.mockResolvedValue(
        page([album('1', 'Dated', 1984), album('2', 'Undated', null)], 2),
      )
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
      await flushPromises()

      expect(gridSequence(wrapper)).toEqual([
        'year-heading:1984',
        'album-card:Dated',
        'year-heading:Year unknown',
        'album-card:Undated',
      ])
    })

    it('does not repeat a year when the next page opens with it', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('1', 'Newest', 2004), album('2', 'Middle', 2003)], 4),
      )
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('1', 'Newest', 2004), album('2', 'Middle', 2003)], 4),
      )
      await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
      await flushPromises()

      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('3', 'Same year', 2003), album('4', 'Oldest', 1998)], 4),
      )
      await wrapper.find('[data-testid="load-more-button"]').trigger('click')
      await flushPromises()

      expect(gridSequence(wrapper)).toEqual([
        'year-heading:2004',
        'album-card:Newest',
        'year-heading:2003',
        'album-card:Middle',
        'album-card:Same year',
        'year-heading:1998',
        'album-card:Oldest',
      ])
    })

    it('uses a heading level below the page title in list view too', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Dated', 1984)], 1))
      localStorage.setItem('library-view-mode', 'list')
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
      await flushPromises()

      const heading = wrapper.find('[data-testid="album-list"] [data-testid="year-heading"]')
      expect(heading.element.tagName).toBe('H2')
      expect(heading.text()).toBe('1984')
    })
  })

  describe('load more on scroll', () => {
    it('fetches the next page when the load-more button scrolls into view', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('1', 'Kid A'), album('2', 'Amnesiac')], 3),
      )
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('3', 'Bends')], 3))
      await scrollLoadMoreIntoView()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(60, 2, expect.any(Object))
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(3)
    })

    it('ignores an observer entry that is not intersecting', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], 3))
      await mountView()
      const callsBefore = mockGetLibraryAlbums.mock.calls.length

      intersectionCallback?.([{ isIntersecting: false }])
      await flushPromises()

      expect(mockGetLibraryAlbums.mock.calls.length).toBe(callsBefore)
    })

    it('loads a page only once while a request is still in flight', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], 3))
      await mountView()
      const callsBefore = mockGetLibraryAlbums.mock.calls.length

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('2', 'Amnesiac')], 3))
      intersectionCallback?.([{ isIntersecting: true }])
      intersectionCallback?.([{ isIntersecting: true }])
      await flushPromises()

      expect(mockGetLibraryAlbums.mock.calls.length).toBe(callsBefore + 1)
    })

    it('disconnects the observer when the view goes away', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], 3))
      const wrapper = await mountView()

      wrapper.unmount()

      expect(disconnectSpy).toHaveBeenCalled()
    })
  })
})
