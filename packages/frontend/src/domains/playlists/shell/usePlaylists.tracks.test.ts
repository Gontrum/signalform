import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { PlaylistTrack } from '@/platform/api/playlistsApi'

vi.mock('@/platform/api/playlistsApi', () => ({
  savePlaylist: vi.fn(),
  listPlaylists: vi.fn(),
  loadPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  renamePlaylist: vi.fn(),
  getPlaylistTracks: vi.fn(),
  removePlaylistTrack: vi.fn(),
}))

vi.mock('@/domains/queue/shell/useQueueStore', () => ({
  useQueueStore: vi.fn(() => ({ fetchQueue: vi.fn() })),
}))

// Import AFTER mocks
import { usePlaylists } from './usePlaylists'
import { listPlaylists, getPlaylistTracks, removePlaylistTrack } from '@/platform/api/playlistsApi'

const mockListPlaylists = vi.mocked(listPlaylists)
const mockGetPlaylistTracks = vi.mocked(getPlaylistTracks)
const mockRemovePlaylistTrack = vi.mocked(removePlaylistTrack)

const mountComposable = async (): Promise<{
  readonly result: ReturnType<typeof usePlaylists>
}> => {
  let result: ReturnType<typeof usePlaylists> | undefined
  const TestComponent = defineComponent({
    setup(): () => VNode {
      result = usePlaylists()
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  return { result: result! }
}

// Positions 5-7 of a longer playlist, so an implementation that hands back
// array positions instead of the server's `index` is visible.
const pageA: readonly PlaylistTrack[] = [
  { index: 5, title: 'Zoo Station', artist: 'U2', album: 'Achtung Baby', duration: 276 },
  { index: 6, title: 'Anthem', artist: 'Leonard Cohen', album: 'The Future' },
  { index: 7, title: 'Bad', artist: 'U2', album: 'The Unforgettable Fire', duration: 366 },
]

const pageB: readonly PlaylistTrack[] = [
  { index: 0, title: 'Teardrop', artist: 'Massive Attack', album: 'Mezzanine', duration: 330 },
]

describe('usePlaylists – track list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPlaylists.mockResolvedValue([
      { id: 'a', name: 'One' },
      { id: 'b', name: 'Two' },
    ])
    mockGetPlaylistTracks.mockResolvedValue({ tracks: pageA, hasMore: false })
    mockRemovePlaylistTrack.mockResolvedValue(true)
  })

  it('starts with no playlist expanded and no tracks', async () => {
    const { result } = await mountComposable()

    expect(result.expandedId.value).toBeUndefined()
    expect(result.tracks.value).toEqual([])
    expect(mockGetPlaylistTracks).not.toHaveBeenCalled()
  })

  it('loads the first page of tracks when a row is expanded', async () => {
    const { result } = await mountComposable()

    await result.toggleTracks('a')

    expect(mockGetPlaylistTracks).toHaveBeenCalledWith('a', 250, 0)
    expect(result.expandedId.value).toBe('a')
    expect(result.tracks.value).toEqual(pageA)
    expect(result.isTracksLoading.value).toBe(false)
  })

  it('collapses and drops the tracks when the same row is toggled again', async () => {
    const { result } = await mountComposable()

    await result.toggleTracks('a')
    mockGetPlaylistTracks.mockClear()
    await result.toggleTracks('a')

    expect(result.expandedId.value).toBeUndefined()
    expect(result.tracks.value).toEqual([])
    expect(mockGetPlaylistTracks).not.toHaveBeenCalled()
  })

  it('closes the first row when a second one is expanded', async () => {
    const { result } = await mountComposable()

    await result.toggleTracks('a')
    mockGetPlaylistTracks.mockResolvedValue({ tracks: pageB, hasMore: false })
    await result.toggleTracks('b')

    expect(result.expandedId.value).toBe('b')
    expect(result.tracks.value).toEqual(pageB)
    expect(mockGetPlaylistTracks).toHaveBeenLastCalledWith('b', 250, 0)
  })

  it('sets the error and stays collapsed when the track load fails', async () => {
    mockGetPlaylistTracks.mockResolvedValue(undefined)
    const { result } = await mountComposable()

    await result.toggleTracks('a')

    expect(result.error.value).toBe(true)
    // An open, empty panel would read as "this playlist has no tracks".
    expect(result.expandedId.value).toBeUndefined()
    expect(result.tracks.value).toEqual([])
  })

  it('sets the error and stays collapsed when getPlaylistTracks throws', async () => {
    mockGetPlaylistTracks.mockRejectedValue(new Error('network'))
    const { result } = await mountComposable()

    await result.toggleTracks('a')

    expect(result.error.value).toBe(true)
    expect(result.expandedId.value).toBeUndefined()
  })

  it('clears a stale error when a later expand succeeds', async () => {
    mockGetPlaylistTracks.mockResolvedValueOnce(undefined)
    const { result } = await mountComposable()

    await result.toggleTracks('a')
    expect(result.error.value).toBe(true)

    await result.toggleTracks('a')

    expect(result.error.value).toBe(false)
    expect(result.tracks.value).toEqual(pageA)
  })

  describe('paging', () => {
    it('appends the next page at the offset of what is already loaded', async () => {
      mockGetPlaylistTracks.mockResolvedValue({ tracks: pageA, hasMore: true })
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      expect(result.hasMoreTracks.value).toBe(true)

      mockGetPlaylistTracks.mockResolvedValue({ tracks: pageB, hasMore: false })
      await result.loadMoreTracks()

      expect(mockGetPlaylistTracks).toHaveBeenLastCalledWith('a', 250, 3)
      expect(result.tracks.value.map((track) => track.index)).toEqual([5, 6, 7, 0])
      expect(result.hasMoreTracks.value).toBe(false)
    })

    it('does nothing when the server said there is no further page', async () => {
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetPlaylistTracks.mockClear()

      await result.loadMoreTracks()

      expect(mockGetPlaylistTracks).not.toHaveBeenCalled()
    })

    it('keeps the loaded pages and sets the error when the next page fails', async () => {
      mockGetPlaylistTracks.mockResolvedValue({ tracks: pageA, hasMore: true })
      const { result } = await mountComposable()
      await result.toggleTracks('a')

      mockGetPlaylistTracks.mockResolvedValue(undefined)
      await result.loadMoreTracks()

      expect(result.tracks.value).toEqual(pageA)
      expect(result.error.value).toBe(true)
    })
  })

  describe('removeTrack', () => {
    it('sends the position the server gave, not the array position', async () => {
      const { result } = await mountComposable()
      await result.toggleTracks('a')

      await result.removeTrack(7)

      expect(mockRemovePlaylistTrack).toHaveBeenCalledWith('a', 7)
    })

    it('sends index 0 for the first track', async () => {
      mockGetPlaylistTracks.mockResolvedValue({ tracks: pageB, hasMore: false })
      const { result } = await mountComposable()
      await result.toggleTracks('b')

      await result.removeTrack(0)

      expect(mockRemovePlaylistTrack).toHaveBeenCalledWith('b', 0)
    })

    it('reloads the tracks from the server after a successful removal', async () => {
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetPlaylistTracks.mockClear()

      const afterRemoval: readonly PlaylistTrack[] = [
        { index: 5, title: 'Zoo Station', artist: 'U2', album: 'Achtung Baby', duration: 276 },
        // "Bad" moved from 7 to 6 when "Anthem" was removed.
        { index: 6, title: 'Bad', artist: 'U2', album: 'The Unforgettable Fire', duration: 366 },
      ]
      mockGetPlaylistTracks.mockResolvedValue({ tracks: afterRemoval, hasMore: false })

      await result.removeTrack(6)

      // Splicing the removed entry out locally would leave "Bad" at index 7 —
      // and the next delete would then hit whatever really sits at 7.
      expect(mockGetPlaylistTracks).toHaveBeenCalledTimes(1)
      expect(mockGetPlaylistTracks).toHaveBeenCalledWith('a', 250, 0)
      expect(result.tracks.value).toEqual(afterRemoval)
    })

    it('re-requests a window as large as what was on screen', async () => {
      mockGetPlaylistTracks.mockResolvedValue({ tracks: pageA, hasMore: true })
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetPlaylistTracks.mockResolvedValue({
        tracks: Array.from({ length: 400 }, (_unused, position) => ({
          index: position,
          title: `T${String(position)}`,
          artist: 'A',
          album: 'B',
        })),
        hasMore: true,
      })
      await result.loadMoreTracks()
      expect(result.tracks.value).toHaveLength(403)
      mockGetPlaylistTracks.mockClear()
      mockGetPlaylistTracks.mockResolvedValue({ tracks: pageA, hasMore: true })

      await result.removeTrack(1)

      // A fixed 250 here would silently truncate the open list to one page.
      expect(mockGetPlaylistTracks).toHaveBeenCalledWith('a', 403, 0)
    })

    it('sets the error and leaves the list untouched when the removal fails', async () => {
      mockRemovePlaylistTrack.mockResolvedValue(false)
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetPlaylistTracks.mockClear()

      await result.removeTrack(6)

      expect(mockGetPlaylistTracks).not.toHaveBeenCalled()
      expect(result.tracks.value).toEqual(pageA)
      expect(result.expandedId.value).toBe('a')
      expect(result.error.value).toBe(true)
    })

    it('sets the error and leaves the list untouched when removePlaylistTrack throws', async () => {
      mockRemovePlaylistTrack.mockRejectedValue(new Error('network'))
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetPlaylistTracks.mockClear()

      await result.removeTrack(6)

      expect(mockGetPlaylistTracks).not.toHaveBeenCalled()
      expect(result.tracks.value).toEqual(pageA)
      expect(result.error.value).toBe(true)
    })

    it('drops the now-stale list when the reload after a removal fails', async () => {
      const { result } = await mountComposable()
      await result.toggleTracks('a')
      mockGetPlaylistTracks.mockResolvedValue(undefined)

      await result.removeTrack(6)

      // The remaining indices have shifted; showing them invites a delete
      // that lands on the wrong track.
      expect(result.tracks.value).toEqual([])
      expect(result.expandedId.value).toBeUndefined()
      expect(result.error.value).toBe(true)
    })

    it('ignores a second removal while the first is still in flight', async () => {
      let releaseFirst: ((removed: boolean) => void) | undefined
      mockRemovePlaylistTrack.mockImplementationOnce(
        async () =>
          await new Promise<boolean>((resolve) => {
            releaseFirst = resolve
          }),
      )
      const { result } = await mountComposable()
      await result.toggleTracks('a')

      const first = result.removeTrack(6)
      await result.removeTrack(7)

      // Index 7 is already stale while the removal of 6 is unconfirmed.
      expect(mockRemovePlaylistTrack).toHaveBeenCalledTimes(1)
      expect(mockRemovePlaylistTrack).toHaveBeenCalledWith('a', 6)
      expect(result.isRemovingTrack.value).toBe(true)

      releaseFirst?.(true)
      await first
      expect(result.isRemovingTrack.value).toBe(false)
    })

    it('does nothing when no playlist is expanded', async () => {
      const { result } = await mountComposable()

      await result.removeTrack(3)

      expect(mockRemovePlaylistTrack).not.toHaveBeenCalled()
    })
  })
})
