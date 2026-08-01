/**
 * LibraryView — the filter chips are one visual row of equivalent controls, so
 * sort, decade and genre chips must share the same touch target and the same
 * visible focus ring. Split out of LibraryView.test.ts (38 KB).
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

const album: LibraryAlbum = {
  id: '1',
  title: 'Kid A',
  artist: 'Radiohead',
  releaseYear: 2000,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
}

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

// 44px minimum touch target (WCAG 2.5.5) plus the visible keyboard focus ring.
const REQUIRED_CHIP_CLASSES = [
  'min-h-11',
  'focus:outline-none',
  'focus:ring-2',
  'focus:ring-accent-500',
  'focus:ring-offset-2',
] as const

describe('LibraryView — filter chip sizing and focus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
    mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [album], totalCount: 1 } })
    mockGetLibraryGenres.mockResolvedValue({
      ok: true,
      value: [{ id: 153, name: 'Rock', albumCount: 81 }],
    })
  })

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
