/**
 * useSearchResultsActions — onAlbumCoverLoad Unit Tests
 *
 * Tests the Tidal cover fallback logic without mounting a component.
 * The composable is called directly; `onAlbumCoverLoad` receives
 * a synthetic Event with a fake HTMLImageElement target.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { err, ok } from '@signalform/shared'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSearchTidalArtists, mockQueueFetch } = vi.hoisted(() => ({
  mockSearchTidalArtists: vi.fn(),
  mockQueueFetch: vi.fn(),
}))

vi.mock('@/platform/api/tidalArtistsApi', () => ({
  searchTidalArtists: mockSearchTidalArtists,
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playTrackList: vi.fn(),
  playTidalSearchAlbum: vi.fn(),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addToQueue: vi.fn(),
  addAlbumToQueue: vi.fn(),
  addTrackListToQueue: vi.fn(),
  addTidalSearchAlbumToQueue: vi.fn(),
}))

vi.mock('@/domains/playback/shell/usePlaybackStore', () => ({
  usePlaybackStore: (): { readonly isCurrentlyPlaying: false; readonly currentTrack: null } => ({
    isCurrentlyPlaying: false,
    currentTrack: null,
  }),
}))

vi.mock('@/domains/queue/shell/useQueueStore', () => ({
  useQueueStore: (): { readonly fetchQueue: typeof mockQueueFetch } => ({
    fetchQueue: mockQueueFetch,
  }),
}))

vi.mock('@/domains/enrichment/shell/useArtistImage', () => ({
  useArtistImages: (): { readonly getImage: () => null } => ({ getImage: (): null => null }),
}))

vi.mock('@/app/useTransientSet', () => ({
  useTransientSet: (): {
    readonly has: () => false
    readonly add: ReturnType<typeof vi.fn>
    readonly delete: ReturnType<typeof vi.fn>
    readonly value: ReadonlySet<never>
  } => ({
    has: (): false => false,
    add: vi.fn(),
    delete: vi.fn(),
    value: new Set(),
  }),
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useSearchResultsActions } from './useSearchResultsActions'
import type { AlbumResult } from '../core/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LMS_PLACEHOLDER_SIZE = 512

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makeImageEvent = (naturalWidth: number, naturalHeight: number) => {
  // We need Object.defineProperty here because naturalWidth/naturalHeight are
  // read-only DOM properties that cannot be set directly. This is the only way
  // to simulate different image sizes in jsdom tests without mounting a component.
  const img = document.createElement('img')
  // eslint-disable-next-line functional/immutable-data
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth })
  // eslint-disable-next-line functional/immutable-data
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight })
  const event = new Event('load')
  // eslint-disable-next-line functional/immutable-data
  Object.defineProperty(event, 'target', { value: img })
  return event
}

const makeAlbum = (id = 'album-1', artist = 'Pink Floyd'): AlbumResult => ({
  id,
  title: 'Dark Side',
  artist,
  trackCount: 10,
  coverArtUrl: 'http://lms/cover.jpg',
  source: 'local' as const,
})

const makeTidalArtistResult = (
  coverArtUrl: string,
): {
  readonly ok: true
  readonly value: {
    readonly artists: readonly {
      readonly artistId: string
      readonly name: string
      readonly coverArtUrl: string
    }[]
    readonly totalCount: number
  }
} => ({
  ok: true as const,
  value: {
    artists: [{ artistId: '1', name: 'Pink Floyd', coverArtUrl }],
    totalCount: 1,
  },
})

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockQueueFetch.mockResolvedValue(undefined)
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('onAlbumCoverLoad — Tidal cover fallback', () => {
  it('does nothing when the loaded image is NOT a placeholder (not 512×512)', () => {
    const { onAlbumCoverLoad, tidalFallbackCovers } = useSearchResultsActions({})

    const event = makeImageEvent(300, 300) // real album art size
    onAlbumCoverLoad(event, makeAlbum())

    expect(mockSearchTidalArtists).not.toHaveBeenCalled()
    expect(Object.keys(tidalFallbackCovers.value)).toHaveLength(0)
  })

  it('calls searchTidalArtists when the loaded image IS a placeholder (512×512)', async () => {
    mockSearchTidalArtists.mockResolvedValue(makeTidalArtistResult(''))

    const { onAlbumCoverLoad } = useSearchResultsActions({})

    const event = makeImageEvent(LMS_PLACEHOLDER_SIZE, LMS_PLACEHOLDER_SIZE)
    onAlbumCoverLoad(event, makeAlbum())

    // Flush the promise
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockSearchTidalArtists).toHaveBeenCalledWith('Pink Floyd')
  })

  it('sets tidalFallbackCovers when searchTidalArtists returns an artist with image', async () => {
    const coverUrl = 'https://tidal.com/artist/pink-floyd.jpg'
    mockSearchTidalArtists.mockResolvedValue(makeTidalArtistResult(coverUrl))

    const { onAlbumCoverLoad, tidalFallbackCovers } = useSearchResultsActions({})
    const album = makeAlbum('album-1', 'Pink Floyd')

    const event = makeImageEvent(LMS_PLACEHOLDER_SIZE, LMS_PLACEHOLDER_SIZE)
    onAlbumCoverLoad(event, album)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(tidalFallbackCovers.value['album-1']).toBe(coverUrl)
  })

  it('does NOT call searchTidalArtists again when artist is already in cache (cache hit)', async () => {
    const coverUrl = 'https://tidal.com/artist/pink-floyd.jpg'
    mockSearchTidalArtists.mockResolvedValue(makeTidalArtistResult(coverUrl))

    const { onAlbumCoverLoad } = useSearchResultsActions({})

    const event = makeImageEvent(LMS_PLACEHOLDER_SIZE, LMS_PLACEHOLDER_SIZE)

    // First load — populates cache
    onAlbumCoverLoad(event, makeAlbum('album-1', 'Pink Floyd'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Second load with same artist — should use cache
    onAlbumCoverLoad(event, makeAlbum('album-2', 'Pink Floyd'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Should be called only once despite two cover loads
    expect(mockSearchTidalArtists).toHaveBeenCalledTimes(1)
  })

  it('does not set tidalFallbackCovers when API returns no artists with image', async () => {
    mockSearchTidalArtists.mockResolvedValue({
      ok: true,
      value: {
        artists: [{ artistId: '1', name: 'Pink Floyd', coverArtUrl: '' }],
        totalCount: 1,
      },
    })

    const { onAlbumCoverLoad, tidalFallbackCovers } = useSearchResultsActions({})

    const event = makeImageEvent(LMS_PLACEHOLDER_SIZE, LMS_PLACEHOLDER_SIZE)
    onAlbumCoverLoad(event, makeAlbum())

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(Object.keys(tidalFallbackCovers.value)).toHaveLength(0)
  })

  it('does not crash when searchTidalArtists returns an error', async () => {
    mockSearchTidalArtists.mockResolvedValue(
      err({ type: 'NETWORK_ERROR' as const, message: 'ECONNREFUSED' }),
    )

    const { onAlbumCoverLoad, tidalFallbackCovers } = useSearchResultsActions({})

    const event = makeImageEvent(LMS_PLACEHOLDER_SIZE, LMS_PLACEHOLDER_SIZE)
    onAlbumCoverLoad(event, makeAlbum())

    // Must not throw
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(Object.keys(tidalFallbackCovers.value)).toHaveLength(0)
  })

  it('does nothing when event target is not an HTMLImageElement', () => {
    const { onAlbumCoverLoad } = useSearchResultsActions({})

    const event = new Event('load') // no target
    onAlbumCoverLoad(event, makeAlbum())

    expect(mockSearchTidalArtists).not.toHaveBeenCalled()
  })
})

describe('queue synchronization after successful add actions', () => {
  it('refreshes the queue store after adding a single track to the queue', async () => {
    const { addToQueue } = await import('@/platform/api/queueApi')
    vi.mocked(addToQueue).mockResolvedValue(ok(undefined))

    const { handleAddToQueue } = useSearchResultsActions({})

    await handleAddToQueue({
      id: 'track-1',
      title: 'Toxic',
      artist: 'Britney Spears',
      album: 'In the Zone',
      url: 'file:///music/britney-spears/toxic.flac',
      source: 'local',
    })

    expect(mockQueueFetch).toHaveBeenCalledTimes(1)
  })
})
