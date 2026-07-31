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

describe('LibraryView — server-driven browsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], 1))
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  describe('load more', () => {
    it('offers the button while albums are missing from the current filter', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], 3))

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(true)
    })

    it('hides the button once every album of the filter is on screen', async () => {
      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')], 1))

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(false)
    })

    it('appends the next page behind the current one when clicked', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(
        page([album('1', 'Kid A'), album('2', 'Amnesiac')], 3),
      )
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('3', 'Bends')], 3))
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
      mockGetLibraryAlbums.mockResolvedValueOnce(page([album('1', 'Kid A')], 3))
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

  describe('genre filter', () => {
    it('lists the genres in the order the endpoint returned them', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [
          { id: 153, name: 'Rock', albumCount: 81 },
          { id: 7, name: 'Ambient', albumCount: 40 },
          { id: 91, name: 'Jazz', albumCount: 12 },
        ],
      })

      const wrapper = await mountView()

      const options = wrapper.findAll('[data-testid="genre-filter-select"] option')
      expect(options.map((option) => option.text())).toEqual([
        'All genres',
        'Rock',
        'Ambient',
        'Jazz',
      ])
      expect(options.map((option) => option.attributes('value'))).toEqual(['', '153', '7', '91'])
    })

    it('lists the cold genre response that carries no album counts', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [
          { id: 7, name: 'Ambient' },
          { id: 91, name: 'Jazz' },
        ],
      })

      const wrapper = await mountView()

      expect(
        wrapper.findAll('[data-testid="genre-filter-select"] option').map((o) => o.text()),
      ).toEqual(['All genres', 'Ambient', 'Jazz'])
    })

    it('requests the first page of the selected genre and stores its id', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [{ id: 153, name: 'Rock', albumCount: 81 }],
      })
      const wrapper = await mountView()

      const select = wrapper.find('[data-testid="genre-filter-select"]')
      await select.setValue('153')
      await flushPromises()

      expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
        60,
        0,
        expect.objectContaining({ genreId: 153 }),
      )
      expect(sessionStorage.getItem('library-genre-filter')).toBe('153')
    })

    it('drops the genre from the request when All genres is selected again', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: true,
        value: [{ id: 153, name: 'Rock', albumCount: 81 }],
      })
      sessionStorage.setItem('library-genre-filter', '153')
      const wrapper = await mountView()

      await wrapper.find('[data-testid="genre-filter-select"]').setValue('')
      await flushPromises()

      expect(lastQuery()['genreId']).toBeUndefined()
      expect(sessionStorage.getItem('library-genre-filter')).toBeNull()
    })

    it('keeps the filter usable when the genre endpoint is unreachable', async () => {
      mockGetLibraryGenres.mockResolvedValue({
        ok: false,
        error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
      })

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="genre-filter-select"]').exists()).toBe(true)
      expect(
        wrapper.findAll('[data-testid="genre-filter-select"] option').map((o) => o.text()),
      ).toEqual(['All genres'])
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })
  })
})
