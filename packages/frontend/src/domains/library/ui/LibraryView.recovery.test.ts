/**
 * LibraryView — the error and empty states must not be dead ends.
 *
 * Regression guard for a production bug: every non-success state used to swap
 * the whole filter block for its message, so a query the server rejected (400)
 * or could not answer (503) took away exactly the controls that change the
 * query. Only the album list may be replaced.
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

const album = (id: string, title: string): LibraryAlbum => ({
  id,
  title,
  artist: `Artist ${id}`,
  releaseYear: 2001,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const page = (
  albums: readonly LibraryAlbum[],
): {
  readonly ok: true
  readonly value: { readonly albums: readonly LibraryAlbum[]; readonly totalCount: number }
} => ({ ok: true, value: { albums, totalCount: albums.length } }) as const

const httpError = (
  status: number,
  message: string,
): {
  readonly ok: false
  readonly error: {
    readonly type: 'SERVER_ERROR'
    readonly status: number
    readonly message: string
  }
} => ({ ok: false, error: { type: 'SERVER_ERROR', status, message } }) as const

// The combination the backend rejects — the reason the production users ended
// up in the error state in the first place.
const rejectedCombination = httpError(
  400,
  "Sort 'recently-added' cannot be combined with the decade filter '1990s'",
)

const lmsUnreachable = httpError(503, 'LMS not reachable')

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
  return (calls[calls.length - 1]?.[2] ?? {}) as Record<string, unknown>
}

const CONTROLS = [
  ['sort chips', '[data-testid="sort-chip-year-newest"]'],
  ['decade chips', '[data-testid="decade-chip-1990s"]'],
  ['genre chips', '[data-testid="genre-chip-153"]'],
  ['genre autocomplete', '[data-testid="genre-filter-input"]'],
  ['search field', '[data-testid="library-search-input"]'],
] as const

describe('LibraryView — escaping the error state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    mockGetLibraryGenres.mockResolvedValue({
      ok: true,
      value: [{ id: 153, name: 'Rock', albumCount: 81 }],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe.each([
    ['a rejected filter combination (400)', rejectedCombination],
    ['an unreachable LMS (503)', lmsUnreachable],
  ])('after %s', (_label, failure) => {
    it.each(CONTROLS)('keeps the %s usable', async (_control, selector) => {
      mockGetLibraryAlbums.mockResolvedValue(failure)

      const wrapper = await mountView()
      const control = wrapper.find<HTMLButtonElement | HTMLInputElement>(selector)

      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
      expect(control.exists()).toBe(true)
      expect(control.element.disabled).toBe(false)
    })

    it('replaces only the album list, not the controls', async () => {
      mockGetLibraryAlbums.mockResolvedValue(failure)

      const wrapper = await mountView()

      expect(wrapper.find('[data-testid="sort-controls"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="album-grid"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="album-list"]').exists()).toBe(false)
    })

    it('loads a working list again when a decade chip is clicked', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(failure)
      const wrapper = await mountView()
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(true)

      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')]))
      await wrapper.find('[data-testid="decade-chip-2000s"]').trigger('click')
      await flushPromises()

      expect(lastQuery()).toMatchObject({ decade: '2000s' })
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })

    it('loads a working list again when a sort chip is clicked', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(failure)
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValue(page([album('2', 'Amnesiac')]))
      await wrapper.find('[data-testid="sort-chip-title-az"]').trigger('click')
      await flushPromises()

      expect(lastQuery()).toMatchObject({ sort: 'title-az' })
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })

    it('still explains a sort the decade click had to give way to', async () => {
      mockGetLibraryAlbums.mockResolvedValue(failure)
      const wrapper = await mountView()

      await wrapper.find('[data-testid="sort-chip-recently-added"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="decade-chip-2000s"]').trigger('click')
      await flushPromises()

      // The chip moved on its own while the album list was a message — without
      // the notice next to the chips that correction happens unannounced.
      expect(wrapper.find('[data-testid="filter-adjusted-message"]').text()).toBe(
        'Sorted by artist — "Recently added" ignores decades',
      )
      expect(wrapper.find('[data-testid="sort-chip-artist-az"]').attributes('aria-pressed')).toBe(
        'true',
      )
    })

    it('loads a working list again when the genre chip is clicked', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(failure)
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValue(page([album('3', 'Bends')]))
      await wrapper.find('[data-testid="genre-chip-153"]').trigger('click')
      await flushPromises()

      expect(lastQuery()).toMatchObject({ genreId: 153 })
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })

    it('loads a working list again when a search term is typed', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(failure)
      const wrapper = await mountView()

      mockGetLibraryAlbums.mockResolvedValue(page([album('4', 'Zeppelin')]))
      vi.useFakeTimers()
      await wrapper.find('[data-testid="library-search-input"]').setValue('zep')
      await vi.advanceTimersByTimeAsync(300)
      vi.useRealTimers()
      await flushPromises()

      expect(lastQuery()).toMatchObject({ search: 'zep' })
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })
  })

  // The empty state can only appear with no filter active, so it traps nobody
  // the way the error state did — but it hid the same controls, which left the
  // sort unreachable in a library the user is about to fill by rescanning.
  describe('after an empty library', () => {
    it.each(CONTROLS)('keeps the %s usable', async (_control, selector) => {
      mockGetLibraryAlbums.mockResolvedValue(page([]))

      const wrapper = await mountView()
      const control = wrapper.find<HTMLButtonElement | HTMLInputElement>(selector)

      expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
      expect(control.exists()).toBe(true)
      expect(control.element.disabled).toBe(false)
    })

    it('loads a working list again when a sort chip is clicked', async () => {
      mockGetLibraryAlbums.mockResolvedValueOnce(page([]))
      const wrapper = await mountView()
      expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)

      mockGetLibraryAlbums.mockResolvedValue(page([album('1', 'Kid A')]))
      await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
      await flushPromises()

      expect(lastQuery()).toMatchObject({ sort: 'year-newest' })
      expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    })
  })
})
