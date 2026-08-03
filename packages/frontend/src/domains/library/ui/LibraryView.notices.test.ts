/**
 * LibraryView — the two explanations for server behaviour the list cannot show
 * by itself: the `sort:new` cap of LMS and what a decade filter does to the
 * ordering and to albums without a release year.
 *
 * Own file because LibraryView.test.ts is already 38 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  getLibraryArtists: vi.fn(),
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

import { getLibraryAlbums, getLibraryArtists, getLibraryGenres } from '@/platform/api/libraryApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryArtists = vi.mocked(getLibraryArtists)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)

// The backend caps `sort:new` at 100 rows (shared RECENTLY_ADDED_ALBUM_LIMIT).
const CAP = 100
const FIRST_PAGE_SIZE = 60

const albums = (count: number, startIndex: number): readonly LibraryAlbum[] =>
  Array.from({ length: count }, (_, index) => {
    const id = String(startIndex + index + 1)
    return {
      id,
      title: `Album ${id}`,
      artist: `Artist ${id}`,
      releaseYear: 1994,
      coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
    }
  })

const page = (
  pageAlbums: readonly LibraryAlbum[],
  hasMore: boolean,
): {
  readonly ok: true
  readonly value: { readonly albums: readonly LibraryAlbum[]; readonly hasMore: boolean }
} => ({ ok: true, value: { albums: pageAlbums, hasMore } }) as const

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

// The cap is only reachable through a second page — 60 + 40 is what the user
// actually does to get there.
const loadUpToCap = async (wrapper: VueWrapper): Promise<void> => {
  mockGetLibraryAlbums.mockResolvedValueOnce(
    page(albums(CAP - FIRST_PAGE_SIZE, FIRST_PAGE_SIZE), false),
  )
  await wrapper.find('[data-testid="load-more-button"]').trigger('click')
  await flushPromises()
}

const capNotice = (wrapper: VueWrapper): ReturnType<VueWrapper['find']> =>
  wrapper.find('[data-testid="recently-added-cap-notice"]')

const decadeNotice = (wrapper: VueWrapper): ReturnType<VueWrapper['find']> =>
  wrapper.find('[data-testid="decade-scope-notice"]')

describe('LibraryView — notices for capped and reordered results', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    mockGetLibraryAlbums.mockResolvedValue(page(albums(3, 0), false))
    mockGetLibraryArtists.mockResolvedValue({
      ok: true,
      value: { artists: [{ id: '1', name: 'Portishead' }], hasMore: false },
    })
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  describe('recently added cap', () => {
    it('explains the cap once the list has filled it', async () => {
      sessionStorage.setItem('library-sort-by', 'recently-added')
      mockGetLibraryAlbums.mockResolvedValueOnce(page(albums(FIRST_PAGE_SIZE, 0), true))
      const wrapper = await mountView()

      await loadUpToCap(wrapper)

      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(CAP)
      expect(capNotice(wrapper).text()).toBe(
        'End of the list — LMS reports at most the 100 most recently added albums.',
      )
      expect(decadeNotice(wrapper).exists()).toBe(false)
    })

    it('stays silent while the list is still short of the cap', async () => {
      sessionStorage.setItem('library-sort-by', 'recently-added')
      mockGetLibraryAlbums.mockResolvedValueOnce(page(albums(FIRST_PAGE_SIZE, 0), true))
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValueOnce(page(albums(CAP - FIRST_PAGE_SIZE - 1, 60), false))
      await wrapper.find('[data-testid="load-more-button"]').trigger('click')
      await flushPromises()

      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(CAP - 1)
      expect(capNotice(wrapper).exists()).toBe(false)
    })

    it('stays silent for a full-length list under a different sort', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page(albums(FIRST_PAGE_SIZE, 0), true))
      const wrapper = await mountView()

      await loadUpToCap(wrapper)

      expect(wrapper.find('[data-testid="sort-chip-artist-az"]').attributes('aria-pressed')).toBe(
        'true',
      )
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(CAP)
      expect(capNotice(wrapper).exists()).toBe(false)
    })

    it('stays silent while the albums are the artist list', async () => {
      sessionStorage.setItem('library-sort-by', 'recently-added')
      mockGetLibraryAlbums.mockResolvedValueOnce(page(albums(FIRST_PAGE_SIZE, 0), true))
      const wrapper = await mountView()
      await loadUpToCap(wrapper)

      await wrapper.find('[data-testid="browse-mode-artists"]').trigger('click')
      await flushPromises()

      expect(capNotice(wrapper).exists()).toBe(false)
    })
  })

  describe('decade scope', () => {
    it('says nothing while no decade is selected', async () => {
      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="decade-chip-all"]').attributes('aria-pressed')).toBe(
        'true',
      )
      expect(decadeNotice(wrapper).exists()).toBe(false)
    })

    it('explains ordering and missing years in a single block', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-1990s"]').trigger('click')
      await flushPromises()

      expect(wrapper.findAll('[data-testid="decade-scope-notice"]')).toHaveLength(1)
      expect(decadeNotice(wrapper).text()).toBe(
        'Inside a decade the server orders by year first, then by Artist A–Z. Albums without a release year belong to no decade and show up only without a decade filter.',
      )
      expect(capNotice(wrapper).exists()).toBe(false)
    })

    it('names the sort that is still in effect inside a year', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-2000s"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="sort-chip-title-az"]').trigger('click')
      await flushPromises()

      expect(decadeNotice(wrapper).text()).toContain('then by Album A–Z')
      expect(decadeNotice(wrapper).text()).not.toContain('Artist A–Z')
    })

    it('says it in German when the language is German', async () => {
      const i18nStore = setupTestEnv()
      i18nStore.setLanguage('de')
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-2010s"]').trigger('click')
      await flushPromises()

      expect(decadeNotice(wrapper).text()).toBe(
        'Innerhalb einer Dekade ordnet der Server zuerst nach Jahr, darin nach Künstler A–Z. Alben ohne Jahresangabe gehören zu keiner Dekade und erscheinen nur ohne Dekaden-Filter.',
      )
    })

    it('disappears again when the decade filter is cleared', async () => {
      sessionStorage.setItem('library-decade-filter', '1990s')
      const wrapper = await mountView()
      expect(decadeNotice(wrapper).exists()).toBe(true)

      await wrapper.find('[data-testid="clear-all-filters"]').trigger('click')
      await flushPromises()

      expect(decadeNotice(wrapper).exists()).toBe(false)
    })

    it('stays away from an empty result, which has no ordering to explain', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([], false))
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-2020s"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="no-filter-results"]').exists()).toBe(true)
      expect(decadeNotice(wrapper).exists()).toBe(false)
    })
  })
})
