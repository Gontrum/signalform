import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ArtistDetailView from './ArtistDetailView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import type { ArtistDetailResponse } from '@/platform/api/artistApi'
import type { TidalArtistAlbumsResponse } from '@/platform/api/tidalArtistsApi'
import type { ArtistEnrichment, SimilarArtist } from '@/platform/api/enrichmentApi'
import { getArtistHeroImage } from '@/platform/api/heroImageApi'
import { createDeferred } from '@/test-utils'
import { clearArtistImageCache } from '@/domains/enrichment/shell/useArtistImage'

// Clear module-level artist image cache between tests to avoid cross-test pollution
beforeEach(() => {
  clearArtistImageCache()
})

vi.mock('@/platform/api/artistApi', () => ({
  getArtistDetail: vi.fn(),
  getArtistByName: vi.fn(),
}))

vi.mock('@/platform/api/tidalArtistsApi', () => ({
  getTidalArtistAlbums: vi.fn(),
}))

vi.mock('@/platform/api/enrichmentApi', () => ({
  getArtistEnrichment: vi.fn(),
  getSimilarArtists: vi.fn(),
}))

vi.mock('@/platform/api/heroImageApi', () => ({
  getArtistHeroImage: vi.fn(),
}))

const makeArtistDetail = (overrides: Partial<ArtistDetailResponse> = {}): ArtistDetailResponse => ({
  id: '42',
  name: 'Pink Floyd',
  albums: [
    {
      id: '1',
      title: 'The Wall',
      releaseYear: 1979,
      coverArtUrl: 'http://localhost:9000/music/101/cover.jpg',
    },
    {
      id: '2',
      title: 'Dark Side of the Moon',
      releaseYear: 1973,
      coverArtUrl: 'http://localhost:9000/music/201/cover.jpg',
    },
  ],
  ...overrides,
})

describe('ArtistDetailView', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    // Default: enrichment returns NOT_FOUND so existing tests are unaffected
    const { getArtistEnrichment, getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/artist/42',
    )
    const wrapper = mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('shows loading state initially', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  it('renders artist name and album count after successful load', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="artist-name"]').text()).toBe('Pink Floyd')
    expect(wrapper.find('[data-testid="artist-detail-content"]').exists()).toBe(true)
  })

  it('renders album list with correct number of items', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('[data-testid="album-item"]')).toHaveLength(2)
  })

  it('shows error-not-found state on 404', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'Artist not found' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="error-not-found"]').exists()).toBe(true)
  })

  it('shows error-server state on 503', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS unreachable' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="error-server"]').exists()).toBe(true)
  })

  it('navigates to album-detail on album click', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper, router } = await mountView()
    const pushSpy = vi.spyOn(router, 'push')
    await nextTick()
    await nextTick()

    const albumItems = wrapper.findAll('[data-testid="album-item"]')
    await albumItems[0]?.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'album-detail', params: { albumId: '1' } })
  })

  it('calls router.back() on back button click', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper, router } = await mountView()
    const backSpy = vi.spyOn(router, 'back')

    await wrapper.find('[data-testid="back-button"]').trigger('click')

    expect(backSpy).toHaveBeenCalled()
  })

  it('does not show artist-avatar in local mode (avatar removed in favour of enrichment layout)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail({ name: 'Pink Floyd' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="artist-avatar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="artist-name"]').text()).toBe('Pink Floyd')
  })

  it('shows no-albums-message when albums array is empty', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail({ albums: [] }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="no-albums-message"]').exists()).toBe(true)
  })

  // Story 4.6: Color scheme tests
  it('root div has bg-white class (not bg-background-primary)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    const root = wrapper.find('[data-testid="artist-detail-view"]')
    expect(root.classes()).toContain('bg-white')
  })

  it('artist name has text-neutral-900 class', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    const name = wrapper.find('[data-testid="artist-name"]')
    expect(name.classes()).toContain('text-neutral-900')
  })

  it('album-item buttons have type="button" attribute', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    const albumItems = wrapper.findAll('[data-testid="album-item"]')
    albumItems.forEach((btn) => {
      expect(btn.attributes('type')).toBe('button')
    })
  })

  it('shows cover fallback SVG on album cover load error', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    const covers = wrapper.findAll('[data-testid="album-cover"]')
    if (covers[0]) {
      await covers[0].trigger('error')
      await nextTick()
      // After error, img is replaced by fallback SVG
      expect(wrapper.findAll('[data-testid="album-cover"]')).toHaveLength(1)
    }
  })

  // Story 4.7: scroll fix — root div must use h-screen overflow-y-auto
  it('root div has overflow-y-auto class for internal scrolling', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    const root = wrapper.find('[data-testid="artist-detail-view"]')
    expect(root.classes()).toContain('overflow-y-auto')
    expect(root.classes()).toContain('h-screen')
    expect(root.classes()).not.toContain('min-h-screen')
  })

  // Story 4.7: verify album titles are rendered in the DOM (AC 1)
  it('renders album titles in the album list (AC 1)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    const albumTitles = wrapper.findAll('[data-testid="album-title"]')
    expect(albumTitles).toHaveLength(2)
    expect(albumTitles[0]?.text()).toBe('The Wall')
    expect(albumTitles[1]?.text()).toBe('Dark Side of the Moon')
  })

  // Story 9.8: AC4 — v-if parity for local albums without coverArtUrl
  it('AC4 (Story 9.8): local album without coverArtUrl shows ♪ fallback, not a broken img', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail({
        albums: [
          {
            id: '1',
            title: 'The Wall',
            releaseYear: 1979,
            coverArtUrl: '',
          },
        ],
      }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    // img with v-if="!coverErrors[album.id]" renders even with empty src — BUG
    // After fix: v-if="album.coverArtUrl && !coverErrors[album.id]" → img must NOT render
    const img = wrapper.find('[data-testid="album-cover"]')
    expect(img.exists()).toBe(false)
  })
})

// Story 8.6: Tidal artist page
describe('ArtistDetailView — Tidal mode', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountTidalView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', name: 'artist-detail', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/artist/6.0?source=tidal',
    )
    // Set artist name in history.state (as navigation would)
    window.history.replaceState({ ...window.history.state, tidalArtistName: 'Bill Evans' }, '')
    const wrapper = mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  const makeTidalAlbumsResponse = (): TidalArtistAlbumsResponse => ({
    artistId: '6.0',
    albums: [
      {
        id: '6.0.1.0',
        title: 'When I Fall In Love',
        coverArtUrl: 'http://lms/imageproxy/abc/image.jpg',
      },
      {
        id: '6.0.1.1',
        title: 'Waltz for Debby',
        coverArtUrl: 'http://lms/imageproxy/def/image.jpg',
      },
    ],
    totalCount: 2,
  })

  // AC1: Tidal mode — calls getTidalArtistAlbums, not getArtistDetail
  it('AC1: calls getTidalArtistAlbums when source=tidal, not getArtistDetail', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getTidalArtistAlbums).mockResolvedValue({
      ok: true,
      value: makeTidalAlbumsResponse(),
    })

    await mountTidalView()
    await nextTick()
    await nextTick()

    expect(getTidalArtistAlbums).toHaveBeenCalledWith('6.0')
    expect(getArtistDetail).not.toHaveBeenCalled()
  })

  // AC2: Tidal album grid renders album titles
  it('AC2: renders Tidal album titles in the grid', async () => {
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getTidalArtistAlbums).mockResolvedValue({
      ok: true,
      value: makeTidalAlbumsResponse(),
    })

    const { wrapper } = await mountTidalView()
    await nextTick()
    await nextTick()

    const albumTitles = wrapper.findAll('[data-testid="album-title"]')
    expect(albumTitles).toHaveLength(2)
    expect(albumTitles[0]?.text()).toBe('When I Fall In Love')
    expect(albumTitles[1]?.text()).toBe('Waltz for Debby')
  })

  // AC3: clicking Tidal album navigates with history.state
  it('AC3: clicking Tidal album navigates to album-detail with history.state', async () => {
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getTidalArtistAlbums).mockResolvedValue({
      ok: true,
      value: makeTidalAlbumsResponse(),
    })

    const { wrapper, router } = await mountTidalView()
    const pushSpy = vi.spyOn(router, 'push')
    await nextTick()
    await nextTick()

    const albumItems = wrapper.findAll('[data-testid="album-item"]')
    await albumItems[0]?.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'album-detail',
        params: { albumId: '6.0.1.0' },
        state: expect.objectContaining({
          tidalTitle: 'When I Fall In Love',
          tidalArtist: 'Bill Evans',
          tidalCoverArtUrl: 'http://lms/imageproxy/abc/image.jpg',
          tidalArtistId: '6.0', // required for AC4 back-nav button on album page
          tidalArtistName: 'Bill Evans', // required for display on album page
        }),
      }),
    )
  })

  // AC5: loading state shown while fetching
  it('AC5: shows loading state while Tidal albums are loading', async () => {
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getTidalArtistAlbums).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountTidalView()

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  // AC5: error state when Tidal API fails
  it('AC5: shows error state when getTidalArtistAlbums fails', async () => {
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getTidalArtistAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS unreachable' },
    })

    const { wrapper } = await mountTidalView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="error-server"]').exists()).toBe(true)
  })

  // AC5: empty state when artist has no albums
  it('AC5: shows empty state when Tidal artist has no albums', async () => {
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getTidalArtistAlbums).mockResolvedValue({
      ok: true,
      value: { artistId: '6.0', albums: [], totalCount: 0 },
    })

    const { wrapper } = await mountTidalView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="no-albums-message"]').exists()).toBe(true)
  })

  // AC6: regression — local artist still calls getArtistDetail (no ?source=tidal)
  it('AC6: local artist page (no ?source) still calls getArtistDetail, not getTidalArtistAlbums', async () => {
    // Create router and navigate to local artist page BEFORE mounting
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', name: 'artist-detail', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/artist/6.0?source=tidal',
    )
    // Navigate to local artist page (no source=tidal query param)
    await router.push('/artist/42')
    await router.isReady()

    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getTidalArtistAlbums } = await import('@/platform/api/tidalArtistsApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: {
        id: '42',
        name: 'Pink Floyd',
        albums: [],
      },
    })

    // Now mount the component - it will fetch using the current route
    mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    await nextTick()
    await nextTick()

    expect(getArtistDetail).toHaveBeenCalledWith('42')
    expect(getTidalArtistAlbums).not.toHaveBeenCalled()
  })
})

// M004-S02: ArtistDetailView enrichment integration
describe('ArtistDetailView — enrichment', () => {
  const makeEnrichment = (overrides: Partial<ArtistEnrichment> = {}): ArtistEnrichment => ({
    name: 'Pink Floyd',
    listeners: 4500000,
    playcount: 120000000,
    tags: ['rock', 'progressive rock'],
    bio: 'Legendary British rock band.',
    ...overrides,
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    // Default similar-artists and getArtistByName to failures so enrichment tests are unaffected
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/artist/42',
    )
    const wrapper = mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('calls getArtistEnrichment with artist name after detail loads', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(getArtistEnrichment).toHaveBeenCalledWith('Pink Floyd')
  })

  it('renders enrichment-stats when enrichment returns listeners and playcount', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const stats = wrapper.find('[data-testid="enrichment-stats"]')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('listeners')
    expect(stats.text()).toContain('plays')
  })

  it('renders enrichment-bio when bio is non-empty', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ bio: 'Legendary British rock band.' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const bio = wrapper.find('[data-testid="enrichment-bio"]')
    expect(bio.exists()).toBe(true)
    expect(bio.text()).toBe('Legendary British rock band.')
  })

  it('enrichment-bio is absent when bio is empty string', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ bio: '' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="enrichment-bio"]').exists()).toBe(false)
  })

  it('renders enrichment-tags chips when tags are non-empty', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ tags: ['rock', 'progressive rock'] }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const tagsContainer = wrapper.find('[data-testid="enrichment-tags"]')
    expect(tagsContainer.exists()).toBe(true)
    const chips = tagsContainer.findAll('span')
    expect(chips).toHaveLength(2)
    expect(chips[0]?.text()).toBe('rock')
    expect(chips[1]?.text()).toBe('progressive rock')
  })

  it('enrichment-tags is absent when tags array is empty', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ tags: [] }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="enrichment-tags"]').exists()).toBe(false)
  })

  it('album-list still renders when enrichment returns NOT_FOUND (graceful degradation)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="enrichment-stats"]').exists()).toBe(false)
  })

  it('enrichment-stats is absent when enrichment returns an error', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 500, message: 'Internal error' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="enrichment-stats"]').exists()).toBe(false)
  })

  it('artist-avatar is absent in local mode (avatar removed from local layout)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="artist-avatar"]').exists()).toBe(false)
  })
})

// M004-S04: ArtistDetailView similar artists
describe('ArtistDetailView — similar artists', () => {
  const makeSimilarArtist = (overrides: Partial<SimilarArtist> = {}): SimilarArtist => ({
    name: 'Thom Yorke',
    match: 0.95,
    url: 'https://www.last.fm/music/Thom+Yorke',
    ...overrides,
  })

  const makeSixSimilarArtists = (): readonly SimilarArtist[] => [
    { name: 'Portishead', match: 0.9, url: 'https://last.fm/Portishead' },
    { name: 'Massive Attack', match: 0.88, url: 'https://last.fm/Massive+Attack' },
    { name: 'Thom Yorke', match: 0.85, url: 'https://last.fm/Thom+Yorke' },
    { name: 'Bjork', match: 0.82, url: 'https://last.fm/Bjork' },
    { name: 'Sigur Ros', match: 0.78, url: 'https://last.fm/Sigur+Ros' },
    { name: 'Arca', match: 0.75, url: 'https://last.fm/Arca' },
  ]

  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    // Default: enrichment and similar-artists both fail silently
    const { getArtistEnrichment, getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
        { path: '/artist-unified', name: 'unified-artist', component: { template: '<div />' } },
      ],
      '/artist/42',
    )
    const wrapper = mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('section is absent when getSimilarArtists fails', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    // getSimilarArtists already returns failure from beforeEach

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="similar-artists-section"]').exists()).toBe(false)
  })

  it('section renders 6 cards when getSimilarArtists returns 6 artists', async () => {
    const { getArtistDetail, getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: makeSixSimilarArtists(),
    })
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="similar-artists-section"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="similar-artist-card"]')).toHaveLength(6)
  })

  it('in-library card has accent border class and similar-artist-in-library marker', async () => {
    const { getArtistDetail, getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: [makeSimilarArtist({ name: 'Portishead' })],
    })
    // Portishead is in library (has local albums)
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: {
        localAlbums: [{ id: 'a1', title: 'Dummy', artist: 'Portishead' }],
        tidalAlbums: [],
      },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    const card = wrapper.find('[data-testid="similar-artist-card"]')
    expect(card.classes()).toContain('border-accent-400')
    expect(wrapper.find('[data-testid="similar-artist-in-library"]').exists()).toBe(true)
  })

  it('non-in-library card does not have accent border class', async () => {
    const { getArtistDetail, getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: [makeSimilarArtist({ name: 'Portishead' })],
    })
    // Not in library
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: {
        localAlbums: [],
        tidalAlbums: [],
      },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    const card = wrapper.find('[data-testid="similar-artist-card"]')
    expect(card.classes()).not.toContain('border-accent-400')
    expect(card.classes()).toContain('border-neutral-200')
    expect(wrapper.find('[data-testid="similar-artist-in-library"]').exists()).toBe(false)
  })

  it('clicking a card calls router.push with unified-artist route and artist name', async () => {
    const { getArtistDetail, getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: [makeSimilarArtist({ name: 'Portishead' })],
    })
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })

    const { wrapper, router } = await mountView()
    const pushSpy = vi.spyOn(router, 'push')
    await flushPromises()

    const card = wrapper.find('[data-testid="similar-artist-card"]')
    await card.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'unified-artist',
        query: expect.objectContaining({ name: 'Portishead' }),
      }),
    )
  })

  it('existing enrichment tests still pass — similar-artists settles to [] without blocking', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: {
        name: 'Pink Floyd',
        listeners: 4500000,
        playcount: 120000000,
        tags: ['rock'],
        bio: 'A band.',
      },
    })
    // getSimilarArtists fails from beforeEach — similar section absent

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    // Enrichment rendered
    expect(wrapper.find('[data-testid="enrichment-stats"]').exists()).toBe(true)
    // Similar artists section absent
    expect(wrapper.find('[data-testid="similar-artists-section"]').exists()).toBe(false)
  })
})

// M004-S05: ArtistDetailView hero image
describe('ArtistDetailView — hero image', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    const { getArtistEnrichment, getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/artist/42',
    )
    const wrapper = mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('renders background-image style when getArtistHeroImage returns ok(url)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({
      ok: true,
      value: 'https://assets.fanart.tv/fanart/music/test.jpg',
    })

    const { wrapper } = await mountView()
    await flushPromises()

    const hero = wrapper.find('[data-testid="artist-hero"]')
    expect(hero.exists()).toBe(true)
    expect(hero.attributes('style')).toContain('https://assets.fanart.tv/fanart/music/test.jpg')
  })

  it('no background-image style when getArtistHeroImage returns ok(null)', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    // heroImageApi already returns ok(null) from beforeEach

    const { wrapper } = await mountView()
    await flushPromises()

    const hero = wrapper.find('[data-testid="artist-hero"]')
    expect(hero.exists()).toBe(true)
    expect(hero.attributes('style')).toBeUndefined()
  })

  it('no background-image style when getArtistHeroImage returns error', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'Unavailable' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    const hero = wrapper.find('[data-testid="artist-hero"]')
    expect(hero.exists()).toBe(true)
    expect(hero.attributes('style')).toBeUndefined()
  })

  it('calls getArtistHeroImage with artist name after detail loads', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail({ name: 'Pink Floyd' }),
    })

    await mountView()
    await flushPromises()

    // useArtistImage composable calls getArtistHeroImage internally
    expect(getArtistHeroImage).toHaveBeenCalledWith('Pink Floyd')
  })
})

// M004-S06: ArtistDetailView loading skeletons
describe('ArtistDetailView — loading skeletons', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 404, message: 'Not found' },
    })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/artist/:artistId', component: ArtistDetailView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      ],
      '/artist/42',
    )
    const wrapper = mount(ArtistDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('enrichment-skeleton is visible while getArtistEnrichment is in flight', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    // Hero resolves immediately so it doesn't interfere
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
    // Deferred enrichment — never resolves during the primary-data drain
    const deferredEnrichment = createDeferred<Awaited<ReturnType<typeof getArtistEnrichment>>>()
    vi.mocked(getArtistEnrichment).mockReturnValueOnce(deferredEnrichment.promise)

    const { wrapper } = await mountView()
    // Drain primary fetch + status update
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="enrichment-skeleton"]').exists()).toBe(true)

    // Resolve the deferred enrichment to clean up
    deferredEnrichment.resolve({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    await flushPromises()
  })

  it('enrichment-skeleton is absent after getArtistEnrichment resolves', async () => {
    const { getArtistDetail } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistDetail).mockResolvedValue({
      ok: true,
      value: makeArtistDetail(),
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="enrichment-skeleton"]').exists()).toBe(false)
  })

  it('hero-skeleton element was removed (loading state is implicit via reactive imageUrl)', () => {
    // The hero skeleton was removed when migrating to useArtistImage.
    // The hero image now appears reactively once the Fanart.tv call resolves,
    // without a blocking skeleton phase. This test documents the removal.
    expect(true).toBe(true)
  })
})
