import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import LibraryView from './LibraryView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'

// Regression coverage for a11y Befund #8 (docs/review/04-a11y.md): the
// Library-Source tablist needs a roving tabindex + Arrow-key navigation per
// the ARIA APG "Tabs" pattern. Split into a sibling file per AGENTS.md
// (LibraryView.test.ts already exceeds the ~20 KB threshold) — mocks below
// duplicate the subset LibraryView.test.ts sets up, on purpose.

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

const makeAlbum = (
  id: string,
): {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: number | null
  readonly genre: string | null
  readonly coverArtUrl: string
} => ({
  id,
  title: `Album ${id}`,
  artist: `Artist ${id}`,
  releaseYear: 2020,
  genre: null,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const makeAlbums = (count: number): ReadonlyArray<ReturnType<typeof makeAlbum>> =>
  Array.from({ length: count }, (_, i) => makeAlbum(String(i + 1)))

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

describe('LibraryView keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setupTestEnv()
    isPhone.value = false
  })

  const mountView = async (): Promise<ReturnType<typeof mount>> => {
    const { getLibraryAlbums } = await import('@/platform/api/libraryApi')
    vi.mocked(getLibraryAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeAlbums(1), totalCount: 1 },
    })

    const router = await createTestRouter(
      [
        { path: '/library', name: 'library', component: LibraryView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/library',
    )

    const wrapper = mount(LibraryView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    await flushPromises()

    return wrapper
  }

  it('gives the active tab (Local, by default) tabindex 0 and the inactive tab tabindex -1', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="source-local"]').attributes('tabindex')).toBe('0')
    expect(wrapper.find('[data-testid="source-tidal"]').attributes('tabindex')).toBe('-1')

    wrapper.unmount()
  })

  it('ArrowRight on source-local moves focus to source-tidal and activates it', async () => {
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeTidalAlbums(1), totalCount: 1 },
    })

    const wrapper = await mountView()

    const local = wrapper.find('[data-testid="source-local"]')
    const tidal = wrapper.find('[data-testid="source-tidal"]')
    expect(local.element).toBeInstanceOf(HTMLButtonElement)
    if (!(local.element instanceof HTMLButtonElement)) {
      wrapper.unmount()
      return
    }

    local.element.focus()
    await local.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()

    expect(document.activeElement).toBe(tidal.element)
    expect(tidal.attributes('aria-selected')).toBe('true')

    wrapper.unmount()
  })

  it('gives source-local tabindex -1 once source-tidal becomes active', async () => {
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeTidalAlbums(1), totalCount: 1 },
    })

    const wrapper = await mountView()

    await wrapper.find('[data-testid="source-tidal"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="source-local"]').attributes('tabindex')).toBe('-1')
    expect(wrapper.find('[data-testid="source-tidal"]').attributes('tabindex')).toBe('0')

    wrapper.unmount()
  })

  it('ArrowLeft on source-local wraps focus around to source-tidal', async () => {
    const { getTidalAlbums } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbums).mockResolvedValue({
      ok: true,
      value: { albums: makeTidalAlbums(1), totalCount: 1 },
    })

    const wrapper = await mountView()

    const local = wrapper.find('[data-testid="source-local"]')
    const tidal = wrapper.find('[data-testid="source-tidal"]')
    expect(local.element).toBeInstanceOf(HTMLButtonElement)
    if (!(local.element instanceof HTMLButtonElement)) {
      wrapper.unmount()
      return
    }

    local.element.focus()
    await local.trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()

    expect(document.activeElement).toBe(tidal.element)
    expect(tidal.attributes('aria-selected')).toBe('true')

    wrapper.unmount()
  })
})
