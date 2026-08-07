/**
 * LibraryView — what the phone keeps above the album grid. The rescan button
 * is a maintenance action run once in a while, so on a phone it rides in the
 * app bar instead of holding a row of its own; its status line only exists
 * while a scan is running. Above phone width nothing about it changes.
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

import {
  getLibraryAlbums,
  getLibraryArtists,
  getLibraryGenres,
  triggerLibraryRescan,
} from '@/platform/api/libraryApi'
import { getTidalAlbums, getTidalFeaturedAlbums } from '@/platform/api/tidalAlbumsApi'

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
    value: { artists: [], hasMore: false },
  })
  vi.mocked(getLibraryGenres).mockResolvedValue({ ok: true, value: [] })
  vi.mocked(getTidalAlbums).mockResolvedValue({ ok: true, value: { albums: [], totalCount: 0 } })
  vi.mocked(getTidalFeaturedAlbums).mockResolvedValue({
    ok: true,
    value: { albums: [], totalCount: 0 },
  })
  // Never resolves, so the button stays in its scanning state for assertions.
  vi.mocked(triggerLibraryRescan).mockReturnValue(new Promise(() => {}))
})

describe('LibraryView — the rescan control on a phone', () => {
  it('puts the rescan button in the app bar instead of a row above the grid', async () => {
    const wrapper = await mountView()

    const button = wrapper.find('[data-testid="rescan-library-button"]')
    expect(button.exists()).toBe(true)
    expect(button.element.closest('[data-testid="page-header"]')).not.toBeNull()
    expect(button.text()).toBe('')
    expect(button.attributes('aria-label')).toBe('Refresh local library')
  })

  it('keeps the rescan row above the grid on wider viewports', async () => {
    isPhone.value = false

    const wrapper = await mountView()

    const button = wrapper.find('[data-testid="rescan-library-button"]')
    expect(button.exists()).toBe(true)
    expect(button.element.closest('[data-testid="page-header"]')).toBeNull()
    expect(button.text()).toBe('Refresh library')
  })

  it('starts a scan from the app bar', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="rescan-library-button"]').trigger('click')
    await flushPromises()

    expect(vi.mocked(triggerLibraryRescan)).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="rescan-library-button"]').attributes('aria-label')).toBe(
      'Scanning library…',
    )
  })

  it('spends no height on the status line until a scan is running', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="rescan-message"]').exists()).toBe(false)

    await wrapper.find('[data-testid="rescan-library-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="rescan-message"]').text()).toBe('Starting scan…')
  })

  it('hides the app-bar button on the Tidal tab, which has nothing to rescan', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="rescan-library-button"]').exists()).toBe(false)
  })
})
