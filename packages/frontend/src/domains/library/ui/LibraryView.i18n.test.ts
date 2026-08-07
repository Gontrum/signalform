/**
 * LibraryView — the two source tabs plus the accessible names of the
 * icon-only and group controls. "Local" is ordinary prose and must translate;
 * "Tidal" is a product name and must not.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after this view has been set up. Setting it before mounting would let a
 * label list built once during setup pass — which is the exact defect these
 * cases exist for.
 *
 * Own file because LibraryView.test.ts is already 38 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import LibraryView from './LibraryView.vue'
import type { VueWrapper } from '@vue/test-utils'
import type { LibraryAlbum } from '@/platform/api/libraryApi'
import type { Language } from '@/types/i18n'
import { useI18nStore } from '@/app/i18nStore'
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
  triggerLibraryRescan: vi.fn(),
  getRescanStatus: vi.fn(),
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

import {
  getLibraryAlbums,
  getLibraryArtists,
  getLibraryGenres,
  triggerLibraryRescan,
} from '@/platform/api/libraryApi'

const mountView = async (): Promise<VueWrapper> => {
  setupTestEnv()

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

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const tabLabels = (wrapper: VueWrapper): readonly string[] => [
  wrapper.find('[data-testid="source-local"]').text(),
  wrapper.find('[data-testid="source-tidal"]').text(),
]

describe('LibraryView — source tab labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    isPhone.value = false
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [], hasMore: false },
    })
    vi.mocked(getLibraryArtists).mockResolvedValue({
      ok: true,
      value: { artists: [], hasMore: false },
    })
    vi.mocked(getLibraryGenres).mockResolvedValue({ ok: true, value: [] })
  })

  it('labels both tabs in English', async () => {
    expect(tabLabels(await mountView())).toEqual(['Local', 'Tidal'])
  })

  it('translates only the local tab in German and leaves the product name alone', async () => {
    const wrapper = await mountView()

    await switchTo('de')

    expect(tabLabels(wrapper)).toEqual(['Lokal', 'Tidal'])
  })
})

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
}

const ariaLabelOf = (wrapper: VueWrapper, testId: string): string | undefined =>
  wrapper.find(`[data-testid="${testId}"]`).attributes('aria-label')

const chipLabels = (wrapper: VueWrapper, rowTestId: string): readonly string[] =>
  wrapper.findAll(`[data-testid="${rowTestId}"] button`).map((chip) => chip.text())

const controlLabels = (wrapper: VueWrapper): readonly (string | undefined)[] => [
  ariaLabelOf(wrapper, 'source-selector'),
  ariaLabelOf(wrapper, 'sort-chip-row'),
  ariaLabelOf(wrapper, 'decade-chip-row'),
  ariaLabelOf(wrapper, 'grid-view-button'),
  ariaLabelOf(wrapper, 'list-view-button'),
]

describe('LibraryView — accessible names of the browsing controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    isPhone.value = false
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [album], hasMore: false },
    })
    vi.mocked(getLibraryArtists).mockResolvedValue({
      ok: true,
      value: { artists: [], hasMore: false },
    })
    vi.mocked(getLibraryGenres).mockResolvedValue({ ok: true, value: [] })
  })

  it('names the tab list, both chip rows and both view toggles in English', async () => {
    expect(controlLabels(await mountView())).toEqual([
      'Music source',
      'Sort order',
      'Filter by decade',
      'Grid view',
      'List view',
    ])
  })

  it('names them in German', async () => {
    const wrapper = await mountView()

    await switchTo('de')

    expect(controlLabels(wrapper)).toEqual([
      'Musikquelle',
      'Sortierung',
      'Nach Dekade filtern',
      'Rasteransicht',
      'Listenansicht',
    ])
  })

  // The chip captions are the one label list not written in the template: the
  // composable builds them. Built once during setup they keep the language the
  // view was mounted in and never reach the one the server sent.
  it('relabels every sort chip once the language arrives', async () => {
    const wrapper = await mountView()
    expect(chipLabels(wrapper, 'sort-chip-row')).toEqual([
      'Artist A–Z',
      'Album A–Z',
      'Newest',
      'Recently added',
    ])

    await switchTo('de')

    expect(chipLabels(wrapper, 'sort-chip-row')).toEqual([
      'Künstler A–Z',
      'Album A–Z',
      'Neueste zuerst',
      'Kürzlich hinzugefügt',
    ])
  })

  it('relabels every decade chip once the language arrives', async () => {
    const wrapper = await mountView()
    expect(chipLabels(wrapper, 'decade-chip-row')).toEqual([
      'All years',
      '2020s',
      '2010s',
      '2000s',
      '90s',
      'Older',
    ])

    await switchTo('de')

    expect(chipLabels(wrapper, 'decade-chip-row')).toEqual([
      'Alle Jahre',
      '2020er',
      '2010er',
      '2000er',
      '90er',
      'Älter',
    ])
  })

  it('labels the idle rescan button in both languages', async () => {
    const wrapper = await mountView()
    expect(ariaLabelOf(wrapper, 'rescan-library-button')).toBe('Refresh local library')

    await switchTo('de')

    expect(ariaLabelOf(wrapper, 'rescan-library-button')).toBe('Lokale Bibliothek aktualisieren')
  })

  it('labels the running rescan button in both languages', async () => {
    // Never resolves, so the button stays in its scanning state for the assertion.
    vi.mocked(triggerLibraryRescan).mockReturnValue(new Promise(() => {}))

    const wrapper = await mountView()
    await wrapper.find('[data-testid="rescan-library-button"]').trigger('click')
    await flushPromises()
    expect(ariaLabelOf(wrapper, 'rescan-library-button')).toBe('Scanning library…')

    await switchTo('de')

    expect(ariaLabelOf(wrapper, 'rescan-library-button')).toBe('Bibliothek wird durchsucht…')
  })
})

const summaryOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="filter-summary-text"]').text()

// The phone summary line is the only place the filter state is spelled out in
// prose, so a hard-coded English word here is invisible to every other test.
describe('LibraryView — the phone filter summary in both languages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    isPhone.value = true
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: [album], hasMore: false },
    })
    vi.mocked(getLibraryArtists).mockResolvedValue({
      ok: true,
      value: { artists: [], hasMore: false },
    })
    vi.mocked(getLibraryGenres).mockResolvedValue({
      ok: true,
      value: [{ id: 153, name: 'Rock', albumCount: 81 }],
    })
  })

  it('names an unfiltered library in English', async () => {
    expect(summaryOf(await mountView())).toBe('Artist A–Z · All albums')
  })

  it('names an unfiltered library in German', async () => {
    const wrapper = await mountView()

    await switchTo('de')

    expect(summaryOf(wrapper)).toBe('Künstler A–Z · Alle Alben')
  })

  it('names sort, decade and genre in English', async () => {
    sessionStorage.setItem('library-sort-by', 'title-az')
    sessionStorage.setItem('library-decade-filter', '2010s')
    sessionStorage.setItem('library-genre-filter', '153')

    expect(summaryOf(await mountView())).toBe('Album A–Z · 2010s · Rock')
  })

  it('names sort, decade and genre in German', async () => {
    sessionStorage.setItem('library-sort-by', 'title-az')
    sessionStorage.setItem('library-decade-filter', '2010s')
    sessionStorage.setItem('library-genre-filter', '153')

    const wrapper = await mountView()

    await switchTo('de')

    // "2010s" is the decade label, not a number: it stays English if the chip
    // labels are read out of the core option list instead of the translator.
    expect(summaryOf(wrapper)).toBe('Album A–Z · 2010er · Rock')
  })

  it('translates the decade the summary would otherwise leave in English', async () => {
    sessionStorage.setItem('library-decade-filter', 'older')

    const wrapper = await mountView()
    expect(summaryOf(wrapper)).toBe('Artist A–Z · Older')

    await switchTo('de')

    expect(summaryOf(wrapper)).toBe('Künstler A–Z · Älter')
  })

  it('labels the sheet, its close button and its done button in both languages', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="filter-summary"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="bottom-sheet"] h2').text()).toBe('Sort & filter')
    expect(ariaLabelOf(wrapper, 'bottom-sheet-close')).toBe('Close sort and filter')
    expect(wrapper.find('[data-testid="filter-sheet-done"]').text()).toBe('Show albums')

    await switchTo('de')

    expect(wrapper.find('[data-testid="bottom-sheet"] h2').text()).toBe('Sortieren & filtern')
    expect(ariaLabelOf(wrapper, 'bottom-sheet-close')).toBe('Sortieren und filtern schließen')
    expect(wrapper.find('[data-testid="filter-sheet-done"]').text()).toBe('Alben anzeigen')
  })

  it('translates the decade chips inside the sheet, not just the summary', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="filter-summary"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="decade-chip-all"]').text()).toBe('All years')

    await switchTo('de')

    expect(wrapper.find('[data-testid="decade-chip-all"]').text()).toBe('Alle Jahre')
    expect(wrapper.find('[data-testid="decade-chip-older"]').text()).toBe('Älter')
  })

  it('translates the clear-all action in both languages', async () => {
    sessionStorage.setItem('library-decade-filter', '2010s')

    const wrapper = await mountView()
    expect(ariaLabelOf(wrapper, 'filter-summary-clear')).toBe('Clear all filters')
    await wrapper.find('[data-testid="filter-summary"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="clear-all-filters"]').text()).toBe('× Clear all filters')

    await switchTo('de')

    expect(ariaLabelOf(wrapper, 'filter-summary-clear')).toBe('Alle Filter zurücksetzen')
    expect(wrapper.find('[data-testid="clear-all-filters"]').text()).toBe(
      '× Alle Filter zurücksetzen',
    )
  })
})
