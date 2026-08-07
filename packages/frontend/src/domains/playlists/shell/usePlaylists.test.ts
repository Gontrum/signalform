import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/platform/api/playlistsApi', () => ({
  savePlaylist: vi.fn(),
  listPlaylists: vi.fn(),
  loadPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  renamePlaylist: vi.fn(),
  getPlaylistTracks: vi.fn(),
  removePlaylistTrack: vi.fn(),
}))

const fetchQueueMock = vi.fn<() => Promise<void>>()
vi.mock('@/domains/queue/shell/useQueueStore', () => ({
  useQueueStore: vi.fn(() => ({ fetchQueue: fetchQueueMock })),
}))

// Import AFTER mocks
import { usePlaylists } from './usePlaylists'
import {
  savePlaylist,
  listPlaylists,
  loadPlaylist,
  deletePlaylist,
  renamePlaylist,
} from '@/platform/api/playlistsApi'

const mockSavePlaylist = vi.mocked(savePlaylist)
const mockListPlaylists = vi.mocked(listPlaylists)
const mockLoadPlaylist = vi.mocked(loadPlaylist)
const mockDeletePlaylist = vi.mocked(deletePlaylist)
const mockRenamePlaylist = vi.mocked(renamePlaylist)

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

describe('usePlaylists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPlaylists.mockResolvedValue([])
    mockSavePlaylist.mockResolvedValue('ok')
    mockLoadPlaylist.mockResolvedValue(true)
    mockDeletePlaylist.mockResolvedValue('ok')
    mockRenamePlaylist.mockResolvedValue('ok')
    fetchQueueMock.mockResolvedValue(undefined)
  })

  it('fetches the list on mount and fills playlists', async () => {
    mockListPlaylists.mockResolvedValue([{ id: 'a', name: 'One' }])

    const { result } = await mountComposable()

    expect(mockListPlaylists).toHaveBeenCalled()
    expect(result.playlists.value).toEqual([{ id: 'a', name: 'One' }])
  })

  it('save(name) calls savePlaylist then refreshes the list', async () => {
    const { result } = await mountComposable()
    mockListPlaylists.mockClear()
    mockListPlaylists.mockResolvedValue([{ id: 'b', name: 'Saved' }])

    await result.save('Saved')

    expect(mockSavePlaylist).toHaveBeenCalledWith('Saved')
    expect(mockListPlaylists).toHaveBeenCalledTimes(1)
    expect(result.playlists.value).toEqual([{ id: 'b', name: 'Saved' }])
  })

  it('save ignores empty / whitespace-only names', async () => {
    const { result } = await mountComposable()
    mockListPlaylists.mockClear()

    await result.save('   ')

    expect(mockSavePlaylist).not.toHaveBeenCalled()
    expect(mockListPlaylists).not.toHaveBeenCalled()
  })

  it('sets error and does not crash when save fails', async () => {
    mockSavePlaylist.mockResolvedValue('failed')
    const { result } = await mountComposable()

    await result.save('Boom')

    expect(result.error.value).toBe(true)
    expect(result.isSaving.value).toBe(false)
  })

  it('load(id) calls loadPlaylist then refreshes the queue', async () => {
    const { result } = await mountComposable()

    await result.load('pl-1')

    expect(mockLoadPlaylist).toHaveBeenCalledWith('pl-1')
    expect(fetchQueueMock).toHaveBeenCalledTimes(1)
  })

  it('does not refresh the queue when load fails and does not crash', async () => {
    mockLoadPlaylist.mockResolvedValue(false)
    const { result } = await mountComposable()

    await result.load('pl-1')

    expect(fetchQueueMock).not.toHaveBeenCalled()
    expect(result.error.value).toBe(true)
  })

  it('remove(id) calls deletePlaylist then refreshes the list', async () => {
    mockListPlaylists.mockResolvedValue([
      { id: 'a', name: 'One' },
      { id: 'b', name: 'Two' },
    ])
    const { result } = await mountComposable()
    mockListPlaylists.mockClear()
    mockListPlaylists.mockResolvedValue([{ id: 'b', name: 'Two' }])

    await result.remove('a')

    expect(mockDeletePlaylist).toHaveBeenCalledWith('a')
    expect(mockListPlaylists).toHaveBeenCalledTimes(1)
    expect(result.playlists.value).toEqual([{ id: 'b', name: 'Two' }])
    expect(result.error.value).toBe(false)
  })

  it('sets error and keeps the list when remove fails', async () => {
    mockListPlaylists.mockResolvedValue([{ id: 'a', name: 'One' }])
    mockDeletePlaylist.mockResolvedValue('failed')
    const { result } = await mountComposable()
    mockListPlaylists.mockClear()

    await result.remove('a')

    expect(mockListPlaylists).not.toHaveBeenCalled()
    expect(result.playlists.value).toEqual([{ id: 'a', name: 'One' }])
    expect(result.error.value).toBe(true)
  })

  it('sets error and does not crash when deletePlaylist throws', async () => {
    mockDeletePlaylist.mockRejectedValue(new Error('network'))
    const { result } = await mountComposable()
    mockListPlaylists.mockClear()

    await result.remove('a')

    expect(mockListPlaylists).not.toHaveBeenCalled()
    expect(result.error.value).toBe(true)
  })

  it('clears a stale error when a later save succeeds', async () => {
    mockSavePlaylist.mockResolvedValueOnce('failed')
    const { result } = await mountComposable()

    await result.save('Boom')
    expect(result.error.value).toBe(true)

    await result.save('Fine')

    expect(result.error.value).toBe(false)
  })

  it('clears a stale error when a later load succeeds', async () => {
    mockLoadPlaylist.mockResolvedValueOnce(false)
    const { result } = await mountComposable()

    await result.load('pl-1')
    expect(result.error.value).toBe(true)

    await result.load('pl-1')

    expect(result.error.value).toBe(false)
  })

  it('clears a stale error when a later remove succeeds', async () => {
    mockDeletePlaylist.mockResolvedValueOnce('failed')
    const { result } = await mountComposable()

    await result.remove('a')
    expect(result.error.value).toBe(true)

    await result.remove('a')

    expect(result.error.value).toBe(false)
  })

  describe('rename', () => {
    const twoPlaylists = [
      { id: 'a', name: 'Old name' },
      { id: 'b', name: 'Untouched' },
    ] as const

    it('sends the id and the new name, then shows the new name in the list', async () => {
      mockListPlaylists.mockResolvedValue(twoPlaylists)
      const { result } = await mountComposable()
      mockListPlaylists.mockClear()
      mockListPlaylists.mockResolvedValue([
        { id: 'a', name: 'New name' },
        { id: 'b', name: 'Untouched' },
      ])

      await result.rename('a', 'New name')

      expect(mockRenamePlaylist).toHaveBeenCalledWith('a', 'New name')
      expect(mockListPlaylists).toHaveBeenCalledTimes(1)
      expect(result.playlists.value).toEqual([
        { id: 'a', name: 'New name' },
        { id: 'b', name: 'Untouched' },
      ])
      expect(result.error.value).toBe(false)
    })

    it('sets error and keeps the old name when the server rejects the rename', async () => {
      mockListPlaylists.mockResolvedValue(twoPlaylists)
      mockRenamePlaylist.mockResolvedValue('failed')
      const { result } = await mountComposable()
      mockListPlaylists.mockClear()

      await result.rename('a', 'New name')

      expect(mockListPlaylists).not.toHaveBeenCalled()
      expect(result.playlists.value).toEqual(twoPlaylists)
      expect(result.error.value).toBe(true)
    })

    it('sets error and keeps the old name when renamePlaylist throws', async () => {
      mockListPlaylists.mockResolvedValue(twoPlaylists)
      mockRenamePlaylist.mockRejectedValue(new Error('network'))
      const { result } = await mountComposable()
      mockListPlaylists.mockClear()

      await result.rename('a', 'New name')

      expect(mockListPlaylists).not.toHaveBeenCalled()
      expect(result.playlists.value).toEqual(twoPlaylists)
      expect(result.error.value).toBe(true)
    })

    it('ignores whitespace-only names instead of letting the server reject them', async () => {
      const { result } = await mountComposable()
      mockListPlaylists.mockClear()

      await result.rename('a', '   ')

      expect(mockRenamePlaylist).not.toHaveBeenCalled()
      expect(mockListPlaylists).not.toHaveBeenCalled()
    })

    it('clears a stale error when a later rename succeeds', async () => {
      mockRenamePlaylist.mockResolvedValueOnce('failed')
      const { result } = await mountComposable()

      await result.rename('a', 'New name')
      expect(result.error.value).toBe(true)

      await result.rename('a', 'New name')

      expect(result.error.value).toBe(false)
    })
  })

  // The write reached LMS, LMS is up — it just has nowhere to put the file.
  // Reported as a plain error, the user checks the server instead of the one
  // setting that is actually missing.
  describe("the server's missing playlist folder", () => {
    it('save flags the missing folder next to the error', async () => {
      mockSavePlaylist.mockResolvedValue('no-playlist-dir')
      const { result } = await mountComposable()

      await result.save('Boom')

      expect(result.error.value).toBe(true)
      expect(result.playlistDirMissing.value).toBe(true)
    })

    it('rename flags the missing folder next to the error', async () => {
      mockRenamePlaylist.mockResolvedValue('no-playlist-dir')
      const { result } = await mountComposable()

      await result.rename('a', 'New name')

      expect(result.error.value).toBe(true)
      expect(result.playlistDirMissing.value).toBe(true)
    })

    it('remove flags the missing folder next to the error', async () => {
      mockDeletePlaylist.mockResolvedValue('no-playlist-dir')
      const { result } = await mountComposable()

      await result.remove('a')

      expect(result.error.value).toBe(true)
      expect(result.playlistDirMissing.value).toBe(true)
    })

    it('leaves the flag down for an ordinary server failure', async () => {
      mockSavePlaylist.mockResolvedValue('failed')
      const { result } = await mountComposable()

      await result.save('Boom')

      expect(result.error.value).toBe(true)
      expect(result.playlistDirMissing.value).toBe(false)
    })

    it('leaves the flag down when the request throws', async () => {
      mockSavePlaylist.mockRejectedValue(new Error('network'))
      const { result } = await mountComposable()

      await result.save('Boom')

      expect(result.error.value).toBe(true)
      expect(result.playlistDirMissing.value).toBe(false)
    })

    it('drops the flag once a later write succeeds', async () => {
      mockSavePlaylist.mockResolvedValueOnce('no-playlist-dir')
      const { result } = await mountComposable()

      await result.save('Boom')
      expect(result.playlistDirMissing.value).toBe(true)

      await result.save('Fine')

      expect(result.error.value).toBe(false)
      expect(result.playlistDirMissing.value).toBe(false)
    })

    it('drops the flag when a later ordinary failure replaces it', async () => {
      mockSavePlaylist.mockResolvedValueOnce('no-playlist-dir')
      mockSavePlaylist.mockResolvedValueOnce('failed')
      const { result } = await mountComposable()

      await result.save('Boom')
      await result.save('Boom again')

      expect(result.error.value).toBe(true)
      expect(result.playlistDirMissing.value).toBe(false)
    })
  })

  it('sets error and does not crash when listPlaylists throws', async () => {
    mockListPlaylists.mockRejectedValue(new Error('network'))

    const { result } = await mountComposable()

    expect(result.error.value).toBe(true)
    expect(result.playlists.value).toEqual([])
  })
})
