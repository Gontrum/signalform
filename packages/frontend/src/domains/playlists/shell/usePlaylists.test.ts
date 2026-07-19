import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/platform/api/playlistsApi', () => ({
  savePlaylist: vi.fn(),
  listPlaylists: vi.fn(),
  loadPlaylist: vi.fn(),
}))

const fetchQueueMock = vi.fn<() => Promise<void>>()
vi.mock('@/domains/queue/shell/useQueueStore', () => ({
  useQueueStore: vi.fn(() => ({ fetchQueue: fetchQueueMock })),
}))

// Import AFTER mocks
import { usePlaylists } from './usePlaylists'
import { savePlaylist, listPlaylists, loadPlaylist } from '@/platform/api/playlistsApi'

const mockSavePlaylist = vi.mocked(savePlaylist)
const mockListPlaylists = vi.mocked(listPlaylists)
const mockLoadPlaylist = vi.mocked(loadPlaylist)

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
    mockSavePlaylist.mockResolvedValue(true)
    mockLoadPlaylist.mockResolvedValue(true)
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
    mockSavePlaylist.mockResolvedValue(false)
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

  it('sets error and does not crash when listPlaylists throws', async () => {
    mockListPlaylists.mockRejectedValue(new Error('network'))

    const { result } = await mountComposable()

    expect(result.error.value).toBe(true)
    expect(result.playlists.value).toEqual([])
  })
})
