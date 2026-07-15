import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getQueue,
  addAlbumToQueue,
  addTrackListToQueue,
  removeFromQueue,
  reorderQueue,
  setRadioMode,
  clearQueue,
  removeMultipleFromQueue,
} from './queueApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn()

const isRequestInit = (value: unknown): value is RequestInit => {
  return typeof value === 'object' && value !== null
}

const getFetchCall = (
  callIndex: number,
): {
  readonly url: string
  readonly options: RequestInit
} => {
  const call = fetchMock.mock.calls[callIndex]
  const urlCandidate = call?.[0]
  const optionsCandidate = call?.[1]

  expect(typeof urlCandidate).toBe('string')
  expect(isRequestInit(optionsCandidate)).toBe(true)

  return {
    url: typeof urlCandidate === 'string' ? urlCandidate : '',
    options: isRequestInit(optionsCandidate) ? optionsCandidate : {},
  }
}

const parseJsonBody = (body: unknown): unknown => {
  expect(typeof body).toBe('string')
  return JSON.parse(typeof body === 'string' ? body : '{}')
}

describe('queueApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('getQueue', () => {
    it('returns ok with queue tracks and radio boundary on successful response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          tracks: [
            {
              id: '1',
              position: 1,
              title: 'Comfortably Numb',
              artist: 'Pink Floyd',
              album: 'The Wall',
              duration: 382,
              isCurrent: true,
              addedBy: 'user',
            },
          ],
          radioModeActive: true,
          radioBoundaryIndex: 0,
        }),
      })

      const result = await getQueue()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tracks).toHaveLength(1)
        expect(result.value.tracks[0]?.title).toBe('Comfortably Numb')
        expect(result.value.tracks[0]?.addedBy).toBe('user')
        expect(result.value.radioModeActive).toBe(true)
        expect(result.value.radioBoundaryIndex).toBe(0)
      }
    })

    it('returns SERVER_ERROR with backend message on non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'Queue backend unavailable' }),
      })

      const result = await getQueue()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
        expect(result.error.message).toBe('Queue backend unavailable')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Failed'))

      const result = await getQueue()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })

    it('returns PARSE_ERROR when response shape does not match schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrongField: 'not-a-queue-array' }),
      })

      const result = await getQueue()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })

  describe('setRadioMode', () => {
    it('calls /api/queue/radio-mode with enabled in body and returns queue snapshot', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        }),
      })

      const result = await setRadioMode(false)

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/radio-mode')
      expect(parseJsonBody(options.body)).toEqual({ enabled: false })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.radioModeActive).toBe(false)
      }
    })
  })

  describe('addAlbumToQueue', () => {
    it('returns ok on 204 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const result = await addAlbumToQueue('123')

      expect(result.ok).toBe(true)
    })

    it('calls /api/queue/add-album with albumId in body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      await addAlbumToQueue('42')

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/add-album')
      expect(parseJsonBody(options.body)).toEqual({ albumId: '42' })
    })

    it('returns SERVER_ERROR on non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'backend down' }),
      })

      const result = await addAlbumToQueue('123')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Network failed'))

      const result = await addAlbumToQueue('123')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('addTrackListToQueue', () => {
    it('returns ok on 204 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const result = await addTrackListToQueue(['file:///a.flac', 'file:///b.flac'])

      expect(result.ok).toBe(true)
    })

    it('calls /api/queue/add-track-list with urls in body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const urls = ['file:///a.flac', 'file:///b.flac']
      await addTrackListToQueue(urls)

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/add-track-list')
      expect(parseJsonBody(options.body)).toEqual({ urls })
    })

    it('returns SERVER_ERROR on non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'backend down' }),
      })

      const result = await addTrackListToQueue(['file:///a.flac'])

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Network failed'))

      const result = await addTrackListToQueue(['file:///a.flac'])

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('removeFromQueue', () => {
    it('returns queue snapshot on 200 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        }),
      })

      const result = await removeFromQueue(4)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        })
      }
    })

    it('calls /api/queue/remove with trackIndex in body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      await removeFromQueue(4)

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/remove')
      expect(parseJsonBody(options.body)).toEqual({ trackIndex: 4 })
      expect(options.signal).toBeInstanceOf(AbortSignal)
    })

    it('returns VALIDATION_ERROR with backend message on 400 response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'trackIndex must be >= 0' }),
      })

      const result = await removeFromQueue(-1)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
        expect(result.error.message).toBe('trackIndex must be >= 0')
      }
    })

    it('returns TIMEOUT_ERROR when fetch times out', async () => {
      const timeoutError = new DOMException('timed out', 'TimeoutError')
      fetchMock.mockRejectedValue(timeoutError)

      const result = await removeFromQueue(1)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })
  })

  describe('reorderQueue', () => {
    it('returns queue snapshot on 200 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [],
          radioModeActive: true,
          radioBoundaryIndex: 1,
        }),
      })

      const result = await reorderQueue(5, 1)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          tracks: [],
          radioModeActive: true,
          radioBoundaryIndex: 1,
        })
      }
    })

    it('calls /api/queue/reorder with fromIndex and toIndex in body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      await reorderQueue(5, 1)

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/reorder')
      expect(parseJsonBody(options.body)).toEqual({ fromIndex: 5, toIndex: 1 })
      expect(options.signal).toBeInstanceOf(AbortSignal)
    })

    it('returns SERVER_ERROR with backend message on non-400 failure', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'queue mutation unavailable' }),
      })

      const result = await reorderQueue(1, 2)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
        expect(result.error.message).toBe('queue mutation unavailable')
      }
    })

    it('returns ABORT_ERROR when fetch is aborted', async () => {
      const abortError = new DOMException('aborted', 'AbortError')
      fetchMock.mockRejectedValue(abortError)

      const result = await reorderQueue(1, 2)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })
  })

  describe('jumpToTrack', () => {
    it('returns queue snapshot on 200 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        }),
      })

      const { jumpToTrack } = await import('./queueApi')
      const result = await jumpToTrack(2)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        })
      }
    })

    it('injects the selected-user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const { jumpToTrack } = await import('./queueApi')
      await jumpToTrack(2)

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/jump')
      const headers = new Headers(options.headers)
      expect(headers.get(USER_HEADER_NAME)).toBe('u1')
      expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('sends no user header when no user is selected', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const { jumpToTrack } = await import('./queueApi')
      await jumpToTrack(2)

      const { options } = getFetchCall(0)
      expect(new Headers(options.headers).get(USER_HEADER_NAME)).toBeNull()
    })
  })

  describe('clearQueue', () => {
    it('returns ok with queue snapshot on 200 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [
            {
              id: '1',
              position: 1,
              title: 'Comfortably Numb',
              artist: 'Pink Floyd',
              album: 'The Wall',
              duration: 382,
              isCurrent: false,
              addedBy: 'user',
            },
          ],
          radioModeActive: false,
          radioBoundaryIndex: null,
        }),
      })

      const result = await clearQueue()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeDefined()
        expect(result.value?.tracks).toHaveLength(1)
        expect(result.value?.tracks[0]?.title).toBe('Comfortably Numb')
        expect(result.value?.radioModeActive).toBe(false)
        expect(result.value?.radioBoundaryIndex).toBeNull()
      }
    })

    it('returns ok(undefined) on 204 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const result = await clearQueue()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeUndefined()
      }
    })

    it('returns SERVER_ERROR on non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'queue backend unavailable' }),
      })

      const result = await clearQueue()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
        expect(result.error.message).toBe('queue backend unavailable')
      }
    })

    it('calls /api/queue/clear with empty body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      await clearQueue()

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/clear')
      expect(parseJsonBody(options.body)).toEqual({})
    })
  })

  describe('removeMultipleFromQueue', () => {
    it('returns ok with queue snapshot on 200 response with trackIndices sent in body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        }),
      })

      const result = await removeMultipleFromQueue([0, 2, 4])

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/remove-batch')
      expect(parseJsonBody(options.body)).toEqual({ trackIndices: [0, 2, 4] })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          tracks: [],
          radioModeActive: false,
          radioBoundaryIndex: null,
        })
      }
    })

    it('returns ok(undefined) on 204 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const result = await removeMultipleFromQueue([1, 3])

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeUndefined()
      }
    })

    it('returns SERVER_ERROR on non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'batch remove unavailable' }),
      })

      const result = await removeMultipleFromQueue([0, 1])

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
        expect(result.error.message).toBe('batch remove unavailable')
      }
    })
  })

  // Story 9.6: addTidalSearchAlbumToQueue
  describe('addTidalSearchAlbumToQueue', () => {
    it('calls /api/queue/add-tidal-search-album with albumTitle, artist, and trackUrls', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const { addTidalSearchAlbumToQueue } = await import('./queueApi')
      await addTidalSearchAlbumToQueue("Short n' Sweet", 'Sabrina Carpenter', ['tidal://1234.flc'])

      const { url, options } = getFetchCall(0)
      expect(url).toContain('/api/queue/add-tidal-search-album')
      expect(parseJsonBody(options.body)).toEqual({
        albumTitle: "Short n' Sweet",
        artist: 'Sabrina Carpenter',
        trackUrls: ['tidal://1234.flc'],
      })
    })

    it('returns ok on 204 response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const { addTidalSearchAlbumToQueue } = await import('./queueApi')
      const result = await addTidalSearchAlbumToQueue('The Wall', 'Pink Floyd', [
        'tidal://1234.flc',
      ])

      expect(result.ok).toBe(true)
    })

    it('returns SERVER_ERROR on non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'backend down' }),
      })

      const { addTidalSearchAlbumToQueue } = await import('./queueApi')
      const result = await addTidalSearchAlbumToQueue('The Wall', 'Pink Floyd', [])

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Network failed'))

      const { addTidalSearchAlbumToQueue } = await import('./queueApi')
      const result = await addTidalSearchAlbumToQueue('The Wall', 'Pink Floyd', [])

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })
})
