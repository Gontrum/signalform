/**
 * LibraryView — the filter chips are one visual row of equivalent controls, so
 * sort, decade and genre chips must share the same touch target and the same
 * visible focus ring. Split out of LibraryView.test.ts (38 KB).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
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

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
}

const mountView = async (attachTo?: HTMLElement): Promise<VueWrapper> => {
  const router = await createTestRouter(
    [
      { path: '/library', name: 'library', component: LibraryView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    '/library',
  )

  const wrapper = mount(LibraryView, { attachTo, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const setupChipEnv = (): void => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  setupTestEnv()
  isPhone.value = false
  mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [album], hasMore: false } })
  mockGetLibraryGenres.mockResolvedValue({
    ok: true,
    value: [{ id: 153, name: 'Rock', albumCount: 81 }],
  })
}

// 44px minimum touch target (WCAG 2.5.5) plus the visible keyboard focus ring.
const REQUIRED_CHIP_CLASSES = [
  'min-h-11',
  'focus:outline-none',
  'focus:ring-2',
  'focus:ring-accent-500',
  'focus:ring-offset-2',
] as const

describe('LibraryView — filter chip sizing and focus', () => {
  beforeEach(setupChipEnv)

  it.each([
    ['sort', '[data-testid="sort-chip-artist-az"]'],
    ['decade', '[data-testid="decade-chip-1990s"]'],
    ['genre', '[data-testid="genre-chip-153"]'],
  ])('gives the %s chip a 44px target and a visible focus ring', async (_label, selector) => {
    const wrapper = await mountView()

    const classes = wrapper.find(selector).classes()

    expect(classes).toEqual(expect.arrayContaining([...REQUIRED_CHIP_CLASSES]))
    expect(classes).not.toContain('min-h-9')
  })

  it('keeps the active chip styling independent of the shared base classes', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="decade-chip-1990s"]').trigger('click')
    await flushPromises()

    const active = wrapper.find('[data-testid="decade-chip-1990s"]').classes()
    const inactive = wrapper.find('[data-testid="decade-chip-2000s"]').classes()

    expect(active).toContain('bg-neutral-900')
    expect(inactive).toContain('bg-white')
    expect(active).toContain('min-h-11')
    expect(inactive).toContain('min-h-11')
  })
})

const CHIP_ROWS = [
  ['sort', 'sort-chip-row', 'sort-chip-artist-az'],
  ['decade', 'decade-chip-row', 'decade-chip-all'],
  ['genre', 'genre-chips', 'genre-chip-153'],
] as const

// Below sm each row is one scrollable line; from sm up it is the wrapping row it
// has always been. `flex-wrap` without the sm: prefix is what put seven rows of
// genre chips above the album grid on a phone — assert its absence, not just the
// presence of the scroll classes.
const NARROW_SCROLL_CLASSES = ['flex', 'overflow-x-auto', '-mx-4', 'px-4', 'py-1'] as const
const WIDE_WRAP_CLASSES = [
  'sm:flex-wrap',
  'sm:overflow-x-visible',
  'sm:mx-0',
  'sm:px-0',
  'sm:py-0',
] as const

describe('LibraryView — chip rows scroll on narrow viewports', () => {
  beforeEach(setupChipEnv)

  it.each(CHIP_ROWS)(
    'makes the %s row a single scrollable line below sm and restores wrapping from sm up',
    async (_label, rowTestId) => {
      const wrapper = await mountView()

      const classes = wrapper.find(`[data-testid="${rowTestId}"]`).classes()

      expect(classes).toEqual(expect.arrayContaining([...NARROW_SCROLL_CLASSES]))
      expect(classes).toEqual(expect.arrayContaining([...WIDE_WRAP_CLASSES]))
      expect(classes).not.toContain('flex-wrap')
    },
  )

  it.each(CHIP_ROWS)(
    'stops the %s chips from being squeezed into the single line',
    async (_label, _rowTestId, chipTestId) => {
      const wrapper = await mountView()

      const classes = wrapper.find(`[data-testid="${chipTestId}"]`).classes()

      expect(classes).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']))
    },
  )

  it.each(CHIP_ROWS)(
    'keeps the %s chips in the tab order inside the scroller',
    async (_label, _rowTestId, chipTestId) => {
      const wrapper = await mountView(document.body)

      const chip = wrapper.find<HTMLButtonElement>(`[data-testid="${chipTestId}"]`).element
      expect(chip.getAttribute('tabindex')).toBeNull()
      expect(chip.disabled).toBe(false)

      chip.focus()
      expect(document.activeElement).toBe(chip)

      wrapper.unmount()
    },
  )
})

// happy-dom has no layout engine, so every rect is zero and the reveal below
// could never observe a chip sitting outside its row. Pin geometry per testid.
type HorizontalRect = readonly [left: number, right: number]

const makeRect = ([left, right]: HorizontalRect): DOMRect => ({
  left,
  right,
  top: 0,
  bottom: 0,
  width: right - left,
  height: 0,
  x: left,
  y: 0,
  toJSON: (): Record<string, never> => ({}),
})

const stubHorizontalGeometry = (rects: Readonly<Record<string, HorizontalRect>>): void => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ): DOMRect {
    // eslint-disable-next-line functional/no-this-expressions -- a prototype spy only learns which element it was called on from the receiver
    return makeRect(rects[this.getAttribute('data-testid') ?? ''] ?? [0, 0])
  })
}

describe('LibraryView — the active chip is revealed when a row mounts', () => {
  beforeEach(setupChipEnv)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('scrolls a row far enough right to clear the active chip plus a gutter', async () => {
    sessionStorage.setItem('library-decade-filter', 'older')
    stubHorizontalGeometry({
      'decade-chip-row': [0, 390],
      'decade-chip-older': [500, 580],
    })

    const wrapper = await mountView()

    // 580 (chip right) − 390 (row right) + 16px gutter.
    expect(wrapper.find('[data-testid="decade-chip-row"]').element.scrollLeft).toBe(206)
  })

  it('leaves a row untouched when its active chip already fits', async () => {
    stubHorizontalGeometry({
      'decade-chip-row': [0, 390],
      'decade-chip-all': [0, 90],
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="decade-chip-row"]').element.scrollLeft).toBe(0)
  })

  it('reveals each row independently of the others', async () => {
    sessionStorage.setItem('library-sort-by', 'recently-added')
    stubHorizontalGeometry({
      'sort-chip-row': [0, 390],
      'sort-chip-recently-added': [420, 560],
      'decade-chip-row': [0, 390],
      'decade-chip-all': [0, 90],
    })

    const wrapper = await mountView()

    // 560 − 390 + 16; the decade row's active chip fits, so it must stay put.
    expect(wrapper.find('[data-testid="sort-chip-row"]').element.scrollLeft).toBe(186)
    expect(wrapper.find('[data-testid="decade-chip-row"]').element.scrollLeft).toBe(0)
  })
})
