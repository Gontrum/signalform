/**
 * LibraryView — the single row that carries the source tabs, the
 * Albums/Artists switch and the grid/list toggle. Three separate rows put the
 * second row of album covers below the fold as soon as the mini-player claims
 * its 61px, so the three share one line; none of them may be lost in the move,
 * and the tablist keeps its ARIA roles and roving tabindex.
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
import { getTidalAlbums, getTidalFeaturedAlbums } from '@/platform/api/tidalAlbumsApi'

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
}

const ROW = '[data-testid="library-controls-row"]'

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

const rowOf = (wrapper: VueWrapper, testId: string): Element | null =>
  wrapper.find(`[data-testid="${testId}"]`).element.closest(ROW)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  setupTestEnv()
  isPhone.value = true
  vi.mocked(getLibraryAlbums).mockResolvedValue({
    ok: true,
    value: { albums: [album], hasMore: false },
  })
  vi.mocked(getLibraryArtists).mockResolvedValue({
    ok: true,
    value: { artists: [{ id: 'a1', name: 'Radiohead' }], hasMore: false },
  })
  vi.mocked(getLibraryGenres).mockResolvedValue({ ok: true, value: [] })
  vi.mocked(getTidalAlbums).mockResolvedValue({
    ok: true,
    value: {
      albums: [
        {
          id: '1.0.1.0',
          title: 'Tidal Album',
          artist: 'Tidal Artist',
          coverArtUrl: 'https://resources.tidal.com/images/1/320x320.jpg',
        },
      ],
      totalCount: 1,
    },
  })
  vi.mocked(getTidalFeaturedAlbums).mockResolvedValue({
    ok: true,
    value: { albums: [], totalCount: 0 },
  })
})

describe('LibraryView — the merged controls row', () => {
  it('puts the source tabs, the browse switch and the view toggle in one row', async () => {
    const wrapper = await mountView()

    const row = wrapper.find(ROW).element

    expect(rowOf(wrapper, 'source-selector')).toBe(row)
    expect(rowOf(wrapper, 'browse-mode-toggle')).toBe(row)
    expect(rowOf(wrapper, 'view-toggle')).toBe(row)
  })

  it('keeps both view-mode buttons — the toggle shrinks, it does not lose a mode', async () => {
    const wrapper = await mountView()

    const row = wrapper.find(ROW)
    expect(row.find('[data-testid="grid-view-button"]').exists()).toBe(true)
    expect(row.find('[data-testid="list-view-button"]').exists()).toBe(true)
  })

  it('still switches the album list to list view from inside the row', async () => {
    const wrapper = await mountView()

    await wrapper.find(`${ROW} [data-testid="list-view-button"]`).trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="album-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="album-grid"]').exists()).toBe(false)
  })

  // The move must not cost the tablist its ARIA APG semantics — arrow-key
  // navigation is covered in LibraryView.keyboard.test.ts, this is the markup
  // that navigation depends on.
  it('keeps the tablist roles, aria-selected and roving tabindex inside the row', async () => {
    const wrapper = await mountView()

    const tablist = wrapper.find(`${ROW} [data-testid="source-selector"]`)
    expect(tablist.attributes('role')).toBe('tablist')

    const local = wrapper.find('[data-testid="source-local"]')
    const tidal = wrapper.find('[data-testid="source-tidal"]')

    expect(local.attributes('role')).toBe('tab')
    expect(tidal.attributes('role')).toBe('tab')
    expect(local.attributes('aria-selected')).toBe('true')
    expect(tidal.attributes('aria-selected')).toBe('false')
    expect(local.attributes('tabindex')).toBe('0')
    expect(tidal.attributes('tabindex')).toBe('-1')
    expect(local.attributes('data-source')).toBe('local')
    expect(tidal.attributes('data-source')).toBe('tidal')
  })

  // 44px minimum touch target (WCAG 2.5.5) plus a visible keyboard focus ring:
  // the source tabs were 33px tall and ringless while they had a row to
  // themselves, and the shared row is 44px tall anyway.
  const FOCUS_RING_CLASSES = [
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-accent-500',
    'focus:ring-offset-2',
  ] as const

  it.each([
    ['source tab', 'source-local', 'min-h-11'],
    ['source tab', 'source-tidal', 'min-h-11'],
    ['browse switch', 'browse-mode-albums', 'min-h-11'],
    ['browse switch', 'browse-mode-artists', 'min-h-11'],
    ['grid button', 'grid-view-button', 'h-11'],
    ['list button', 'list-view-button', 'h-11'],
  ])(
    'gives the %s (%s) a 44px target and a visible focus ring',
    async (_l, testId, heightClass) => {
      const wrapper = await mountView()

      expect(wrapper.find(`[data-testid="${testId}"]`).classes()).toEqual(
        expect.arrayContaining([heightClass, ...FOCUS_RING_CLASSES]),
      )
    },
  )

  it('drops only the view toggle from the row in artist mode', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="browse-mode-artists"]').trigger('click')
    await flushPromises()

    const row = wrapper.find(ROW).element
    expect(rowOf(wrapper, 'source-selector')).toBe(row)
    expect(rowOf(wrapper, 'browse-mode-toggle')).toBe(row)
    expect(wrapper.find('[data-testid="view-toggle"]').exists()).toBe(false)
  })

  it('drops only the browse switch from the row on the Tidal tab', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    const row = wrapper.find(ROW).element
    expect(rowOf(wrapper, 'source-selector')).toBe(row)
    expect(rowOf(wrapper, 'view-toggle')).toBe(row)
    expect(wrapper.find('[data-testid="browse-mode-toggle"]').exists()).toBe(false)
  })

  it('keeps the same row on a desktop viewport instead of a second layout', async () => {
    isPhone.value = false

    const wrapper = await mountView()

    const row = wrapper.find(ROW).element
    expect(rowOf(wrapper, 'source-selector')).toBe(row)
    expect(rowOf(wrapper, 'browse-mode-toggle')).toBe(row)
    expect(rowOf(wrapper, 'view-toggle')).toBe(row)
  })
})
