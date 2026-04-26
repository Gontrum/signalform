import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import SearchResultsList from './SearchResultsList.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import type { TrackResult, AlbumResult, ArtistResult } from '../core/types'
import { getPlaybackStatus } from '@/platform/api/playbackApi'
import { ok } from '@signalform/shared'

// SearchResultsList uses useArtistImages which calls getArtistHeroImage
vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

// SearchResultsList imports playTrackList/playTidalSearchAlbum and uses playbackStore
// which calls getVolume/getPlaybackStatus on mount via embedded components
vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    playTrackList: vi.fn().mockResolvedValue(ok(undefined)),
    playTidalSearchAlbum: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(ok({ status: 'stopped', currentTime: 0, currentTrack: null })),
  }
})

type NavigateArtistPayload = {
  readonly artistId: string | null
  readonly name: string
}

const isNavigateArtistPayload = (value: unknown): value is NavigateArtistPayload => {
  return typeof value === 'object' && value !== null && 'artistId' in value && 'name' in value
}

const isTrackResult = (value: unknown): value is TrackResult => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    'artist' in value &&
    'url' in value &&
    'source' in value
  )
}

const getNavigateArtistEmission = (wrapper: VueWrapper): readonly NavigateArtistPayload[] => {
  const navigateArtistEmission = wrapper.emitted('navigate-artist')
  expect(navigateArtistEmission).toBeTruthy()
  return Array.isArray(navigateArtistEmission)
    ? navigateArtistEmission.flatMap((entry) => {
        const payload = entry[0]
        return isNavigateArtistPayload(payload) ? [payload] : []
      })
    : []
}

const getTrackPlayEmission = (wrapper: VueWrapper): TrackResult | undefined => {
  const playEmission = wrapper.emitted('play')
  if (!Array.isArray(playEmission)) {
    return undefined
  }

  const payload = playEmission[0]?.[0]
  return isTrackResult(payload) ? payload : undefined
}

const isRequestInit = (value: unknown): value is RequestInit => {
  return typeof value === 'object' && value !== null
}

const getFetchCall = (
  fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>,
  callIndex: number,
): {
  readonly url: string
  readonly options: RequestInit
} => {
  const url = fetchMock.mock.calls[callIndex]?.[0]
  const options = fetchMock.mock.calls[callIndex]?.[1]
  expect(typeof url).toBe('string')
  expect(isRequestInit(options)).toBe(true)
  return {
    url: typeof url === 'string' ? url : '',
    options: isRequestInit(options) ? options : {},
  }
}

const parseTrackListRequestBody = (
  body: unknown,
): {
  readonly albumTitle: string
  readonly artist: string
  readonly trackUrls: readonly string[]
} => {
  expect(typeof body).toBe('string')
  const parsed = JSON.parse(typeof body === 'string' ? body : '{}')
  expect(typeof parsed.albumTitle).toBe('string')
  expect(typeof parsed.artist).toBe('string')
  expect(Array.isArray(parsed.trackUrls)).toBe(true)
  return {
    albumTitle: typeof parsed.albumTitle === 'string' ? parsed.albumTitle : '',
    artist: typeof parsed.artist === 'string' ? parsed.artist : '',
    trackUrls: Array.isArray(parsed.trackUrls)
      ? parsed.trackUrls.filter((url: unknown): url is string => typeof url === 'string')
      : [],
  }
}

// Suppress Headless UI portal warnings in tests
// (Teleport requires document.body which is present in JSDOM)

const createRouter = async (): Promise<Router> => {
  return createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    { path: '/artist/:artistId', name: 'artist-detail', component: { template: '<div />' } },
  ])
}

type SearchResultsListProps = {
  readonly albums?: readonly AlbumResult[]
  readonly artists?: readonly ArtistResult[]
  readonly results: readonly TrackResult[]
}

const mountSearchResultsList = async (props: SearchResultsListProps): Promise<VueWrapper> => {
  const wrapper = mount(SearchResultsList, {
    props,
    global: { plugins: [await createRouter()] },
  })
  await nextTick()
  return wrapper
}

describe('SearchResultsList', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  const mockResults: readonly TrackResult[] = [
    {
      id: '1',
      title: 'Comfortably Numb',
      artist: 'Pink Floyd',
      album: 'The Wall',
      duration: 382,
      source: 'local',
      url: 'track://1',
      availableSources: [
        { source: 'local', url: 'track://1' },
        { source: 'qobuz', url: 'track://1-qobuz' },
      ],
    },
    {
      id: '2',
      title: 'Wish You Were Here',
      artist: 'Pink Floyd',
      album: 'Wish You Were Here',
      duration: 334,
      source: 'qobuz',
      url: 'track://2',
      // No availableSources = single source, no "also available"
    },
  ]

  it('renders list of search results', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await thenResultListIsVisible(wrapper)
    await thenResultCountIs(wrapper, 2)
  })

  it('displays track information', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await thenTrackTitleIsDisplayed(wrapper, 'Comfortably Numb')
    await thenTrackArtistIsDisplayed(wrapper, 'Pink Floyd')
    await thenTrackAlbumIsDisplayed(wrapper, 'The Wall')
  })

  it('displays play button for each track', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await thenPlayButtonsAreVisible(wrapper, 2)
  })

  it('emits play event when play button is clicked', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await whenPlayButtonIsClicked(wrapper, 0)

    await thenPlayEventIsEmitted(wrapper, '1')
  })

  it('has Apple aesthetic styling', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await thenListHasCleanStyling(wrapper)
  })

  it('has 44px minimum touch targets', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await thenPlayButtonsHaveMinimumTouchTarget(wrapper)
  })

  it('is keyboard navigable', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await thenListHasKeyboardNavigation(wrapper)
  })

  it('emits play-album event when Play Album button is clicked', async () => {
    const mockAlbums = [
      {
        id: 'album-1',
        albumId: 'album-1',
        title: 'The Wall',
        artist: 'Pink Floyd',
        trackCount: 26,
      },
    ]

    const wrapper = await whenTrackResultsListIsMountedWithAlbums(mockResults, mockAlbums)

    await whenPlayAlbumButtonIsClicked(wrapper, 0)

    await thenPlayAlbumEventIsEmitted(wrapper, 'album-1')
  })

  it('auto-plays track when selected via Enter key', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    await whenTrackIsSelectedViaKeyboard(wrapper, mockResults[0]!)

    await thenPlayEventIsEmitted(wrapper, mockResults[0]!.id)
  })

  // TODO(Story 3.x): Re-enable duration tests when LMS metadata implemented
  // it('displays duration in mm:ss format', async () => {
  //   await whenTrackResultsListIsMounted(mockResults)
  //   const text = wrapper.text()
  //   expect(text).toContain('6:22') // 382 seconds = 6:22
  // })

  it('handles missing duration gracefully', async () => {
    const firstResult = mockResults[0]
    if (!firstResult) {
      return
    }

    const resultsWithoutDuration: readonly TrackResult[] = [
      {
        id: firstResult.id,
        title: firstResult.title,
        artist: firstResult.artist,
        album: firstResult.album,
        source: firstResult.source,
        url: firstResult.url,
        duration: undefined,
      },
    ]

    const wrapper = await whenTrackResultsListIsMounted(resultsWithoutDuration)

    // Should not crash - duration is optional
    expect(wrapper.exists()).toBe(true)
  })

  it('play button has descriptive ARIA label with track and artist', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    const playButton = wrapper.find('[data-testid="play-button-1"]')
    expect(playButton.attributes('aria-label')).toBe('Play Comfortably Numb by Pink Floyd')
  })

  // 6.2 — QualityBadge renders within each search result row
  it('renders QualityBadge for each search result', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    const badges = wrapper.findAll('[data-testid="quality-badge"]')
    // Both results have non-unknown sources (local, qobuz) so badges should render
    expect(badges.length).toBe(2)
  })

  it('renders QualityBadge with correct source for each result', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    // First result: source=local → "Local" badge
    const firstItem = wrapper.find('[data-testid="result-item-1"]')
    const firstBadge = firstItem.find('[data-testid="quality-badge"]')
    expect(firstBadge.exists()).toBe(true)
    expect(firstBadge.text()).toBe('Local')

    // Second result: source=qobuz → "Qobuz" badge
    const secondItem = wrapper.find('[data-testid="result-item-2"]')
    const secondBadge = secondItem.find('[data-testid="quality-badge"]')
    expect(secondBadge.exists()).toBe(true)
    expect(secondBadge.text()).toBe('Qobuz')
  })

  it('play album button has descriptive ARIA label with album and artist', async () => {
    const mockAlbums: readonly AlbumResult[] = [
      {
        id: 'album-1',
        albumId: 'album-1',
        title: 'The Wall',
        artist: 'Pink Floyd',
        trackCount: 26,
      },
    ]

    const wrapper = await whenTrackResultsListIsMountedWithAlbums(mockResults, mockAlbums)

    const playAlbumButton = wrapper.find('[data-testid="play-album-button-album-1"]')
    expect(playAlbumButton.attributes('aria-label')).toBe('Play album The Wall')
  })

  // Story 3.4: Source transparency tests
  it('shows "Also available on" when track has multiple sources', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)
    const firstItem = wrapper.find('[data-testid="result-item-1"]')
    const alsoAvailable = firstItem.find('[data-testid="also-available"]')
    expect(alsoAvailable.exists()).toBe(true)
    expect(alsoAvailable.text()).toBe('Also available on: Qobuz')
  })

  it('does not show "Also available on" when track has single source', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)
    const secondItem = wrapper.find('[data-testid="result-item-2"]')
    const alsoAvailable = secondItem.find('[data-testid="also-available"]')
    expect(alsoAvailable.exists()).toBe(false)
  })

  it('source badge wrapper has tooltip title for local source', async () => {
    const wrapper = await whenTrackResultsListIsMounted(mockResults)
    const firstItem = wrapper.find('[data-testid="result-item-1"]')
    const tooltipWrapper = firstItem.find('span[title]')
    expect(tooltipWrapper.attributes('title')).toBe('Playing from Local library')
  })

  // Story 4.6 / 7.5: Album navigation — now uses emit pattern (Story 7.5 refactor)
  it('emits navigate-album when album result item is clicked', async () => {
    const mockAlbums: readonly AlbumResult[] = [
      { id: '99', albumId: '99', title: 'The Wall', artist: 'Pink Floyd', trackCount: 26 },
    ]

    const wrapper = await whenTrackResultsListIsMountedWithAlbums(mockResults, mockAlbums)

    const albumItem = wrapper.find('[data-testid="album-result-item-99"]')
    await albumItem.trigger('click')
    await nextTick()

    expect(wrapper.emitted('navigate-album')).toHaveLength(1)
    expect(wrapper.emitted('navigate-album')?.[0]).toEqual([{ albumId: '99' }])
  })

  it('does NOT emit navigate-album when Play Album button is clicked (click.stop prevents bubbling)', async () => {
    const mockAlbums: readonly AlbumResult[] = [
      { id: '99', albumId: '99', title: 'The Wall', artist: 'Pink Floyd', trackCount: 26 },
    ]

    const wrapper = await whenTrackResultsListIsMountedWithAlbums(mockResults, mockAlbums)

    const playAlbumBtn = wrapper.find('[data-testid="play-album-button-99"]')
    await playAlbumBtn.trigger('click')
    await nextTick()

    expect(wrapper.emitted('navigate-album')).toBeFalsy()
  })

  it('emits pause event when pause button is clicked for currently playing track', async () => {
    vi.mocked(getPlaybackStatus).mockResolvedValueOnce(
      ok({
        status: 'playing',
        currentTime: 0,
        currentTrack: {
          id: '1',
          title: 'Comfortably Numb',
          artist: 'Pink Floyd',
          album: 'The Wall',
          url: 'track://1',
          source: 'local',
        },
      }),
    )

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    // Set store to currently playing state for first result
    store.$patch({
      isPlaying: true,
      isPaused: false,
      currentTrack: {
        id: '1',
        title: 'Comfortably Numb',
        artist: 'Pink Floyd',
        album: 'The Wall',
        url: 'track://1',
        source: 'local',
      },
    })

    const wrapper = await whenTrackResultsListIsMounted(mockResults)

    const pauseButton = wrapper.find('[data-testid="pause-button-1"]')
    expect(pauseButton.exists()).toBe(true)

    await pauseButton.trigger('click')
    await nextTick()

    expect(wrapper.emitted('pause')).toBeTruthy()
  })

  // ============================================================
  // Story 7.4 Acceptance Tests (Task 0 — AC4d/e, AC5)
  // ============================================================

  describe('Artists section (Story 7.4)', () => {
    const makeArtist = (name: string, artistId?: string): ArtistResult => ({
      name,
      artistId: artistId ?? null,
    })

    const mountWithArtists = async (artists: readonly ArtistResult[]): Promise<VueWrapper> => {
      const w = mount(SearchResultsList, {
        props: { results: [], artists },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()
      return w
    }

    it('renders artists section when artists prop is non-empty (AC4d)', async () => {
      const w = await mountWithArtists([makeArtist('Pink Floyd', '42')])

      expect(w.find('[data-testid="artist-results"]').exists()).toBe(true)
      expect(w.find('[data-testid="artist-result-name"]').text()).toBe('Pink Floyd')
    })

    it('does NOT render artists section when artists prop is empty (AC4e)', async () => {
      const w = await mountWithArtists([])

      expect(w.find('[data-testid="artist-results"]').exists()).toBe(false)
    })

    it('emits navigate-artist event with artistId and name when artist item is clicked (AC5)', async () => {
      const w = await mountWithArtists([makeArtist('Pink Floyd', '42')])

      const artistButton = w.find('[data-testid="artist-result-item"] button')
      await artistButton.trigger('click')
      await nextTick()

      const emitted = getNavigateArtistEmission(w)
      expect(emitted[0]?.artistId).toBe('42')
      expect(emitted[0]?.name).toBe('Pink Floyd')
    })
  })

  // ============================================================
  // Story 7.5 Acceptance Tests (Task 0 — AC1/AC2/AC3/AC5)
  // ============================================================

  describe('Story 7.5 — Direct Navigation from Search', () => {
    it('AC1a: emits navigate-artist when artist name in track row is clicked', async () => {
      const track: TrackResult = {
        id: 't1',
        title: 'Wish You Were Here',
        artist: 'Pink Floyd',
        album: 'Wish You Were Here',
        url: 'track://t1',
        source: 'local',
        artistId: '42',
      }
      const w = mount(SearchResultsList, {
        props: { results: [track], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistLink = w.find('[data-testid="track-artist-link"]')
      expect(artistLink.exists()).toBe(true)
      await artistLink.trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-artist')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ artistId: '42', name: 'Pink Floyd' }])
    })

    it('AC1b: does NOT render track-artist-link when track has empty artist name', async () => {
      // Story 9.7: condition changed from v-if="result.artistId" to v-if="result.artist"
      // Link is hidden only when artist NAME is empty, not when artistId is absent
      const track: TrackResult = {
        id: 't2',
        title: 'Some Track',
        artist: '',
        album: 'Some Album',
        url: 'track://t2',
        source: 'local',
        artistId: undefined,
      }
      const w = mount(SearchResultsList, {
        props: { results: [track], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      expect(w.find('[data-testid="track-artist-link"]').exists()).toBe(false)
    })

    it('AC2a: emits navigate-album when album cover is clicked', async () => {
      const album: AlbumResult = {
        id: 'a1',
        albumId: 'a1',
        title: 'DSOTM',
        artist: 'Pink Floyd',
        trackCount: 10,
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [album], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      await w.find('[data-testid="album-result-cover"]').trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-album')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ albumId: 'a1' }])
    })

    it('AC2b: emits navigate-album when album title is clicked', async () => {
      const album: AlbumResult = {
        id: 'a1',
        albumId: 'a1',
        title: 'DSOTM',
        artist: 'Pink Floyd',
        trackCount: 10,
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [album], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      await w.find('[data-testid="album-result-title"]').trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-album')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ albumId: 'a1' }])
    })

    it('AC3: clicking track title plays track without emitting navigation events', async () => {
      const track: TrackResult = {
        id: 't3',
        title: 'Comfortably Numb',
        artist: 'Pink Floyd',
        album: 'The Wall',
        url: 'track://t3',
        source: 'local',
        artistId: '42',
      }
      const w = mount(SearchResultsList, {
        props: { results: [track], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const resultItem = w.find('[data-testid="result-item-t3"]')
      const titleEl = resultItem.find('h3')
      expect(titleEl.exists()).toBe(true)
      expect(titleEl.text()).toBe('Comfortably Numb')
      await titleEl.trigger('click')
      await nextTick()

      expect(w.emitted('navigate-artist')).toBeFalsy()
      expect(w.emitted('navigate-album')).toBeFalsy()
      // Play is triggered via Listbox selection (click bubbles to ListboxOption → handleSelect)
      expect(w.emitted('play')).toBeTruthy()
    })

    it('AC4: artist name link has cursor-pointer and hover classes', async () => {
      const track: TrackResult = {
        id: 't4',
        title: 'Wish You Were Here',
        artist: 'Pink Floyd',
        album: 'Wish You Were Here',
        url: 'track://t4',
        source: 'local',
        artistId: '42',
      }
      const w = mount(SearchResultsList, {
        props: { results: [track], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistLink = w.find('[data-testid="track-artist-link"]')
      expect(artistLink.exists()).toBe(true)
      const classes = artistLink.classes().join(' ')
      expect(classes).toContain('cursor-pointer')
      expect(classes).toContain('hover:underline')
    })

    it('AC4: album row has cursor-pointer class', async () => {
      const album: AlbumResult = {
        id: 'a4',
        albumId: 'a4',
        title: 'DSOTM',
        artist: 'Pink Floyd',
        trackCount: 10,
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [album], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumRow = w.find('[data-testid="album-result-item-a4"]')
      expect(albumRow.exists()).toBe(true)
      expect(albumRow.classes()).toContain('cursor-pointer')
    })

    it('AC5: clicking artist in Artists section still emits navigate-artist (regression guard)', async () => {
      const artist: ArtistResult = { name: 'Pink Floyd', artistId: '42' }
      const w = mount(SearchResultsList, {
        props: { results: [], artists: [artist], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistButton = w.find('[data-testid="artist-result-item"] button')
      await artistButton.trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-artist')
      expect(emitted).toBeTruthy()
      expect(emitted?.[0]).toEqual([{ artistId: '42', name: 'Pink Floyd' }])
    })
  })

  // ============================================================
  // Story 8.3 Acceptance Tests (Task 0 — RED phase)
  // ============================================================

  describe('Story 8.3 — Show Streaming Albums in Search Results', () => {
    it('AC1/AC2/AC3: streaming album (no albumId) renders as non-clickable div with no Play Album button', async () => {
      // Note: data-testid uses the lowercase compound "artist::album" key from the backend.
      // CSS attribute selectors support spaces and '::' in quoted values — safe in Vitest/JSDOM.
      const streamingAlbum: AlbumResult = {
        id: 'die toten hosen::opel-gang',
        title: 'Opel-Gang',
        artist: 'Die Toten Hosen',
        trackCount: 1,
        source: 'tidal',
        // no albumId — streaming album
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumRow = w.find('[data-testid="album-result-item-die toten hosen::opel-gang"]')
      expect(albumRow.exists()).toBe(true)

      // AC2: not a button — no role="button", no tabindex
      expect(albumRow.attributes('role')).not.toBe('button')
      expect(albumRow.attributes('tabindex')).toBeUndefined()

      // AC3: no Play Album button for streaming albums
      const playAlbumBtn = w.find('[data-testid^="play-album-button-"]')
      expect(playAlbumBtn.exists()).toBe(false)

      // AC2: clicking does NOT emit navigate-album
      await albumRow.trigger('click')
      await nextTick()
      expect(w.emitted('navigate-album')).toBeFalsy()
    })

    it('AC4: streaming album displays a source-specific badge with correct label text', async () => {
      const streamingAlbum: AlbumResult = {
        id: 'die toten hosen::opel-gang',
        title: 'Opel-Gang',
        artist: 'Die Toten Hosen',
        trackCount: 1,
        source: 'tidal',
        // no albumId — streaming album
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumRow = w.find('[data-testid="album-result-item-die toten hosen::opel-gang"]')
      expect(albumRow.exists()).toBe(true)

      // AC4: streaming badge visible with source-specific text (M2: verify content, not just existence)
      const streamingBadge = albumRow.find('[data-testid="album-streaming-badge"]')
      expect(streamingBadge.exists()).toBe(true)
      expect(streamingBadge.text()).toBe('Tidal')
    })

    it('AC5: local album (with albumId) remains fully functional — clickable and Play Album button visible', async () => {
      const localAlbum: AlbumResult = {
        id: '99',
        albumId: '99',
        title: 'Dark Side of the Moon',
        artist: 'Pink Floyd',
        trackCount: 10,
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumRow = w.find('[data-testid="album-result-item-99"]')
      expect(albumRow.exists()).toBe(true)

      // AC5: local album has role="button" and tabindex
      expect(albumRow.attributes('role')).toBe('button')
      expect(albumRow.attributes('tabindex')).toBe('0')

      // AC5: Play Album button is visible
      const playAlbumBtn = w.find('[data-testid="play-album-button-99"]')
      expect(playAlbumBtn.exists()).toBe(true)

      // AC5: clicking emits navigate-album
      await albumRow.trigger('click')
      await nextTick()
      expect(w.emitted('navigate-album')).toHaveLength(1)
      expect(w.emitted('navigate-album')?.[0]).toEqual([{ albumId: '99' }])
    })
  })

  // ============================================================
  // Story 8.5 Acceptance Tests (Task 0 — RED phase)
  // ============================================================

  describe('Story 8.5 — Navigate Artists from Search Results', () => {
    it('AC1: streaming artist (artistId=null) renders as <button>, not <div>', async () => {
      const streamingArtist: ArtistResult = { name: 'Die Toten Hosen', artistId: null }
      const w = mount(SearchResultsList, {
        props: { results: [], artists: [streamingArtist], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistItem = w.find('[data-testid="artist-result-item"]')
      expect(artistItem.exists()).toBe(true)
      // Must render a button (not a div with cursor-default)
      const button = artistItem.find('button')
      expect(button.exists()).toBe(true)
      // Must NOT render a non-interactive div
      const nonInteractiveDiv = artistItem.find('div.cursor-default')
      expect(nonInteractiveDiv.exists()).toBe(false)
    })

    it('AC2: clicking streaming artist emits navigate-artist with artistId=null and name', async () => {
      const streamingArtist: ArtistResult = { name: 'Die Toten Hosen', artistId: null }
      const w = mount(SearchResultsList, {
        props: { results: [], artists: [streamingArtist], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistButton = w.find('[data-testid="artist-result-item"] button')
      expect(artistButton.exists()).toBe(true)
      await artistButton.trigger('click')
      await nextTick()

      const emitted = getNavigateArtistEmission(w)
      expect(emitted[0]).toEqual({ artistId: null, name: 'Die Toten Hosen' })
    })

    it('AC3: local artist (with artistId) still emits navigate-artist with artistId and name', async () => {
      const localArtist: ArtistResult = { name: 'Pink Floyd', artistId: '42' }
      const w = mount(SearchResultsList, {
        props: { results: [], artists: [localArtist], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistButton = w.find('[data-testid="artist-result-item"] button')
      expect(artistButton.exists()).toBe(true)
      await artistButton.trigger('click')
      await nextTick()

      const emitted = getNavigateArtistEmission(w)
      expect(emitted[0]).toEqual({ artistId: '42', name: 'Pink Floyd' })
    })

    it('AC4: all artist buttons (local and streaming) have visible focus ring classes', async () => {
      const streamingArtist: ArtistResult = { name: 'Die Toten Hosen', artistId: null }
      const w1 = mount(SearchResultsList, {
        props: { results: [], artists: [streamingArtist], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()
      const streamingBtn = w1.find('[data-testid="artist-result-item"] button')
      expect(streamingBtn.classes()).toContain('focus:ring-2')
      expect(streamingBtn.classes()).toContain('focus:outline-none')

      const localArtist: ArtistResult = { name: 'Pink Floyd', artistId: '42' }
      const w2 = mount(SearchResultsList, {
        props: { results: [], artists: [localArtist], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()
      const localBtn = w2.find('[data-testid="artist-result-item"] button')
      expect(localBtn.classes()).toContain('focus:ring-2')
      expect(localBtn.classes()).toContain('focus:outline-none')
    })
  })

  // ============================================================
  // Story 9.12 Acceptance Tests — Tidal Album Card Navigation
  // ============================================================

  describe('Story 9.12 — Tidal Album Card Navigation (AC1, AC6)', () => {
    const tidalAlbum: AlbumResult = {
      id: 'radiohead::ok computer',
      source: 'tidal',
      title: 'OK Computer',
      artist: 'Radiohead',
      trackCount: 3,
      trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
    }

    it('AC1: Tidal album card with trackUrls has role="button" and tabindex="0"', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumCard = w.find(`[data-testid="album-result-item-${tidalAlbum.id}"]`)
      expect(albumCard.exists()).toBe(true)
      expect(albumCard.attributes('role')).toBe('button')
      expect(albumCard.attributes('tabindex')).toBe('0')
    })

    it('AC1: clicking Tidal album card emits navigate-tidal-album with album data', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumCard = w.find(`[data-testid="album-result-item-${tidalAlbum.id}"]`)
      await albumCard.trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-tidal-album')
      expect(emitted).toHaveLength(1)
      expect(emitted![0]![0]).toMatchObject({
        title: 'OK Computer',
        artist: 'Radiohead',
        trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
      })
    })

    it('AC1: Enter key on Tidal album card emits navigate-tidal-album', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumCard = w.find(`[data-testid="album-result-item-${tidalAlbum.id}"]`)
      await albumCard.trigger('keydown', { key: 'Enter' })
      await nextTick()

      expect(w.emitted('navigate-tidal-album')).toHaveLength(1)
    })

    it('AC1: Space key on Tidal album card emits navigate-tidal-album', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumCard = w.find(`[data-testid="album-result-item-${tidalAlbum.id}"]`)
      await albumCard.trigger('keydown', { key: ' ' })
      await nextTick()

      expect(w.emitted('navigate-tidal-album')).toHaveLength(1)
    })

    it('AC6: clicking Play Album button on Tidal card does NOT emit navigate-tidal-album', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const playBtn = w.find(`[data-testid="play-album-button-${tidalAlbum.id}"]`)
      expect(playBtn.exists()).toBe(true)
      await playBtn.trigger('click')
      await nextTick()

      expect(w.emitted('navigate-tidal-album')).toBeFalsy()
    })
  })

  // === WHEN ===

  const whenTrackResultsListIsMounted = async (
    results: readonly TrackResult[],
  ): Promise<VueWrapper> => {
    return mountSearchResultsList({ results })
  }

  const whenTrackResultsListIsMountedWithAlbums = async (
    results: readonly TrackResult[],
    albums: readonly AlbumResult[],
  ): Promise<VueWrapper> => {
    return mountSearchResultsList({ results, albums })
  }

  const whenPlayButtonIsClicked = async (wrapper: VueWrapper, index: number): Promise<void> => {
    const buttons = wrapper.findAll('[data-testid^="play-button-"]')
    const button = buttons[index]
    if (button) {
      await button.trigger('click')
      await nextTick()
    }
  }

  const whenPlayAlbumButtonIsClicked = async (
    wrapper: VueWrapper,
    index: number,
  ): Promise<void> => {
    const buttons = wrapper.findAll('[data-testid^="play-album-button-"]')
    const button = buttons[index]
    if (button) {
      await button.trigger('click')
      await nextTick()
    }
  }

  const whenTrackIsSelectedViaKeyboard = async (
    wrapper: VueWrapper,
    track: TrackResult,
  ): Promise<void> => {
    const listbox = wrapper.findComponent({ name: 'Listbox' })
    // Simulate selection update (Headless UI handles keyboard internally)
    await listbox.vm.$emit('update:modelValue', track)
    await nextTick()
  }

  // === THEN ===

  const thenResultListIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const list = wrapper.find('[data-testid="results-list"]')
    expect(list.exists()).toBe(true)
    expect(list.isVisible()).toBe(true)
  }

  const thenResultCountIs = async (wrapper: VueWrapper, count: number): Promise<void> => {
    const items = wrapper.findAll('[data-testid^="result-item-"]')
    expect(items.length).toBe(count)
  }

  const thenTrackTitleIsDisplayed = async (wrapper: VueWrapper, title: string): Promise<void> => {
    const text = wrapper.text()
    expect(text).toContain(title)
  }

  const thenTrackArtistIsDisplayed = async (wrapper: VueWrapper, artist: string): Promise<void> => {
    const text = wrapper.text()
    expect(text).toContain(artist)
  }

  const thenTrackAlbumIsDisplayed = async (wrapper: VueWrapper, album: string): Promise<void> => {
    const text = wrapper.text()
    expect(text).toContain(album)
  }

  const thenPlayButtonsAreVisible = async (wrapper: VueWrapper, count: number): Promise<void> => {
    const buttons = wrapper.findAll('[data-testid^="play-button-"]')
    expect(buttons.length).toBe(count)
  }

  const thenPlayEventIsEmitted = async (wrapper: VueWrapper, trackId: string): Promise<void> => {
    const emittedTrack = getTrackPlayEmission(wrapper)
    // Event now emits the complete track object instead of just the ID
    expect(emittedTrack?.id).toBe(trackId)
  }

  const thenPlayAlbumEventIsEmitted = async (
    wrapper: VueWrapper,
    albumId: string,
  ): Promise<void> => {
    const emitted = wrapper.emitted('play-album')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]).toEqual([albumId])
  }

  const thenListHasCleanStyling = async (wrapper: VueWrapper): Promise<void> => {
    const list = wrapper.find('[data-testid="results-list"]')
    // Check for spacing, borders, etc.
    expect(list.classes()).toEqual(expect.arrayContaining([expect.stringMatching(/space-y/)]))
  }

  const thenPlayButtonsHaveMinimumTouchTarget = async (wrapper: VueWrapper): Promise<void> => {
    const buttons = wrapper.findAll('[data-testid^="play-button-"]')
    buttons.forEach((button) => {
      // Check for min-w-11 min-h-11 (44px)
      expect(button.classes()).toEqual(
        expect.arrayContaining([expect.stringMatching(/min-(w|h)-11/)]),
      )
    })
  }

  const thenListHasKeyboardNavigation = async (wrapper: VueWrapper): Promise<void> => {
    // Headless UI Listbox provides keyboard navigation automatically
    // Check that Listbox component exists (via options element)
    const listOptions = wrapper.find('[role="listbox"]')
    expect(listOptions.exists()).toBe(true)
  }

  // AC4 (Story 9.4): Add to Queue button for local albums in SearchResultsList
  describe('Story 9.4 — Add Album to Queue from Search Results (AC4)', () => {
    it('AC4: local album (with albumId) shows an Add to Queue button', async () => {
      const localAlbum: AlbumResult = {
        id: '123',
        albumId: '123',
        title: 'The Wall',
        artist: 'Pink Floyd',
        trackCount: 26,
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const addToQueueBtn = w.find('[data-testid="add-album-to-queue-button-123"]')
      expect(addToQueueBtn.exists()).toBe(true)
    })

    it('AC4: streaming album (no albumId) does NOT show Add to Queue button', async () => {
      const streamingAlbum: AlbumResult = {
        id: 'pink floyd::the wall',
        // no albumId
        title: 'The Wall',
        artist: 'Pink Floyd',
        source: 'tidal',
        trackCount: 26,
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const addToQueueBtn = w.find('[data-testid^="add-album-to-queue-button-"]')
      expect(addToQueueBtn.exists()).toBe(false)
    })
  })

  // Story 9.5: Search result parity — streaming albums with trackUrls get Play + Queue buttons
  describe('Story 9.5 — Streaming album Play/Queue from Search Results', () => {
    it('AC1: streaming album WITH trackUrls shows a Play button', async () => {
      const streamingAlbum: AlbumResult = {
        id: 'pink floyd::the wall',
        title: 'The Wall',
        artist: 'Pink Floyd',
        source: 'tidal',
        trackCount: 2,
        trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const playBtn = w.find('[data-testid="play-album-button-pink floyd::the wall"]')
      expect(playBtn.exists()).toBe(true)
    })

    it('AC2: streaming album WITH trackUrls shows an Add to Queue button', async () => {
      const streamingAlbum: AlbumResult = {
        id: 'pink floyd::the wall',
        title: 'The Wall',
        artist: 'Pink Floyd',
        source: 'tidal',
        trackCount: 2,
        trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const addBtn = w.find('[data-testid="add-album-to-queue-button-pink floyd::the wall"]')
      expect(addBtn.exists()).toBe(true)
    })

    it('AC3: streaming album WITHOUT trackUrls still shows streaming badge', async () => {
      const streamingAlbum: AlbumResult = {
        id: 'pink floyd::the wall',
        title: 'The Wall',
        artist: 'Pink Floyd',
        source: 'tidal',
        trackCount: 26,
        // no trackUrls
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const badge = w.find('[data-testid="album-streaming-badge"]')
      expect(badge.exists()).toBe(true)
      const playBtn = w.find('[data-testid^="play-album-button-"]')
      expect(playBtn.exists()).toBe(false)
    })

    it('AC4: streaming album WITH trackUrls does NOT show static streaming badge', async () => {
      const streamingAlbum: AlbumResult = {
        id: 'pink floyd::the wall',
        title: 'The Wall',
        artist: 'Pink Floyd',
        source: 'tidal',
        trackCount: 2,
        trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [streamingAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const badge = w.find('[data-testid="album-streaming-badge"]')
      expect(badge.exists()).toBe(false)
    })
  })

  // Story 9.6: Tidal album play from search → use play-tidal-search-album endpoint
  describe('Story 9.6 — Tidal Album Full Playback from Search', () => {
    const tidalAlbum: AlbumResult = {
      id: 'sabrina carpenter::short n sweet',
      title: "Short n' Sweet",
      artist: 'Sabrina Carpenter',
      source: 'tidal',
      trackCount: 12,
      trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
    }

    it('AC1: play button on Tidal album calls /api/playback/play-tidal-search-album', async () => {
      const { playTidalSearchAlbum } = await import('@/platform/api/playbackApi')
      const mockPlayTidal = vi.mocked(playTidalSearchAlbum)

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const playBtn = w.find('[data-testid="play-album-button-sabrina carpenter::short n sweet"]')
      await playBtn.trigger('click')
      await nextTick()

      expect(mockPlayTidal).toHaveBeenCalledWith("Short n' Sweet", 'Sabrina Carpenter', [
        'tidal://111.flc',
        'tidal://222.flc',
      ])
    })

    it('AC3: add-to-queue button on Tidal album calls /api/queue/add-tidal-search-album', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }))

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const addBtn = w.find(
        '[data-testid="add-album-to-queue-button-sabrina carpenter::short n sweet"]',
      )
      await addBtn.trigger('click')
      await nextTick()

      const fetchMock = vi.mocked(globalThis.fetch)
      const { url, options } = getFetchCall(fetchMock, 0)
      expect(url).toContain('/api/queue/add-tidal-search-album')
      const body = parseTrackListRequestBody(options.body)
      expect(body.albumTitle).toBe("Short n' Sweet")
      expect(body.artist).toBe('Sabrina Carpenter')
      expect(body.trackUrls).toEqual(['tidal://111.flc', 'tidal://222.flc'])
    })

    it('AC5: play button on non-Tidal streaming album still calls /api/playback/play-track-list', async () => {
      const { playTrackList } = await import('@/platform/api/playbackApi')
      const mockPlayTrackList = vi.mocked(playTrackList)

      const qobuzAlbum: AlbumResult = {
        id: 'pink floyd::wish you were here',
        title: 'Wish You Were Here',
        artist: 'Pink Floyd',
        source: 'qobuz',
        trackCount: 5,
        trackUrls: ['qobuz://111', 'qobuz://222'],
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [qobuzAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const playBtn = w.find('[data-testid="play-album-button-pink floyd::wish you were here"]')
      await playBtn.trigger('click')
      await nextTick()

      expect(mockPlayTrackList).toHaveBeenCalledWith(['qobuz://111', 'qobuz://222'])
    })
  })

  // ============================================================
  // Story 9.7 Acceptance Tests (Task 0 — RED phase)
  // ============================================================

  describe('Story 9.7 — Tidal Artist Navigation from Search Results', () => {
    it('AC1: Tidal track with undefined artistId renders artist name as clickable link', async () => {
      // Tidal tracks have no artistId (undefined) — link must still render after v-if="result.artist" fix
      const tidalTrack: TrackResult = {
        id: 'tidal-track-1',
        title: 'Short n Sweet',
        artist: 'Sabrina Carpenter',
        // artistId intentionally omitted (undefined) — Tidal track has no LMS artistId
        source: 'tidal',
        url: 'tidal://123.flc',
        album: '',
        availableSources: [],
      }
      const w = mount(SearchResultsList, {
        props: { results: [tidalTrack], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistLink = w.find('[data-testid="track-artist-link"]')
      expect(artistLink.exists()).toBe(true)
    })

    it('AC1: clicking Tidal track artist link emits navigate-artist with { artistId: null, name }', async () => {
      // artistId is undefined → result.artistId ?? null evaluates to null in emit
      const tidalTrack: TrackResult = {
        id: 'tidal-track-1',
        title: 'Short n Sweet',
        artist: 'Sabrina Carpenter',
        // artistId intentionally omitted (undefined)
        source: 'tidal',
        url: 'tidal://123.flc',
        album: '',
        availableSources: [],
      }
      const w = mount(SearchResultsList, {
        props: { results: [tidalTrack], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistLink = w.find('[data-testid="track-artist-link"]')
      await artistLink.trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-artist')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ artistId: null, name: 'Sabrina Carpenter' }])
    })

    it('AC2: Tidal album card with trackUrls renders "Go to Artist" button', async () => {
      const tidalAlbumWithTracks: AlbumResult = {
        id: 'tidal-album-1',
        title: 'Short n Sweet',
        artist: 'Sabrina Carpenter',
        source: 'tidal',
        trackCount: 1,
        trackUrls: ['tidal://1.flc'],
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbumWithTracks], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const button = w.find('[data-testid="go-to-artist-button-tidal-album-1"]')
      expect(button.exists()).toBe(true)
    })

    it('AC2: clicking "Go to Artist" on Tidal album emits navigate-artist with { artistId: null, name }', async () => {
      const tidalAlbumWithTracks: AlbumResult = {
        id: 'tidal-album-1',
        title: 'Short n Sweet',
        artist: 'Sabrina Carpenter',
        source: 'tidal',
        trackCount: 1,
        trackUrls: ['tidal://1.flc'],
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbumWithTracks], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const button = w.find('[data-testid="go-to-artist-button-tidal-album-1"]')
      await button.trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-artist')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ artistId: null, name: 'Sabrina Carpenter' }])
    })

    it('AC5 (regression): local track artist link emits navigate-artist with string artistId', async () => {
      const localTrack: TrackResult = {
        id: 'local-track-1',
        title: 'Some Track',
        artist: 'Local Artist',
        artistId: '42',
        source: 'local',
        url: 'file:///music/track.flac',
        album: '',
      }
      const w = mount(SearchResultsList, {
        props: { results: [localTrack], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const artistLink = w.find('[data-testid="track-artist-link"]')
      expect(artistLink.exists()).toBe(true)
      await artistLink.trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-artist')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ artistId: '42', name: 'Local Artist' }])
    })

    // Code review additions (M1 source guard, M2 edge case, M3 local album, L1 empty artist)

    it('M1 (source guard): non-Tidal streaming album with trackUrls does NOT show "Go to Artist" button', async () => {
      // Go to Artist is Tidal-specific — other streaming sources must not get the button
      // because the navigate-artist null-path calls searchTidalArtists (wrong for other sources)
      const qobuzAlbum: AlbumResult = {
        id: 'qobuz-album-1',
        title: 'Some Album',
        artist: 'Some Artist',
        source: 'qobuz',
        trackCount: 3,
        trackUrls: ['qobuz://1.flac', 'qobuz://2.flac'],
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [qobuzAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      expect(w.find('[data-testid="go-to-artist-button-qobuz-album-1"]').exists()).toBe(false)
    })

    it('L1 (boundary): Tidal album with empty artist does NOT show "Go to Artist" button', async () => {
      // v-if="album.source === 'tidal' && album.artist" — empty string is falsy → no button
      const tidalAlbumNoArtist: AlbumResult = {
        id: 'tidal-album-noartist',
        title: 'Unknown Album',
        artist: '',
        source: 'tidal',
        trackCount: 1,
        trackUrls: ['tidal://1.flc'],
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [tidalAlbumNoArtist], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      expect(w.find('[data-testid="go-to-artist-button-tidal-album-noartist"]').exists()).toBe(
        false,
      )
    })

    it('M3: local album with albumId shows "Go to Artist" button (parity with Tidal)', async () => {
      const localAlbum: AlbumResult = {
        id: 'local-album-1',
        albumId: 'local-album-1',
        title: 'The Wall',
        artist: 'Pink Floyd',
        artistId: '42',
        source: 'local',
        trackCount: 26,
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      expect(w.find('[data-testid="go-to-artist-button-local-album-1"]').exists()).toBe(true)
    })

    it('M3: clicking "Go to Artist" on local album emits navigate-artist with string artistId', async () => {
      const localAlbum: AlbumResult = {
        id: 'local-album-1',
        albumId: 'local-album-1',
        title: 'The Wall',
        artist: 'Pink Floyd',
        artistId: '42',
        source: 'local',
        trackCount: 26,
      }
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      await w.find('[data-testid="go-to-artist-button-local-album-1"]').trigger('click')
      await nextTick()

      const emitted = w.emitted('navigate-artist')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ artistId: '42', name: 'Pink Floyd' }])
    })

    it('M2 (edge case): local track with artist name but no artistId emits navigate-artist with null artistId', async () => {
      // Edge case: a local track missing artistId would trigger Tidal lookup via null path.
      // This documents the behavior so any future change to this path is caught.
      const localTrackNoArtistId: TrackResult = {
        id: 'local-no-artistid',
        title: 'Orphan Track',
        artist: 'Unknown Artist',
        // artistId intentionally absent — unusual but theoretically possible
        source: 'local',
        url: 'file:///music/orphan.flac',
        album: '',
      }
      const w = mount(SearchResultsList, {
        props: { results: [localTrackNoArtistId], artists: [], albums: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      // Artist link renders because result.artist is truthy
      const artistLink = w.find('[data-testid="track-artist-link"]')
      expect(artistLink.exists()).toBe(true)

      await artistLink.trigger('click')
      await nextTick()

      // artistId ?? null → null: falls back to Tidal artist name lookup in SearchPanel
      const emitted = w.emitted('navigate-artist')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([{ artistId: null, name: 'Unknown Artist' }])
    })
  })

  // ============================================================
  // Story 9.8: Cover Art Unification in Search Results (AC1-AC3)
  // ============================================================

  describe('Story 9.8 — Cover Art Unification in Search Results', () => {
    it('AC1: local album with coverArtUrl renders <img> instead of ♪ placeholder', async () => {
      const localAlbumWithArt: AlbumResult = {
        id: '55',
        albumId: '55',
        title: 'Dark Side of the Moon',
        artist: 'Pink Floyd',
        trackCount: 10,
        source: 'local',
        coverArtUrl: 'http://localhost:9000/music/aabbcc/cover.jpg',
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbumWithArt], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const cover = w.find('[data-testid="album-result-cover"]')
      expect(cover.exists()).toBe(true)
      const img = cover.find('img')
      expect(img.exists()).toBe(true)
      expect(img.attributes('src')).toBe('http://localhost:9000/music/aabbcc/cover.jpg')
      // ♪ placeholder should NOT be visible when img present
      const placeholder = cover.find('span')
      expect(placeholder.exists()).toBe(false)
    })

    it('AC2: album without coverArtUrl renders ♪ placeholder (Tidal or local without art)', async () => {
      const albumNoArt: AlbumResult = {
        id: 'tidal::no-art',
        title: 'Short n Sweet',
        artist: 'Sabrina Carpenter',
        trackCount: 12,
        source: 'tidal',
        // no coverArtUrl
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [albumNoArt], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const cover = w.find('[data-testid="album-result-cover"]')
      expect(cover.exists()).toBe(true)
      const placeholder = cover.find('span')
      expect(placeholder.exists()).toBe(true)
      expect(placeholder.text()).toBe('♪')
      const img = cover.find('img')
      expect(img.exists()).toBe(false)
    })

    it('AC3: cover img load error shows ♪ placeholder fallback', async () => {
      const localAlbumWithBrokenArt: AlbumResult = {
        id: '66',
        albumId: '66',
        title: 'The Wall',
        artist: 'Pink Floyd',
        trackCount: 26,
        source: 'local',
        coverArtUrl: 'http://localhost:9000/music/broken/cover.jpg',
      }

      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbumWithBrokenArt], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const cover = w.find('[data-testid="album-result-cover"]')
      const img = cover.find('img')
      expect(img.exists()).toBe(true)

      // Trigger error event on the img
      await img.trigger('error')
      await nextTick()

      // After error, img should be hidden and ♪ placeholder shown
      const imgAfterError = cover.find('img')
      expect(imgAfterError.exists()).toBe(false)
      const placeholder = cover.find('span')
      expect(placeholder.exists()).toBe(true)
      expect(placeholder.text()).toBe('♪')
    })
  })

  // ============================================================
  // Story 9.15 Acceptance Tests — Mobile Responsive Album Card (AC4)
  // ============================================================

  // Story 9.15 AC5: track list has overflow-x-hidden to prevent horizontal scroll on phone
  describe('Story 9.15 — Track list overflow fix on phone (AC5)', () => {
    it('AC5: results-list container has overflow-x-hidden to prevent horizontal scroll', async () => {
      const track: TrackResult = {
        id: 'ac5-track',
        title: 'Some Track',
        artist: 'Some Artist',
        album: 'Some Album',
        url: 'track://ac5',
        source: 'local',
      }
      const w = mount(SearchResultsList, {
        props: { results: [track], albums: [], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const resultsList = w.find('[data-testid="results-list"]')
      expect(resultsList.exists()).toBe(true)
      expect(resultsList.classes()).toContain('overflow-x-hidden')
    })
  })

  describe('Story 9.15 — Album card overflow fix on phone (AC4)', () => {
    const localAlbum: AlbumResult = {
      id: '123',
      albumId: '123',
      title: 'The Dark Side of the Moon',
      artist: 'Pink Floyd',
      trackCount: 10,
      source: 'local',
    }

    it('AC4: Play Album button text label has hidden class for icon-only display on phone', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const playBtn = w.find('[data-testid="play-album-button-123"]')
      expect(playBtn.exists()).toBe(true)

      // The text label span must have 'hidden' class so it's hidden on phone (sm:inline shows it on tablet+)
      const textLabel = playBtn.find('[data-testid="play-album-text"]')
      expect(textLabel.exists()).toBe(true)
      expect(textLabel.classes()).toContain('hidden')
    })

    it('AC4: Album info div has min-w-0 to prevent overflow', async () => {
      const w = mount(SearchResultsList, {
        props: { results: [], albums: [localAlbum], artists: [] },
        global: { plugins: [await createRouter()] },
      })
      await nextTick()

      const albumInfo = w.find('[data-testid="album-result-info"]')
      expect(albumInfo.exists()).toBe(true)
      expect(albumInfo.classes()).toContain('min-w-0')
    })
  })
})
