/**
 * LibraryView — on a phone the three chip rows and the genre field cost 244px
 * above the album grid, so there they collapse into one summary line that
 * opens a bottom sheet. Anywhere wider the chips stay exactly as they were.
 *
 * Own file because LibraryView.test.ts is already 38 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import LibraryView from './LibraryView.vue'
import LibraryFilterControls from './LibraryFilterControls.vue'
import type { VueWrapper } from '@vue/test-utils'
import type { LibraryAlbum } from '@/platform/api/libraryApi'
import { setupTestEnv, createTestRouter } from '@/test-utils'

const isPhone = ref(true)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(false),
  }),
}))

vi.mock('@/platform/api/libraryApi', () => ({
  getLibraryAlbums: vi.fn(),
  getLibraryArtists: vi.fn(),
  getLibraryGenres: vi.fn(),
  getRescanStatus: vi.fn(),
  triggerLibraryRescan: vi.fn(),
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

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
}

const CHIP_MARKUP = [
  'sort-controls',
  'sort-chip-row',
  'decade-chip-row',
  'genre-chips',
  'genre-filter-input',
] as const

const mountView = async (attachTo?: HTMLElement): Promise<VueWrapper> => {
  const router = await createTestRouter(
    [
      { path: '/library', name: 'library', component: LibraryView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      { path: '/artist', name: 'unified-artist', component: { template: '<div />' } },
    ],
    '/library',
  )

  const wrapper = mount(LibraryView, { attachTo, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const has = (wrapper: VueWrapper, testId: string): boolean =>
  wrapper.find(`[data-testid="${testId}"]`).exists()

// Mapped rather than looped so a failure names the row that went missing.
const chipMarkup = (wrapper: VueWrapper): readonly string[] =>
  CHIP_MARKUP.map((testId) => `${testId}: ${has(wrapper, testId)}`)

const chipMarkupAll = (present: boolean): readonly string[] =>
  CHIP_MARKUP.map((testId) => `${testId}: ${present}`)

const openSheet = async (wrapper: VueWrapper): Promise<void> => {
  await wrapper.find('[data-testid="filter-summary"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  setupTestEnv()
  isPhone.value = true
  mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [album], hasMore: false } })
  mockGetLibraryArtists.mockResolvedValue({ ok: true, value: { artists: [], hasMore: false } })
  mockGetLibraryGenres.mockResolvedValue({
    ok: true,
    value: [
      { id: 153, name: 'Rock', albumCount: 81 },
      { id: 42, name: 'Jazz', albumCount: 12 },
    ],
  })
})

describe('LibraryView — which filter control the viewport gets', () => {
  it('replaces the chip rows with a single summary line on a phone', async () => {
    const wrapper = await mountView()

    expect(has(wrapper, 'filter-summary')).toBe(true)
    expect(chipMarkup(wrapper)).toEqual(chipMarkupAll(false))
  })

  it('keeps the chip rows and shows no summary line above phone width', async () => {
    isPhone.value = false

    const wrapper = await mountView()

    expect(has(wrapper, 'filter-summary')).toBe(false)
    expect(chipMarkup(wrapper)).toEqual(chipMarkupAll(true))
  })

  // Both mount points read one bindings object, so the failure worth catching
  // is one of them losing a prop or a handler while the other keeps it.
  it('gives the chip row and the sheet the same controls and the same wiring', async () => {
    sessionStorage.setItem('library-decade-filter', '2010s')

    isPhone.value = false
    const desktop = await mountView()
    const desktopControls = desktop.findComponent(LibraryFilterControls)

    isPhone.value = true
    const phone = await mountView()
    await openSheet(phone)

    expect(phone.findComponent(LibraryFilterControls).props()).toEqual(desktopControls.props())
    expect(desktopControls.props('decadeFilter')).toBe('2010s')
    expect(desktopControls.props('hasActiveFilters')).toBe(true)
    expect(desktopControls.props('genreChips').map((genre) => genre.name)).toEqual(['Rock', 'Jazz'])

    // The handlers are the other half of that object, and each mount point
    // picks a different sort: a click that never arrived cannot then be
    // mistaken for the one the other mount point sent.
    await phone.find('[data-testid="sort-chip-year-newest"]').trigger('click')
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
      60,
      0,
      expect.objectContaining({ sort: 'year-newest' }),
    )

    isPhone.value = false
    await nextTick()
    await desktop.find('[data-testid="sort-chip-title-az"]').trigger('click')
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
      60,
      0,
      expect.objectContaining({ sort: 'title-az' }),
    )
  })

  it('drops the summary line in artist mode, where none of the three filters exists', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="browse-mode-artists"]').trigger('click')
    await flushPromises()

    expect(has(wrapper, 'filter-summary')).toBe(false)
    expect(has(wrapper, 'filter-sheet')).toBe(false)
  })
})

describe('LibraryView — the phone filter sheet', () => {
  it('keeps the chips out of the markup until the sheet is opened', async () => {
    const wrapper = await mountView()

    expect(has(wrapper, 'filter-sheet')).toBe(false)
    expect(wrapper.find('[data-testid="filter-summary"]').attributes('aria-expanded')).toBe('false')

    await openSheet(wrapper)

    expect(has(wrapper, 'filter-sheet')).toBe(true)
    expect(chipMarkup(wrapper)).toEqual(chipMarkupAll(true))
    expect(wrapper.find('[data-testid="filter-summary"]').attributes('aria-expanded')).toBe('true')
  })

  it('reloads the album list with the decade chosen inside the sheet', async () => {
    const wrapper = await mountView()
    await openSheet(wrapper)

    await wrapper.find('[data-testid="decade-chip-1990s"]').trigger('click')
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
      60,
      0,
      expect.objectContaining({ decade: '1990s' }),
    )
    expect(wrapper.find('[data-testid="filter-summary-text"]').text()).toBe('Artist A–Z · 90s')
  })

  it('reloads the album list with the genre chosen inside the sheet', async () => {
    const wrapper = await mountView()
    await openSheet(wrapper)

    await wrapper.find('[data-testid="genre-chip-42"]').trigger('click')
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
      60,
      0,
      expect.objectContaining({ genreId: 42 }),
    )
    expect(wrapper.find('[data-testid="filter-summary-text"]').text()).toBe('Artist A–Z · Jazz')
  })

  it('reloads the album list with the sort chosen inside the sheet', async () => {
    const wrapper = await mountView()
    await openSheet(wrapper)

    await wrapper.find('[data-testid="sort-chip-year-newest"]').trigger('click')
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(
      60,
      0,
      expect.objectContaining({ sort: 'year-newest' }),
    )
    expect(wrapper.find('[data-testid="filter-summary-text"]').text()).toBe('Newest · All albums')
  })

  it('closes on the done button and gives focus back to the summary line', async () => {
    const wrapper = await mountView(document.body)

    // Clicked, not focused first: on macOS/WebKit a click leaves <body>
    // focused, and the sheet must still know where to return the focus.
    await openSheet(wrapper)
    const panel = wrapper.find<HTMLElement>('[data-testid="bottom-sheet"]').element
    expect(document.activeElement).toBe(panel)

    await wrapper.find('[data-testid="filter-sheet-done"]').trigger('click')
    await flushPromises()

    expect(has(wrapper, 'filter-sheet')).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.find<HTMLElement>('[data-testid="filter-summary"]').element,
    )

    wrapper.unmount()
  })

  it('closes on Escape and gives focus back to the summary line', async () => {
    const wrapper = await mountView(document.body)
    await openSheet(wrapper)

    await wrapper.find('[data-testid="bottom-sheet"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(has(wrapper, 'filter-sheet')).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.find<HTMLElement>('[data-testid="filter-summary"]').element,
    )

    wrapper.unmount()
  })

  it('does not come back open once the summary line that opened it is gone', async () => {
    const wrapper = await mountView()
    await openSheet(wrapper)
    expect(has(wrapper, 'filter-sheet')).toBe(true)

    isPhone.value = false
    await nextTick()
    expect(has(wrapper, 'filter-sheet')).toBe(false)

    isPhone.value = true
    await nextTick()

    expect(has(wrapper, 'filter-sheet')).toBe(false)
    expect(wrapper.find('[data-testid="filter-summary"]').attributes('aria-expanded')).toBe('false')
  })

  it('closes on a click outside the sheet', async () => {
    const wrapper = await mountView()
    await openSheet(wrapper)

    await wrapper.find('[data-testid="bottom-sheet-backdrop"]').trigger('click')
    await nextTick()

    expect(has(wrapper, 'filter-sheet')).toBe(false)
  })
})

describe('LibraryView — the summary line names the active state', () => {
  it('says so when nothing is filtered', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="filter-summary-text"]').text()).toBe(
      'Artist A–Z · All albums',
    )
  })

  it('names sort, decade and genre together', async () => {
    sessionStorage.setItem('library-sort-by', 'title-az')
    sessionStorage.setItem('library-decade-filter', '2010s')
    sessionStorage.setItem('library-genre-filter', '153')

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="filter-summary-text"]').text()).toBe(
      'Album A–Z · 2010s · Rock',
    )
  })

  it('carries the whole summary into the accessible name of the trigger', async () => {
    sessionStorage.setItem('library-decade-filter', 'older')

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="filter-summary"]').attributes('aria-label')).toBe(
      'Sort and filter: Artist A–Z · Older',
    )
  })

  it('offers a way out of every filter at once and hides it again afterwards', async () => {
    sessionStorage.setItem('library-decade-filter', '2010s')
    sessionStorage.setItem('library-genre-filter', '153')

    const wrapper = await mountView()
    expect(has(wrapper, 'filter-summary-clear')).toBe(true)

    await wrapper.find('[data-testid="filter-summary-clear"]').trigger('click')
    await flushPromises()

    expect(mockGetLibraryAlbums).toHaveBeenLastCalledWith(60, 0, {
      sort: 'artist-az',
      decade: 'all',
      genreId: undefined,
      search: undefined,
    })
    expect(wrapper.find('[data-testid="filter-summary-text"]').text()).toBe(
      'Artist A–Z · All albums',
    )
    expect(has(wrapper, 'filter-summary-clear')).toBe(false)
  })

  it('shows no clear button while nothing is filtered', async () => {
    const wrapper = await mountView()

    expect(has(wrapper, 'filter-summary-clear')).toBe(false)
  })
})
