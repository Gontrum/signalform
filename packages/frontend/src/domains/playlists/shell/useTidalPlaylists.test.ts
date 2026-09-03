import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { TidalPlaylistTrack } from '@/platform/api/tidalPlaylistsApi'

vi.mock('@/platform/api/tidalPlaylistsApi', () => ({
  listTidalPlaylists: vi.fn(),
  getTidalPlaylistTracks: vi.fn(),
  playTidalPlaylist: vi.fn(),
}))

const fetchQueueMock = vi.fn<() => Promise<void>>()
vi.mock('@/domains/queue/shell/useQueueStore', () => ({
  useQueueStore: vi.fn(() => ({ fetchQueue: fetchQueueMock })),
}))

// Import AFTER mocks
import { useTidalPlaylists } from './useTidalPlaylists'
import {
  listTidalPlaylists,
  getTidalPlaylistTracks,
  playTidalPlaylist,
} from '@/platform/api/tidalPlaylistsApi'

const mockListTidalPlaylists = vi.mocked(listTidalPlaylists)
const mockGetTidalPlaylistTracks = vi.mocked(getTidalPlaylistTracks)
const mockPlayTidalPlaylist = vi.mocked(playTidalPlaylist)

const mountComposable = async (): Promise<{
  readonly result: ReturnType<typeof useTidalPlaylists>
}> => {
  let result: ReturnType<typeof useTidalPlaylists> | undefined
  const TestComponent = defineComponent({
    setup(): () => VNode {
      result = useTidalPlaylists()
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  return { result: result! }
}

// Positions 5-7 of a longer playlist, so an implementation that hands back
// array positions instead of the server's `position` is visible.
const pageA: readonly TidalPlaylistTrack[] = [
  {
    id: 't5',
    position: 5,
    title: 'Zoo Station',
    url: 'tidal://5',
    coverArtUrl: 'art5',
    duration: 276,
  },
  { id: 't6', position: 6, title: 'Anthem', url: 'tidal://6', coverArtUrl: 'art6' },
  { id: 't7', position: 7, title: 'Bad', url: 'tidal://7', coverArtUrl: 'art7', duration: 366 },
]

const pageB: readonly TidalPlaylistTrack[] = [
  {
    id: 't0',
    position: 0,
    title: 'Teardrop',
    url: 'tidal://0',
    coverArtUrl: 'art0',
    duration: 330,
  },
]

describe('useTidalPlaylists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListTidalPlaylists.mockResolvedValue([
      { id: 'a', name: 'One', coverArtUrl: 'cover-a' },
      { id: 'b', name: 'Two', coverArtUrl: 'cover-b' },
    ])
    mockGetTidalPlaylistTracks.mockResolvedValue({ tracks: pageA, totalCount: 3, hasMore: false })
    mockPlayTidalPlaylist.mockResolvedValue(true)
    fetchQueueMock.mockResolvedValue(undefined)
  })

  describe('fetchList', () => {
    it('fetches the list on mount and fills playlists', async () => {
      const { result } = await mountComposable()

      expect(mockListTidalPlaylists).toHaveBeenCalled()
      expect(result.playlists.value).toEqual([
        { id: 'a', name: 'One', coverArtUrl: 'cover-a' },
        { id: 'b', name: 'Two', coverArtUrl: 'cover-b' },
      ])
      expect(result.isLoading.value).toBe(false)
    })

    it('sets error and keeps playlists empty when listTidalPlaylists throws', async () => {
      mockListTidalPlaylists.mockRejectedValue(new Error('network'))

      const { result } = await mountComposable()

      expect(result.error.value).toBe(true)
      expect(result.playlists.value).toEqual([])
    })
  })

  describe('play', () => {
    it('calls playTidalPlaylist then refreshes the queue', async () => {
      const { result } = await mountComposable()

      await result.play('a')

      expect(mockPlayTidalPlaylist).toHaveBeenCalledWith('a')
      expect(fetchQueueMock).toHaveBeenCalledTimes(1)
      expect(result.playingId.value).toBeUndefined()
      expect(result.error.value).toBe(false)
    })

    it('ignores a second play while one is already starting', async () => {
      let releaseFirst: ((started: boolean) => void) | undefined
      mockPlayTidalPlaylist.mockImplementationOnce(
        async () =>
          await new Promise<boolean>((resolve) => {
            releaseFirst = resolve
          }),
      )
      const { result } = await mountComposable()

      const first = result.play('a')
      await result.play('b')

      expect(mockPlayTidalPlaylist).toHaveBeenCalledTimes(1)
      expect(mockPlayTidalPlaylist).toHaveBeenCalledWith('a')
      expect(result.playingId.value).toBe('a')

      releaseFirst?.(true)
      await first
      expect(result.playingId.value).toBeUndefined()
    })

    it('sets error and resets playingId when playback fails to start', async () => {
      mockPlayTidalPlaylist.mockResolvedValue(false)
      const { result } = await mountComposable()

      await result.play('a')

      expect(result.error.value).toBe(true)
      expect(result.playingId.value).toBeUndefined()
      expect(fetchQueueMock).not.toHaveBeenCalled()
    })
  })

  describe('toggleTracks', () => {
    it('opens: loads the first page and sets trackCount', async () => {
      const { result } = await mountComposable()

      await result.toggleTracks('a')

      expect(mockGetTidalPlaylistTracks).toHaveBeenCalledWith('a', 250, 0)
      expect(result.expandedId.value).toBe('a')
      expect(result.tracks.value).toEqual(pageA)
      expect(result.trackCount.value).toBe(3)
      expect(result.isTracksLoading.value).toBe(false)
    })

    it('closes on a second call for the same id', async () => {
      const { result } = await mountComposable()

      await result.toggleTracks('a')
      mockGetTidalPlaylistTracks.mockClear()
      await result.toggleTracks('a')

      expect(result.expandedId.value).toBeUndefined()
      expect(result.tracks.value).toEqual([])
      expect(result.trackCount.value).toBeUndefined()
      expect(mockGetTidalPlaylistTracks).not.toHaveBeenCalled()
    })

    it('discards the response for a playlist that has since been closed or replaced', async () => {
      let releaseFirst:
        ((page: Awaited<ReturnType<typeof getTidalPlaylistTracks>>) => void) | undefined
      mockGetTidalPlaylistTracks.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            releaseFirst = resolve
          }),
      )
      const { result } = await mountComposable()

      const openA = result.toggleTracks('a')
      mockGetTidalPlaylistTracks.mockResolvedValue({ tracks: pageB, totalCount: 1, hasMore: false })
      await result.toggleTracks('b')

      releaseFirst?.({ tracks: pageA, totalCount: 3, hasMore: false })
      await openA

      expect(result.expandedId.value).toBe('b')
      expect(result.tracks.value).toEqual(pageB)
      expect(result.trackCount.value).toBe(1)
    })
  })

  describe('loadMoreTracks', () => {
    it('appends the next page at the offset of what is already loaded', async () => {
      mockGetTidalPlaylistTracks.mockResolvedValue({ tracks: pageA, totalCount: 4, hasMore: true })
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      expect(result.hasMoreTracks.value).toBe(true)

      mockGetTidalPlaylistTracks.mockResolvedValue({ tracks: pageB, totalCount: 4, hasMore: false })
      await result.loadMoreTracks()

      expect(mockGetTidalPlaylistTracks).toHaveBeenLastCalledWith('a', 250, 3)
      expect(result.tracks.value.map((track) => track.position)).toEqual([5, 6, 7, 0])
      expect(result.hasMoreTracks.value).toBe(false)
    })

    it('does nothing when the server said there is no further page', async () => {
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetTidalPlaylistTracks.mockClear()

      await result.loadMoreTracks()

      expect(mockGetTidalPlaylistTracks).not.toHaveBeenCalled()
    })
  })
})
