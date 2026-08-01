/**
 * LibraryView — the Albums/Artists switch and the artist list it reveals.
 *
 * Split out of LibraryView.test.ts (38 KB) so a session touching the artist
 * browser does not have to load the whole view suite.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import LibraryView from './LibraryView.vue'
import type { VueWrapper } from '@vue/test-utils'
import type { LibraryAlbum, LibraryArtist, LibraryArtistsResponse } from '@/platform/api/libraryApi'
import type { LibraryApiError } from '@/platform/api/libraryApi'
import type { Result } from '@signalform/shared'
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
import { getTidalAlbums, getTidalFeaturedAlbums } from '@/platform/api/tidalAlbumsApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryArtists = vi.mocked(getLibraryArtists)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)
const mockGetTidalAlbums = vi.mocked(getTidalAlbums)
const mockGetTidalFeaturedAlbums = vi.mocked(getTidalFeaturedAlbums)

type ArtistsResult = Result<LibraryArtistsResponse, LibraryApiError>

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
}

const artist = (id: string, name: string): LibraryArtist => ({ id, name })

const artistPage = (artists: readonly LibraryArtist[], hasMore: boolean): ArtistsResult => ({
  ok: true,
  value: { artists, hasMore },
})

// LMS answers alphabetically; the fixture deliberately does not, so a hidden
// client-side re-sort would show up in the rendered names.
const FIRST_PAGE = [
  artist('17', 'Tocotronic'),
  artist('3', 'ABBA'),
  artist('9', 'Kraftwerk'),
] as const

const SECOND_PAGE = [artist('4', 'Blumfeld'), artist('11', 'Neu!')] as const

const mountView = async (): Promise<{
  readonly wrapper: VueWrapper
  readonly push: ReturnType<typeof vi.spyOn>
}> => {
  const router = await createTestRouter(
    [
      { path: '/library', name: 'library', component: LibraryView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
    ],
    '/library',
  )

  const push = vi.spyOn(router, 'push')
  const wrapper = mount(LibraryView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, push }
}

const switchToArtists = async (wrapper: VueWrapper): Promise<void> => {
  await wrapper.find('[data-testid="browse-mode-artists"]').trigger('click')
  await flushPromises()
}

const renderedArtistNames = (wrapper: VueWrapper): readonly string[] =>
  wrapper.findAll('[data-testid="artist-row"]').map((row) => row.text())

describe('LibraryView — artist mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [album], hasMore: false } })
    mockGetLibraryArtists.mockResolvedValue(artistPage(FIRST_PAGE, false))
    mockGetLibraryGenres.mockResolvedValue({
      ok: true,
      value: [{ id: 153, name: 'Rock', albumCount: 81 }],
    })
    mockGetTidalAlbums.mockResolvedValue({ ok: true, value: { albums: [], totalCount: 0 } })
    mockGetTidalFeaturedAlbums.mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })
  })

  it('starts on the album list with the toggle set to Albums', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="album-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="artist-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="browse-mode-albums"]').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  it('swaps the album grid for the artist list when the switch is used', async () => {
    const { wrapper } = await mountView()

    await switchToArtists(wrapper)

    expect(wrapper.find('[data-testid="artist-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="album-grid"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="browse-mode-artists"]').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  it('brings the album grid back when the switch is used again', async () => {
    const { wrapper } = await mountView()

    await switchToArtists(wrapper)
    await wrapper.find('[data-testid="browse-mode-albums"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="album-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="artist-list"]').exists()).toBe(false)
  })

  it('renders the artists in the order the server delivered them', async () => {
    const { wrapper } = await mountView()

    await switchToArtists(wrapper)

    expect(renderedArtistNames(wrapper)).toEqual(['Tocotronic', 'ABBA', 'Kraftwerk'])
  })

  it('appends a further page below the first, still in server order', async () => {
    mockGetLibraryArtists.mockResolvedValueOnce(artistPage(FIRST_PAGE, true))
    const { wrapper } = await mountView()
    await switchToArtists(wrapper)

    mockGetLibraryArtists.mockResolvedValueOnce(artistPage(SECOND_PAGE, false))
    await wrapper.find('[data-testid="load-more-button"]').trigger('click')
    await flushPromises()

    expect(renderedArtistNames(wrapper)).toEqual([
      'Tocotronic',
      'ABBA',
      'Kraftwerk',
      'Blumfeld',
      'Neu!',
    ])
    expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(false)
  })

  it('navigates to the artist that was clicked, by name', async () => {
    const { wrapper, push } = await mountView()
    await switchToArtists(wrapper)

    const rows = wrapper.findAll('[data-testid="artist-row"]')
    await rows[2]?.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'unified-artist', query: { name: 'Kraftwerk' } })
  })

  it('sends the name of the first row, not of the alphabetically first artist', async () => {
    const { wrapper, push } = await mountView()
    await switchToArtists(wrapper)

    await wrapper.find('[data-testid="artist-row"]').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'unified-artist', query: { name: 'Tocotronic' } })
  })

  it('takes the sort, decade and genre chips out of the markup', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="sort-controls"]').exists()).toBe(true)

    await switchToArtists(wrapper)

    expect(wrapper.find('[data-testid="sort-controls"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sort-chip-artist-az"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="decade-chip-1990s"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="genre-chip-153"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="genre-filter-input"]').exists()).toBe(false)
  })

  it('keeps the search field, which now drives the artist query', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountView()
    await switchToArtists(wrapper)
    mockGetLibraryArtists.mockClear()

    const input = wrapper.find('[data-testid="library-search-input"]')
    expect(input.exists()).toBe(true)

    await input.setValue('kraftwerk')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockGetLibraryArtists).toHaveBeenCalledTimes(1)
    expect(mockGetLibraryArtists.mock.calls[0]?.[2]).toEqual({ search: 'kraftwerk' })
    vi.useRealTimers()
  })

  it('shows the empty message when no artist matches', async () => {
    const { wrapper } = await mountView()

    mockGetLibraryArtists.mockResolvedValueOnce(artistPage([], false))
    await switchToArtists(wrapper)

    expect(wrapper.find('[data-testid="artists-empty-state"]').text()).toContain('No artists found')
    expect(wrapper.find('[data-testid="artist-list"]').exists()).toBe(false)
  })

  it('reports an unreachable server instead of an empty artist list', async () => {
    const { wrapper } = await mountView()

    mockGetLibraryArtists.mockResolvedValueOnce({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })
    await switchToArtists(wrapper)

    expect(wrapper.find('[data-testid="error-state"]').text()).toContain('Unable to load artists')
    expect(wrapper.find('[data-testid="artists-empty-state"]').exists()).toBe(false)
  })

  it('hides the browse switch on the Tidal tab', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="browse-mode-toggle"]').exists()).toBe(true)

    await wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="browse-mode-toggle"]').exists()).toBe(false)
  })

  // 44px minimum touch target (WCAG 2.5.5) plus the visible keyboard focus ring.
  const REQUIRED_CLASSES = [
    'min-h-11',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-accent-500',
    'focus:ring-offset-2',
  ] as const

  it.each([
    ['browse switch', '[data-testid="browse-mode-artists"]'],
    ['artist row', '[data-testid="artist-row"]'],
  ])('gives the %s a 44px target and a visible focus ring', async (_label, selector) => {
    const { wrapper } = await mountView()
    await switchToArtists(wrapper)

    expect(wrapper.find(selector).classes()).toEqual(expect.arrayContaining([...REQUIRED_CLASSES]))
  })

  it('renders no image inside an artist row', async () => {
    const { wrapper } = await mountView()
    await switchToArtists(wrapper)

    const list = wrapper.find('[data-testid="artist-list"]')

    expect(list.findAll('img')).toHaveLength(0)
    expect(list.findAll('svg')).toHaveLength(0)
  })
})
