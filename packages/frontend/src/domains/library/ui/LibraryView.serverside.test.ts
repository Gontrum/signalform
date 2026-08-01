/**
 * LibraryView — server-driven sorting, filtering and pagination.
 *
 * Split out of LibraryView.test.ts (45 KB) so a session touching pagination
 * does not have to load the whole view suite.
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

const album = (id: string, title: string): LibraryAlbum => ({
  id,
  title,
  artist: `Artist ${id}`,
  releaseYear: 2001,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const page = (
  albums: readonly LibraryAlbum[],
  hasMore: boolean,
): {
  readonly ok: true
  readonly value: { readonly albums: readonly LibraryAlbum[]; readonly hasMore: boolean }
} => ({ ok: true, value: { albums, hasMore } }) as const

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

describe('LibraryView — server-driven browsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], false))
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  describe('load more', () => {
    it('offers the button while the server reports another page', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], true))

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(true)
    })

    it('hides the button once the server reports no further page', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], false))

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(false)
    })

    it('appends the next page behind the current one when clicked', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('1', 'Kid A'), album('2', 'Amnesiac')], true),
      )
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('3', 'Bends')], false))
      await wrapper.find('[data-testid="load-more-button"]').trigger('click')
      await flushPromises()

      // Alphabetical order would be Amnesiac, Bends, Kid A — the fixture only
      // matches if the second page really lands behind the first.
      const cards = wrapper.findAll('[data-testid="album-card"]')
      expect(cards).toHaveLength(3)
      expect(cards[0]?.text()).toContain('Kid A')
      expect(cards[1]?.text()).toContain('Amnesiac')
      expect(cards[2]?.text()).toContain('Bends')
      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(60, 2, expect.any(Object))
      expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(false)
    })

    it('shows a message when the next page fails and keeps the button', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], true))
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValueOnce({
        ok: false,
        error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
      })
      await wrapper.find('[data-testid="load-more-button"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="load-more-error"]').text()).toBe(
        'Could not load more albums',
      )
      expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })
  })

  describe('sort and decade controls', () => {
    it('re-requests the first page with the chosen sort', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ sort: 'year-newest' }),
      )
    })

    it('re-requests the first page with the chosen decade', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-1990s"]').trigger('click')
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ decade: '1990s' }),
      )
    })

    it('explains that recently-added dropped the decade filter', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="decade-chip-2010s"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="sort-chip-recently-added"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="filter-adjusted-message"]').text()).toBe(
        'Decade filter cleared — "Recently added" covers the whole library',
      )
      expect(wrapper.find('[data-testid="decade-chip-all"]').attributes('aria-pressed')).toBe(
        'true',
      )
      expect(lastQuery()).toMatchObject({ sort: 'recently-added', decade: 'all' })
    })

    it('explains that a decade dropped the recently-added sort', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-recently-added"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="decade-chip-2000s"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="filter-adjusted-message"]').text()).toBe(
        'Sorted by artist — "Recently added" ignores decades',
      )
      expect(wrapper.find('[data-testid="sort-chip-artist-az"]').attributes('aria-pressed')).toBe(
        'true',
      )
      expect(lastQuery()).toMatchObject({ sort: 'artist-az', decade: '2000s' })
    })

    it('keeps the notice hidden for a combination the server accepts', async () => {
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-title-az"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="filter-adjusted-message"]').exists()).toBe(false)
    })
  })

  // Genre chips, the datalist autocomplete and their cold/unreachable states
  // live in LibraryView.browsing.test.ts.
  describe('genre filter', () => {
    it('sends the genre stored from a previous visit with the first page', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [{ id: 153, name: 'Rock', albumCount: 81 }],
      })
      sessionStorage.setItem('library-genre-filter', '153')

      await mountView()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ genreId: 153 }),
      )
    })

    it('drops genre, decade and search together when all filters are cleared', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [{ id: 153, name: 'Rock', albumCount: 81 }],
      })
      sessionStorage.setItem('library-genre-filter', '153')
      sessionStorage.setItem('library-decade-filter', '1990s')
      const wrapper = await mountView()

      await wrapper.find('[data-testid="clear-all-filters"]').trigger('click')
      await flushPromises()

      expect(lastQuery()['genreId']).toBeUndefined()
      expect(lastQuery()['decade']).toBe('all')
      expect(sessionStorage.getItem('library-genre-filter')).toBeNull()
    })
  })
})
