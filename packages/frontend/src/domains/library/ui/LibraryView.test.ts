import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LibraryView from './LibraryView.vue'
import type { Router } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import { setupTestEnv, createTestRouter } from '@/test-utils'

vi.mock('@/platform/api/libraryApi', () => ({
  getLibraryAlbums: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  getVolume: vi.fn().mockResolvedValue({ ok: true, value: 50 }),
  getPlaybackStatus: vi.fn().mockResolvedValue({
    ok: true,
    value: { status: 'stopped', currentTime: 0, currentTrack: null },
  }),
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbums: vi.fn(),
  getTidalFeaturedAlbums: vi.fn(),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}))

const makeTidalAlbum = (
  id: string,
): {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly coverArtUrl: string
} => ({
  id,
  title: `Tidal Album ${id}`,
  artist: `Tidal Artist ${id}`,
  coverArtUrl: `https://resources.tidal.com/images/${id}/320x320.jpg`,
})

const makeTidalAlbums = (count: number): ReadonlyArray<ReturnType<typeof makeTidalAlbum>> =>
  Array.from({ length: count }, (_, i) => makeTidalAlbum(String(i + 1)))

const makeAlbum = (
  id: string,
  overrides?: {
    readonly genre?: string | null
    readonly title?: string
    readonly artist?: string
    readonly releaseYear?: number | null
  },
): {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: number | null
  readonly genre: string | null
  readonly coverArtUrl: string
} => ({
  id,
  title: overrides?.title ?? `Album ${id}`,
  artist: overrides?.artist ?? `Artist ${id}`,
  releaseYear: overrides?.releaseYear !== undefined ? overrides.releaseYear : 2020,
  genre: overrides?.genre ?? null,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const makeAlbums = (count: number): ReadonlyArray<ReturnType<typeof makeAlbum>> =>
  Array.from({ length: count }, (_, i) => makeAlbum(String(i + 1)))

type TestContext = {
  readonly router: Router
  readonly wrapper: VueWrapper
}

describe('LibraryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
  })

  const mountView = async (): Promise<TestContext> => {
    const router = await createTestRouter(
      [
        { path: '/library', name: 'library', component: LibraryView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/library',
    )

    const wrapper = mount(LibraryView, {
      global: { plugins: [router] },
    })

    return { router, wrapper }
  }

  // AC1: /library route renders view, loading state shown
  it('shows loading state initially', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockReturnValue(new Promise(() => {}))

    const context = await mountView()

    expect(context.wrapper.find('[data-testid="library-view"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  // AC2: 3-column grid renders, each card shows cover + title + artist
  it('renders album-grid with AlbumCard items after successful load', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(5), totalCount: 5 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="album-grid"]').exists()).toBe(true)
    expect(context.wrapper.findAll('[data-testid="album-card"]')).toHaveLength(5)
  })

  it('album-grid has 3-column grid layout classes', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()

    const grid = context.wrapper.find('[data-testid="album-grid"]')
    expect(grid.classes()).toContain('grid')
    expect(grid.classes()).toContain('grid-cols-2')
    expect(grid.classes()).toContain('lg:grid-cols-3')
    expect(grid.classes()).toContain('lg:gap-8')
  })

  // AC6: 300 albums returned → 250 shown, limit message visible
  it('shows display-limit-message when totalCount > 250', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(250), totalCount: 300 },
    })

    const context = await mountView()
    await flushPromises()

    const msg = context.wrapper.find('[data-testid="display-limit-message"]')
    expect(msg.exists()).toBe(true)
    expect(msg.text()).toContain('250')
    expect(msg.text()).toContain('300')
  })

  it('does NOT show display-limit-message when totalCount <= 250', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(5), totalCount: 5 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="display-limit-message"]').exists()).toBe(false)
  })

  // AC7: 0 albums → empty state message
  it('shows empty-state when 0 albums returned', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="empty-state"]').text()).toContain(
      'No albums found in your library',
    )
  })

  // AC8: API error → error state message
  it('shows error-state when API returns error', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="error-state"]').text()).toContain(
      'Unable to load library',
    )
  })

  // AC4: click:navigate handler → router.push to album-detail
  it('navigates to album-detail when AlbumCard emits click:navigate', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    const card = context.wrapper.find('[data-testid="album-card"]')
    await card.trigger('click')
    await flushPromises()

    expect(context.router.currentRoute.value.name).toBe('album-detail')
    expect(context.router.currentRoute.value.params['albumId']).toBe('1')
  })

  // AC5: click:play handler → playAlbum called
  it('calls playAlbum when AlbumCard emits click:play', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { playAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    const playBtn = context.wrapper.find('[data-testid="play-album-button"]')
    await playBtn.trigger('click')
    await flushPromises()

    expect(playAlbum).toHaveBeenCalledWith('1')
  })

  // AC3 (Story 9.4): click:add-to-queue handler → addAlbumToQueue called
  it('calls addAlbumToQueue when AlbumCard emits click:add-to-queue (grid view)', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { addAlbumToQueue } = await import('@/platform/api/queueApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    const addBtn = context.wrapper.find('[data-testid="add-album-to-queue-button"]')
    await addBtn.trigger('click')
    await flushPromises()

    expect(addAlbumToQueue).toHaveBeenCalledWith('1')
  })

  // AC3 (Story 9.4): click:add-to-queue from AlbumListRow → addAlbumToQueue called
  it('calls addAlbumToQueue when AlbumListRow emits click:add-to-queue (list view)', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { addAlbumToQueue } = await import('@/platform/api/queueApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    localStorage.setItem('library-view-mode', 'list')

    const context = await mountView()
    await flushPromises()

    const addBtn = context.wrapper.find('[data-testid="list-row-add-to-queue-button"]')
    await addBtn.trigger('click')
    await flushPromises()

    expect(addAlbumToQueue).toHaveBeenCalledWith('1')
  })

  // ── Story 7.2: Grid/List View Toggle ──────────────────────────────────────

  // AC1: toggle visible in success state, hidden otherwise
  it('shows view-toggle when albums loaded successfully', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="view-toggle"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="grid-view-button"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="list-view-button"]').exists()).toBe(true)
  })

  // AC8: toggle hidden during loading/error/empty states
  it('does NOT show view-toggle during loading state', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockReturnValue(new Promise(() => {}))

    const context = await mountView()

    expect(context.wrapper.find('[data-testid="view-toggle"]').exists()).toBe(false)
  })

  it('does NOT show view-toggle during error state', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="view-toggle"]').exists()).toBe(false)
  })

  it('does NOT show view-toggle during empty state', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="view-toggle"]').exists()).toBe(false)
  })

  // AC2: default view is grid (no localStorage key)
  it('shows album-grid by default (no localStorage key)', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="album-grid"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="album-list"]').exists()).toBe(false)
  })

  it('grid-view-button has active styling when in grid mode', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()

    const gridBtn = context.wrapper.find('[data-testid="grid-view-button"]')
    expect(gridBtn.classes()).toContain('bg-neutral-900')
  })

  // AC3: clicking list-view-button → shows album-list
  it('switches to list view when list-view-button clicked', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')

    expect(context.wrapper.find('[data-testid="album-list"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="album-grid"]').exists()).toBe(false)
    expect(context.wrapper.findAll('[data-testid="album-list-row"]')).toHaveLength(3)
  })

  it('list-view-button has active styling when in list mode', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')

    const listBtn = context.wrapper.find('[data-testid="list-view-button"]')
    expect(listBtn.classes()).toContain('bg-neutral-900')
  })

  // AC4: clicking grid-view-button → back to grid
  it('switches back to grid when grid-view-button clicked after list', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')
    await context.wrapper.find('[data-testid="grid-view-button"]').trigger('click')

    expect(context.wrapper.find('[data-testid="album-grid"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="album-list"]').exists()).toBe(false)
  })

  // AC5: localStorage persistence
  it('saves view mode to localStorage when toggled', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')

    expect(localStorage.getItem('library-view-mode')).toBe('list')
  })

  it('saves grid mode to localStorage when toggled back to grid', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')
    await context.wrapper.find('[data-testid="grid-view-button"]').trigger('click')

    expect(localStorage.getItem('library-view-mode')).toBe('grid')
  })

  it('uses stored list view from localStorage on mount', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(3), totalCount: 3 },
    })
    localStorage.setItem('library-view-mode', 'list')

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="album-list"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="album-grid"]').exists()).toBe(false)
  })

  // AC6 (list): click on row body → navigate to album-detail
  it('navigates to album-detail when AlbumListRow emits click:navigate in list mode', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')

    const row = context.wrapper.find('[data-testid="album-list-row"]')
    await row.trigger('click')
    await flushPromises()

    expect(context.router.currentRoute.value.name).toBe('album-detail')
    expect(context.router.currentRoute.value.params['albumId']).toBe('1')
  })

  // ── Story 7.3: Sort & Filter ──────────────────────────────────────────────

  // AC1: sort chips render with 4 options
  it('shows sort-select with 4 sort options when albums loaded', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [makeAlbum('1')], totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="sort-chip-artist-az"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="sort-chip-title-az"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="sort-chip-year-newest"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="sort-chip-recently-added"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="sort-chip-artist-az"]').text()).toBe('Artist A–Z')
    expect(context.wrapper.find('[data-testid="sort-chip-title-az"]').text()).toBe('Album A–Z')
    expect(context.wrapper.find('[data-testid="sort-chip-year-newest"]').text()).toBe('Newest')
    expect(context.wrapper.find('[data-testid="sort-chip-recently-added"]').text()).toBe(
      'Recently added',
    )
  })

  // AC2a: title-az sort reorders albums by title
  it('reorders albums by title when title-az selected', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [
          makeAlbum('1', { title: 'Zebra' }),
          makeAlbum('2', { title: 'Apple' }),
          makeAlbum('3', { title: 'Mango' }),
        ],
        totalCount: 3,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="sort-chip-title-az"]').trigger('click')

    const cards = context.wrapper.findAll('[data-testid="album-card"]')
    expect(cards[0]?.text()).toContain('Apple')
    expect(cards[1]?.text()).toContain('Mango')
    expect(cards[2]?.text()).toContain('Zebra')
  })

  // AC2b: year-newest sort — descending, nulls last
  it('reorders albums by year descending when year-newest selected, nulls last', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [
          makeAlbum('1', { title: 'C-2000', releaseYear: 2000 }),
          makeAlbum('2', { title: 'A-2020', releaseYear: 2020 }),
          makeAlbum('3', { title: 'B-null', releaseYear: null }),
        ],
        totalCount: 3,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')

    const cards = context.wrapper.findAll('[data-testid="album-card"]')
    expect(cards[0]?.text()).toContain('A-2020')
    expect(cards[1]?.text()).toContain('C-2000')
    expect(cards[2]?.text()).toContain('B-null')
  })

  // AC2c: recently-added keeps LMS fetch order
  it('keeps LMS fetch order when recently-added selected', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [
          makeAlbum('1', { title: 'Zebra' }),
          makeAlbum('2', { title: 'Apple' }),
          makeAlbum('3', { title: 'Mango' }),
        ],
        totalCount: 3,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="sort-chip-recently-added"]').trigger('click')

    const cards = context.wrapper.findAll('[data-testid="album-card"]')
    expect(cards[0]?.text()).toContain('Zebra')
    expect(cards[1]?.text()).toContain('Apple')
    expect(cards[2]?.text()).toContain('Mango')
  })

  // AC3: genre chips render with "All genres" + unique genres
  it('shows genre-filter-select with All Genres and unique genres sorted A-Z', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [
          makeAlbum('1', { genre: 'Rock' }),
          makeAlbum('2', { genre: 'Jazz' }),
          makeAlbum('3', { genre: 'Rock' }),
        ],
        totalCount: 3,
      },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="genre-chip-all"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="genre-chip-Jazz"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="genre-chip-Rock"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="genre-chip-all"]').text()).toContain('All genres')
  })

  // AC4: selecting a genre → only matching albums shown
  it('shows only albums matching selected genre', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [
          makeAlbum('1', { genre: 'Rock' }),
          makeAlbum('2', { genre: 'Jazz' }),
          makeAlbum('3', { genre: 'Rock' }),
        ],
        totalCount: 3,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="genre-chip-Rock"]').trigger('click')

    expect(context.wrapper.findAll('[data-testid="album-card"]')).toHaveLength(2)
  })

  // AC4b: selecting genre with 0 matches → no-filter-results shown
  it('shows no-filter-results when genre filter leaves 0 albums', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [makeAlbum('1', { genre: 'Rock' })], totalCount: 1 },
    })
    sessionStorage.setItem('library-genre-filter', 'Classical')

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="no-filter-results"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)
  })

  // AC5: clear-filter-button visible when genre active; click clears filter
  it('shows clear-filter-button when genre active and clicking resets to all albums', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [makeAlbum('1', { genre: 'Rock' }), makeAlbum('2', { genre: 'Jazz' })],
        totalCount: 2,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="genre-chip-Rock"]').trigger('click')

    const clearBtn = context.wrapper.find('[data-testid="clear-all-filters"]')
    expect(clearBtn.exists()).toBe(true)

    await clearBtn.trigger('click')

    expect(context.wrapper.find('[data-testid="clear-all-filters"]').exists()).toBe(false)
    expect(context.wrapper.findAll('[data-testid="album-card"]')).toHaveLength(2)
  })

  // AC5b: clear-filter-button absent when no genre filter active
  it('does NOT show clear-filter-button when no genre filter active', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [makeAlbum('1', { genre: 'Rock' })], totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="clear-all-filters"]').exists()).toBe(false)
  })

  // AC6a: sessionStorage updated when sort changes
  it('updates sessionStorage library-sort-by when sort changes', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [makeAlbum('1')], totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="sort-chip-title-az"]').trigger('click')

    expect(sessionStorage.getItem('library-sort-by')).toBe('title-az')
  })

  // AC6b: sessionStorage updated when genre selected
  it('updates sessionStorage library-genre-filter when genre selected', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [makeAlbum('1', { genre: 'Rock' })], totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="genre-chip-Rock"]').trigger('click')

    expect(sessionStorage.getItem('library-genre-filter')).toBe('Rock')
  })

  // AC6c: pre-set sessionStorage sort → sort active on mount
  it('uses stored sort from sessionStorage on mount', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [makeAlbum('1', { title: 'Zebra' }), makeAlbum('2', { title: 'Apple' })],
        totalCount: 2,
      },
    })
    sessionStorage.setItem('library-sort-by', 'title-az')

    const context = await mountView()
    await flushPromises()

    const cards = context.wrapper.findAll('[data-testid="album-card"]')
    expect(cards[0]?.text()).toContain('Apple')
    expect(cards[1]?.text()).toContain('Zebra')
  })

  // sort-controls hidden during non-success states
  it('does NOT show sort-controls during loading state', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockReturnValue(new Promise(() => {}))

    const context = await mountView()

    expect(context.wrapper.find('[data-testid="sort-controls"]').exists()).toBe(false)
  })

  it('does NOT show sort-controls during error state', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="sort-controls"]').exists()).toBe(false)
  })

  it('does NOT show sort-controls during empty state', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="sort-controls"]').exists()).toBe(false)
  })

  // AC6d: pre-set genre filter in sessionStorage → genre filter active on mount
  it('uses stored genre filter from sessionStorage on mount', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [makeAlbum('1', { genre: 'Rock' }), makeAlbum('2', { genre: 'Jazz' })],
        totalCount: 2,
      },
    })
    sessionStorage.setItem('library-genre-filter', 'Rock')

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.findAll('[data-testid="album-card"]')).toHaveLength(1)
    expect(context.wrapper.find('[data-testid="clear-all-filters"]').exists()).toBe(true)
  })

  // AC7 (list): click on play button in list row → playAlbum called, no navigation
  it('calls playAlbum when list-row-play-button clicked', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { playAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')

    const playBtn = context.wrapper.find('[data-testid="list-row-play-button"]')
    await playBtn.trigger('click')
    await flushPromises()

    expect(playAlbum).toHaveBeenCalledWith('1')
    expect(context.router.currentRoute.value.name).toBe('library')
    expect(context.router.currentRoute.value.name).not.toBe('album-detail')
  })

  // ── Story 8.1: Tidal Source Toggle ───────────────────────────────────────

  // AC1: source selector visible with Local and Tidal buttons
  it('shows source selector with Local and Tidal buttons', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="source-selector"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="source-local"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="source-tidal"]').exists()).toBe(true)
  })

  // AC1: default source is Local (aria-selected="true" on Local button)
  it('defaults to Local source with aria-selected on Local button', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="source-local"]').attributes('aria-selected')).toBe(
      'true',
    )
    expect(context.wrapper.find('[data-testid="source-tidal"]').attributes('aria-selected')).toBe(
      'false',
    )
  })

  // AC1: clicking Tidal loads Tidal albums
  it('switches to Tidal source and shows Tidal albums when Tidal button clicked', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeTidalAlbums(2), totalCount: 2 },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="source-tidal"]').attributes('aria-selected')).toBe(
      'true',
    )
    expect(context.wrapper.findAll('[data-testid="album-card"]')).toHaveLength(2)
    expect(context.wrapper.text()).toContain('Tidal Album 1')
  })

  // AC6: loading state shown while Tidal albums are being fetched
  it('shows loading state while Tidal albums are being fetched', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    vi.mocked(getTidalAlbums).mockReturnValue(new Promise(() => {}))

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')

    expect(context.wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  // AC5: Tidal error state shows specific message
  it('shows Tidal-specific error message when Tidal albums fail to load', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="error-state"]').text()).toContain(
      'Could not load Tidal albums',
    )
  })

  // AC4: grid/list toggle state persists across Local/Tidal source switch
  it('grid/list toggle mode persists when switching between Local and Tidal sources', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(2), totalCount: 2 },
    })
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeTidalAlbums(2), totalCount: 2 },
    })

    const context = await mountView()
    await flushPromises()

    // Switch to list view
    await context.wrapper.find('[data-testid="list-view-button"]').trigger('click')
    expect(context.wrapper.find('[data-testid="album-list"]').exists()).toBe(true)

    // Switch to Tidal
    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    // List mode should still be active
    expect(context.wrapper.find('[data-testid="album-list"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="album-grid"]').exists()).toBe(false)
  })

  // H1: Story 8.9 AC2 — when no Tidal favorites, show Featured Albums section (Neu bei Tidal)
  it('shows Featured Albums section when Tidal favorites list is empty', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums, getTidalFeaturedAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })
    vi.mocked(getTidalFeaturedAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [makeTidalAlbum('1.0.1.0'), makeTidalAlbum('1.0.1.1')],
        totalCount: 2,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="tidal-featured-section"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="featured-albums-section"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="featured-album-grid"]').exists()).toBe(true)
    expect(context.wrapper.findAll('[data-testid="featured-album-grid"] .group')).toHaveLength(2)
  })

  // H1c: clicking a featured album card navigates to album-detail with Tidal state
  it('navigates to album-detail with Tidal state when featured album card is clicked', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums, getTidalFeaturedAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })
    vi.mocked(getTidalFeaturedAlbums).mockResolvedValue({
      ok: true,
      value: {
        albums: [makeTidalAlbum('1.0.1.0')],
        totalCount: 1,
      },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    const featuredCard = context.wrapper.find(
      '[data-testid="featured-album-grid"] [data-testid="album-card"]',
    )
    expect(featuredCard.exists()).toBe(true)

    await featuredCard.trigger('click')
    await flushPromises()

    expect(context.router.currentRoute.value.name).toBe('album-detail')
    expect(context.router.currentRoute.value.params['albumId']).toBe('1.0.1.0')
  })

  // H1b: when no Tidal favorites AND featured albums fail → show fallback message
  it('shows fallback message when Tidal favorites AND featured albums fail to load', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums, getTidalFeaturedAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], totalCount: 0 },
    })
    vi.mocked(getTidalFeaturedAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })

    const context = await mountView()
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="tidal-empty-state"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="tidal-empty-state"]').text()).toContain(
      'No albums found in your Tidal library',
    )
  })

  // H2: Retry on Tidal error — switching away and back to Tidal re-fetches
  it('retries Tidal album fetch when switching back to Tidal after error', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })
    // First call fails
    vi.mocked(getTidalAlbums).mockResolvedValueOnce({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' },
    })
    // Second call succeeds
    vi.mocked(getTidalAlbums).mockResolvedValueOnce({
      ok: true,
      value: { albums: makeTidalAlbums(2), totalCount: 2 },
    })

    const context = await mountView()
    await flushPromises()

    // Switch to Tidal — first attempt fails
    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()
    expect(context.wrapper.find('[data-testid="error-state"]').exists()).toBe(true)

    // Switch to Local, then back to Tidal — should retry
    await context.wrapper.find('[data-testid="source-local"]').trigger('click')
    await flushPromises()

    await context.wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    // Second attempt succeeds — albums shown
    expect(context.wrapper.findAll('[data-testid="album-card"]')).toHaveLength(2)
    expect(getTidalAlbums).toHaveBeenCalledTimes(2)
  })

  // Story 9.3 AC3: MainNavBar integration — verifies nav renders inside LibraryView
  it('renders MainNavBar inside the library view (Story 9.3 AC3)', async () => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockReturnValue(new Promise(() => {}))

    const context = await mountView()

    expect(context.wrapper.find('[data-testid="main-nav"]').exists()).toBe(true)
  })
})
