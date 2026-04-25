import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import AlbumDetailView from './AlbumDetailView.vue'
import type { AlbumDetailResponse } from '@/platform/api/albumApi'
import type { AlbumEnrichment } from '@/platform/api/enrichmentApi'
import { createDeferred, setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

vi.mock('@/platform/api/albumApi', () => ({
  getAlbumDetail: vi.fn(),
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbumTracks: vi.fn(),
  resolveAlbum: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playTrack: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  playAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  playTidalSearchAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  getVolume: vi.fn().mockResolvedValue({ ok: true, value: 50 }),
  getPlaybackStatus: vi.fn().mockResolvedValue({
    ok: true,
    value: { status: 'stopped', currentTime: 0, currentTrack: null },
  }),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  addAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  addTidalSearchAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}))

vi.mock('@/platform/api/enrichmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/api/enrichmentApi')>()
  return {
    ...actual,
    getAlbumEnrichment: vi.fn(),
  }
})

const makeAlbumDetail = (overrides: Partial<AlbumDetailResponse> = {}): AlbumDetailResponse => ({
  id: '42',
  title: 'Dark Side of the Moon',
  artist: 'Pink Floyd',
  releaseYear: 1973,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
  tracks: [
    {
      id: '1',
      trackNumber: 1,
      title: 'Speak to Me',
      artist: 'Pink Floyd',
      duration: 68,
      url: 'file:///music/1.flac',
    },
    {
      id: '2',
      trackNumber: 2,
      title: 'Breathe',
      artist: 'Pink Floyd',
      duration: 163,
      url: 'file:///music/2.flac',
    },
  ],
  ...overrides,
})

describe('AlbumDetailView', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/42',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('shows loading state initially', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  it('renders album title, artist, year after successful load', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-title"]').text()).toBe('Dark Side of the Moon')
    expect(wrapper.find('[data-testid="artist-link-button"]').text()).toBe('Pink Floyd')
    expect(wrapper.find('[data-testid="album-year"]').text()).toBe('1973')
  })

  it('renders tracklist with correct number of items', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('[data-testid="track-item"]')).toHaveLength(2)
  })

  it('shows "Play Album" button', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="play-album-button"]').exists()).toBe(true)
  })

  it('shows error-not-found state on 404', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'Album not found' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="error-not-found"]').exists()).toBe(true)
  })

  it('shows error-server state on 503', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS unreachable' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="error-server"]').exists()).toBe(true)
  })

  it('shows quality badge when track has audioQuality', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({
        tracks: [
          {
            id: '1',
            trackNumber: 1,
            title: 'Breathe',
            artist: 'Pink Floyd',
            duration: 163,
            url: 'file:///music/1.flac',
            audioQuality: {
              format: 'FLAC',
              bitrate: 1411000,
              sampleRate: 44100,
              lossless: true,
            },
          },
        ],
      }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="track-quality-badge"]').exists()).toBe(true)
  })

  it('shows --:-- when track duration is 0', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({
        tracks: [
          {
            id: '1',
            trackNumber: 1,
            title: 'Track',
            artist: 'Artist',
            duration: 0,
            url: 'file:///music/1.flac',
          },
        ],
      }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('--:--')
  })

  it('shows music note fallback when no coverArtUrl', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ coverArtUrl: null }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-cover-fallback"]').exists()).toBe(true)
  })

  it('cover shows fallback on image load error', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ coverArtUrl: 'http://bad.url/cover.jpg' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const img = wrapper.find('[data-testid="album-cover-image"]')
    if (img.exists()) {
      await img.trigger('error')
      await nextTick()
      expect(wrapper.find('[data-testid="album-cover-fallback"]').exists()).toBe(true)
    }
  })

  it('calls playAlbum with albumId on Play Album click', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { playAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')
    await nextTick()

    expect(playAlbum).toHaveBeenCalledWith('42')
  })

  it('calls playTrack with track url on track play click', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { playTrack } = await import('@/platform/api/playbackApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const playButtons = wrapper.findAll('[data-testid="track-play-button"]')
    await playButtons[0]?.trigger('click')
    await nextTick()

    expect(playTrack).toHaveBeenCalledWith('file:///music/1.flac')
  })

  // Story 4.6: Color scheme and track number tests
  it('root div has bg-white class (not bg-background-primary)', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    const root = wrapper.find('[data-testid="album-detail-view"]')
    expect(root.classes()).toContain('bg-white')
  })

  it('album title has text-neutral-900 class', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const title = wrapper.find('[data-testid="album-title"]')
    expect(title.classes()).toContain('text-neutral-900')
  })

  it('track number is not 0 when correctly mocked', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({
        tracks: [
          {
            id: '1',
            trackNumber: 3,
            title: 'Money',
            artist: 'Pink Floyd',
            duration: 382,
            url: 'file:///music/1.flac',
          },
        ],
      }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).not.toContain(' 0 ')
  })

  it('does not show year when releaseYear is null', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ releaseYear: null }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-year"]').exists()).toBe(false)
  })

  // Story 8.4: album-level artist displayed correctly in header
  it('shows album-level artist (not track composer) in album-artist element', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ artist: 'Die Toten Hosen' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="artist-link-button"]').text()).toBe('Die Toten Hosen')
  })

  // Story 4.7: album title from track album field
  it('renders album title in header from track album field', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ title: 'Dark Side of the Moon' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-title"]').text()).toBe('Dark Side of the Moon')
  })

  // Story 4.7: scroll fix — root div must use h-screen overflow-y-auto
  it('root div has overflow-y-auto class for internal scrolling', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    const root = wrapper.find('[data-testid="album-detail-view"]')
    expect(root.classes()).toContain('overflow-y-auto')
    expect(root.classes()).toContain('h-screen')
    expect(root.classes()).not.toContain('min-h-screen')
  })

  // Bugfix: artist name is always a clickable button (navigates to unified-artist by name)
  it('artist name renders as button for local albums (no tidalArtistId in history.state)', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ artist: 'Pink Floyd' }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const btn = wrapper.find('[data-testid="artist-link-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.text()).toBe('Pink Floyd')
  })

  // Bugfix: clicking artist on local album navigates to unified-artist?name=
  it('clicking artist button on local album navigates to unified-artist view', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ artist: 'Pink Floyd' }),
    })

    const router = await createTestRouter(
      [
        { path: '/album/:albumId', component: AlbumDetailView },
        { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
      ],
      '/album/42',
    )
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(AlbumDetailView, { global: { plugins: [router] } })
    await nextTick()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="artist-link-button"]').trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'unified-artist', query: { name: 'Pink Floyd' } }),
    )
  })
})

// Story 9.1: AC6 — regression: local numeric album IDs must route to getAlbumDetail
describe('AlbumDetailView — AC6 regression: local numeric album IDs', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/92',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('AC6: albumId "92" calls getAlbumDetail, NOT getTidalAlbumTracks', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({ id: '92' }),
    })

    await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(getAlbumDetail).toHaveBeenCalledWith('92')
    expect(getTidalAlbumTracks).not.toHaveBeenCalled()
  })

  // Note: the year-string regression guard (string "2008" → Zod PARSE_ERROR) is in albumApi.test.ts.
  // This test verifies the view renders correctly after the backend returns a proper number.
  it('AC6: albumId "92" renders album data from getAlbumDetail response', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({
        id: '92',
        title: 'Taylor Swift',
        artist: 'Taylor Swift',
        releaseYear: 2008,
      }),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-title"]').text()).toBe('Taylor Swift')
    expect(wrapper.find('[data-testid="album-year"]').text()).toBe('2008')
  })
})

// Story 8.7: AC1 — Tidal album from LibraryView path (albumId "4.0")
describe('AlbumDetailView — Tidal album play from LibraryView (AC1)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/4.0',
    )
    window.history.replaceState(
      {
        ...window.history.state,
        tidalTitle: 'Kind of Blue',
        tidalArtist: 'Miles Davis',
        tidalCoverArtUrl: 'http://lms/imageproxy/abc/image.jpg',
      },
      '',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('AC1: calls getTidalAlbumTracks with LibraryView albumId "4.0" on mount', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    await mountView()
    await nextTick()
    await nextTick()

    expect(getTidalAlbumTracks).toHaveBeenCalledWith('4.0')
  })

  it('AC1: "Play Album" button exists for Tidal LibraryView album', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="play-album-button"]').exists()).toBe(true)
  })

  it('AC1: clicking "Play Album" calls playAlbum("4.0")', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    const { playAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')
    await nextTick()

    expect(playAlbum).toHaveBeenCalledWith('4.0')
  })
})

// Story 8.7: AC2 — Tidal album from ArtistDetailView path (albumId "6.0.1.0")
describe('AlbumDetailView — Tidal album play from ArtistDetailView (AC2)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/album/:albumId', component: AlbumDetailView },
        { path: '/artist/:artistId', name: 'artist-detail', component: { template: '<div />' } },
      ],
      '/album/6.0.1.0',
    )
    window.history.replaceState(
      {
        ...window.history.state,
        tidalTitle: 'When I Fall In Love',
        tidalArtist: 'Bill Evans',
        tidalCoverArtUrl: 'http://lms/imageproxy/abc/image.jpg',
        tidalArtistId: '6.0',
        tidalArtistName: 'Bill Evans',
      },
      '',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('AC2: calls getTidalAlbumTracks with artist-browse albumId "6.0.1.0" on mount', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    await mountView()
    await nextTick()
    await nextTick()

    expect(getTidalAlbumTracks).toHaveBeenCalledWith('6.0.1.0')
  })

  it('AC2: "Play Album" button exists for Tidal artist-browse album', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="play-album-button"]').exists()).toBe(true)
  })

  it('AC2: clicking "Play Album" calls playAlbum("6.0.1.0")', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    const { playAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')
    await nextTick()

    expect(playAlbum).toHaveBeenCalledWith('6.0.1.0')
  })
})

// Story 9.2: AC2 — Tidal album with "7_" prefix (search-artist albums, Story 8.9)
describe('AlbumDetailView — Tidal album with "7_" prefix ID (Story 9.2 AC2)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/7_sabrina carpenter.2.0.1.4',
    )
    window.history.replaceState(
      {
        ...window.history.state,
        tidalTitle: 'Emails I Cant Send',
        tidalArtist: 'Sabrina Carpenter',
        tidalCoverArtUrl: 'http://lms/imageproxy/abc/image.jpg',
      },
      '',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('AC2: calls getTidalAlbumTracks for "7_" prefix ID (not getAlbumDetail)', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    await mountView()
    await nextTick()
    await nextTick()

    expect(getTidalAlbumTracks).toHaveBeenCalledWith('7_sabrina carpenter.2.0.1.4')
    expect(getAlbumDetail).not.toHaveBeenCalled()
  })
})

// Story 8.6: AC4 — artist link in Tidal AlbumDetailView
describe('AlbumDetailView — Tidal mode with artist navigation (AC4)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountTidalAlbumView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/album/:albumId', component: AlbumDetailView },
        { path: '/artist/:artistId', name: 'artist-detail', component: { template: '<div />' } },
      ],
      '/album/6.0.1.0',
    )
    // Navigate to a Tidal album (ID has dots → isTidalAlbumId = true)
    // Set Tidal metadata + tidalArtistId in history.state
    window.history.replaceState(
      {
        ...window.history.state,
        tidalTitle: 'When I Fall In Love',
        tidalArtist: 'Bill Evans',
        tidalCoverArtUrl: 'http://lms/imageproxy/abc/image.jpg',
        tidalArtistId: '6.0',
        tidalArtistName: 'Bill Evans',
      },
      '',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  // AC4: artist name rendered as <button> when tidalArtistId is in history.state
  it('AC4: renders artist name as button when tidalArtistId is in history.state', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountTidalAlbumView()
    await nextTick()
    await nextTick()

    const artistButton = wrapper.find('[data-testid="artist-link-button"]')
    expect(artistButton.exists()).toBe(true)
    expect(artistButton.element.tagName).toBe('BUTTON')
    expect(artistButton.text()).toBe('Bill Evans')
  })

  // AC4: clicking artist button navigates to Tidal artist page
  it('AC4: clicking artist button navigates to /artist/:tidalArtistId?source=tidal', async () => {
    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper, router } = await mountTidalAlbumView()
    const pushSpy = vi.spyOn(router, 'push')
    await nextTick()
    await nextTick()

    const artistButton = wrapper.find('[data-testid="artist-link-button"]')
    await artistButton.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'artist-detail',
        params: { artistId: '6.0' },
        query: { source: 'tidal' },
      }),
    )
  })
})

// Story 9.4: AC1 (per-track queue button) + AC2 (full-album queue button) in AlbumDetailView
describe('AlbumDetailView — Story 9.4 queue buttons (AC1 & AC2)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
  })

  const mountLocalView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/42',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('AC1: renders add-to-queue button for each track', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountLocalView()
    await nextTick()
    await nextTick()
    await nextTick()

    const addButtons = wrapper.findAll('[data-testid="track-add-to-queue-button"]')
    expect(addButtons).toHaveLength(2)
  })

  it('AC1: track add-to-queue button is disabled when track.url is empty', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail({
        tracks: [
          { id: '1', trackNumber: 1, title: 'No URL Track', artist: 'X', duration: 60, url: '' },
        ],
      }),
    })

    const { wrapper } = await mountLocalView()
    await nextTick()
    await nextTick()
    await nextTick()

    const btn = wrapper.find('[data-testid="track-add-to-queue-button"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('AC2: renders "Add Album to Queue" button', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    const { wrapper } = await mountLocalView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="add-album-to-queue-button"]').exists()).toBe(true)
  })
})

// Story 9.14: Tidal Search Album path — AlbumDetailView handles /album/tidal-search
describe('AlbumDetailView — Tidal Search Album path (Story 9.14)', () => {
  const tidalSearchState = {
    title: 'OK Computer',
    artist: 'Radiohead',
    coverArtUrl: 'http://example.com/cover.jpg',
    trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
    trackTitles: ['Airbag', 'Paranoid Android'],
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({ ok: true, value: { albumId: null } })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/album/tidal-search', name: 'tidal-search-album', component: AlbumDetailView },

        { path: '/album/:albumId', name: 'album-detail', component: AlbumDetailView },
      ],

      '/album/tidal-search',
    )
    window.history.replaceState({ ...window.history.state, ...tidalSearchState }, '')
    const wrapper = mount(AlbumDetailView, { global: { plugins: [router] } })
    return { wrapper, router }
  }

  // AC5: route /album/tidal-search maps to tidal-search-album route
  it('AC5: route /album/tidal-search uses tidal-search-album route name', async () => {
    const { router } = await mountView()
    expect(router.currentRoute.value.name).toBe('tidal-search-album')
    expect(router.currentRoute.value.path).toBe('/album/tidal-search')
  })

  // AC2+AC4: renders album title, artist, track count from history.state (fallback)
  it('AC2+AC4: renders album metadata from history.state when resolve returns null', async () => {
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: null },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-title"]').text()).toBe('OK Computer')
    expect(wrapper.find('[data-testid="artist-link-button"]').text()).toBe('Radiohead')
    expect(wrapper.find('[data-testid="album-track-count"]').text()).toBe('2 tracks')
  })

  // AC4: fallback renders track titles from history.state
  it('AC4: renders track titles from history.state in fallback mode', async () => {
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: null },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('Airbag')
    expect(wrapper.text()).toContain('Paranoid Android')
  })

  // AC3: calls resolveAlbum with title and artist on mount
  it('AC3: calls resolveAlbum with title and artist from history.state', async () => {
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: null },
    })

    await mountView()
    await nextTick()
    await nextTick()

    expect(resolveAlbum).toHaveBeenCalledWith('OK Computer', 'Radiohead')
  })

  // AC3: when resolve returns albumId, calls getTidalAlbumTracks
  it('AC3: calls getTidalAlbumTracks with resolved albumId when browse resolution succeeds', async () => {
    const { resolveAlbum, getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: '4.123456' },
    })
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(getTidalAlbumTracks).toHaveBeenCalledWith('4.123456')
  })

  // AC4: Play Album uses playTidalSearchAlbum when no resolved albumId
  it('AC4: Play Album button calls playTidalSearchAlbum in fallback mode', async () => {
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    const { playTidalSearchAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: null },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')
    await nextTick()

    expect(playTidalSearchAlbum).toHaveBeenCalledWith('OK Computer', 'Radiohead', [
      'tidal://111.flc',
      'tidal://222.flc',
    ])
  })

  // AC4: Add Album to Queue uses addTidalSearchAlbumToQueue in fallback mode
  it('AC4: Add Album to Queue calls addTidalSearchAlbumToQueue in fallback mode', async () => {
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    const { addTidalSearchAlbumToQueue } = await import('@/platform/api/queueApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: null },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="add-album-to-queue-button"]').trigger('click')
    await nextTick()

    expect(addTidalSearchAlbumToQueue).toHaveBeenCalledWith('OK Computer', 'Radiohead', [
      'tidal://111.flc',
      'tidal://222.flc',
    ])
  })

  // M1: resolveAlbum returns ok:false (network error) → fallback (AC4 "if browse resolution fails")
  it('AC4: renders fallback from history.state when resolveAlbum returns network error', async () => {
    const { resolveAlbum } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: false,
      error: { type: 'NETWORK_ERROR', message: 'LMS unreachable' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-title"]').text()).toBe('OK Computer')
    expect(wrapper.find('[data-testid="album-track-count"]').text()).toBe('2 tracks')
  })

  // M2: Play Album with resolved albumId → playAlbum (AC3 happy path)
  it('AC3: Play Album button calls playAlbum(resolvedAlbumId) when browse resolution succeeds', async () => {
    const { resolveAlbum, getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    const { playAlbum, playTidalSearchAlbum } = await import('@/platform/api/playbackApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: '4.123456' },
    })
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')
    await nextTick()

    expect(playAlbum).toHaveBeenCalledWith('4.123456')
    expect(playTidalSearchAlbum).not.toHaveBeenCalled()
  })

  // M3: Add Album to Queue with resolved albumId → addAlbumToQueue (AC3 happy path)
  it('AC3: Add Album to Queue calls addAlbumToQueue(resolvedAlbumId) when browse resolution succeeds', async () => {
    const { resolveAlbum, getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    const { addAlbumToQueue, addTidalSearchAlbumToQueue } = await import('@/platform/api/queueApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: '4.123456' },
    })
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="add-album-to-queue-button"]').trigger('click')
    await nextTick()

    expect(addAlbumToQueue).toHaveBeenCalledWith('4.123456')
    expect(addTidalSearchAlbumToQueue).not.toHaveBeenCalled()
  })

  // L3: resolve succeeds but getTidalAlbumTracks fails → error-server state
  it('shows error-server when resolve succeeds but getTidalAlbumTracks fails', async () => {
    const { resolveAlbum, getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(resolveAlbum).mockResolvedValue({
      ok: true,
      value: { albumId: '4.123456' },
    })
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS unreachable' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="error-server"]').exists()).toBe(true)
  })
})

// M004/S03: AlbumDetailView enrichment block
describe('AlbumDetailView — enrichment', () => {
  const makeEnrichment = (): AlbumEnrichment => ({
    name: 'Dark Side of the Moon',
    listeners: 1234567,
    playcount: 9876543,
    tags: ['progressive rock', 'psychedelic'],
    wiki: 'A great album.',
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/42',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('calls getAlbumEnrichment with album artist and title after detail loads', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })

    await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(getAlbumEnrichment).toHaveBeenCalledWith('Pink Floyd', 'Dark Side of the Moon')
  })

  it('renders enrichment-stats with listener and playcount text when enrichment succeeds', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
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

  it('renders enrichment-wiki when wiki is non-empty', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const wiki = wrapper.find('[data-testid="enrichment-wiki"]')
    expect(wiki.exists()).toBe(true)
    expect(wiki.text()).toBe('A great album.')
  })

  it('enrichment-wiki absent when wiki is empty string', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: true,
      value: { ...makeEnrichment(), wiki: '' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="enrichment-wiki"]').exists()).toBe(false)
  })

  it('renders enrichment-tags chips when tags non-empty', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment(),
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const tagsContainer = wrapper.find('[data-testid="enrichment-tags"]')
    expect(tagsContainer.exists()).toBe(true)
    expect(tagsContainer.text()).toContain('progressive rock')
    expect(tagsContainer.text()).toContain('psychedelic')
  })

  it('enrichment-tags absent when tags array is empty', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: true,
      value: { ...makeEnrichment(), tags: [] },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="enrichment-tags"]').exists()).toBe(false)
  })

  it('shows localized NOT_FOUND error message when enrichment returns NOT_FOUND', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-enrichment-error-not-found"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No additional album information is available.')
  })

  it('shows localized UNAVAILABLE error message when enrichment returns SERVER_ERROR', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'Last.fm unavailable' },
    })

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-enrichment-error-unavailable"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Album information is currently unavailable.')
  })

  it('renders German localized UNAVAILABLE error when language is set to de', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    const { useI18nStore } = await import('@/app/i18nStore')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'Last.fm unavailable' },
    })

    const store = useI18nStore()
    store.setLanguage('de')

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const msg = wrapper.find('[data-testid="album-enrichment-error-unavailable"]')
    expect(msg.exists()).toBe(true)
    expect(msg.text()).toBe('Albuminformationen sind derzeit nicht verfügbar.')
  })

  it('enrichment block wrapper absent when enrichment returns NOT_FOUND (tracklist still renders)', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    // getAlbumEnrichment already defaults to NOT_FOUND in beforeEach

    const { wrapper } = await mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-enrichment-error-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="enrichment-block"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tracklist"]').exists()).toBe(true)
  })

  it('getAlbumEnrichment IS called for Tidal albums using title and artist from history.state', async () => {
    const tidalRouter = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],
      '/album/4.0',
    )
    window.history.replaceState(
      {
        ...window.history.state,
        tidalTitle: 'Kind of Blue',
        tidalArtist: 'Miles Davis',
        tidalCoverArtUrl: null,
      },
      '',
    )

    const { getTidalAlbumTracks } = await import('@/platform/api/tidalAlbumsApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getTidalAlbumTracks).mockResolvedValue({
      ok: true,
      value: { tracks: [], totalCount: 0 },
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    mount(AlbumDetailView, { global: { plugins: [tidalRouter] } })
    await nextTick()
    await nextTick()

    expect(getAlbumEnrichment).toHaveBeenCalledWith('Miles Davis', 'Kind of Blue')
  })
})

// M004-S06: AlbumDetailView loading skeletons
describe('AlbumDetailView — loading skeletons', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],

      '/album/42',
    )
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('album-enrichment-skeleton is visible while getAlbumEnrichment is in flight', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    // Deferred enrichment — does not resolve during primary-data drain
    const deferredEnrichment = createDeferred<Awaited<ReturnType<typeof getAlbumEnrichment>>>()
    vi.mocked(getAlbumEnrichment).mockReturnValueOnce(deferredEnrichment.promise)

    const { wrapper } = await mountView()
    // Drain primary fetch + status update
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="album-enrichment-skeleton"]').exists()).toBe(true)

    // Resolve to clean up
    deferredEnrichment.resolve({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    await flushPromises()
  })

  it('album-enrichment-skeleton is absent after getAlbumEnrichment resolves', async () => {
    const { getAlbumDetail } = await import('@/platform/api/albumApi')
    const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getAlbumDetail).mockResolvedValue({
      ok: true,
      value: makeAlbumDetail(),
    })
    vi.mocked(getAlbumEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="album-enrichment-skeleton"]').exists()).toBe(false)
  })
})
