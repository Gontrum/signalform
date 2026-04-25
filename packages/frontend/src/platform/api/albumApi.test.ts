import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getAlbumDetail } from './albumApi'
import type { AlbumDetailResponse, AlbumApiError } from './albumApi'
import type { Result } from '@signalform/shared'

const makeAlbumDetailResponse = (): AlbumDetailResponse => ({
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
  ],
})

const fetchMock = vi.fn()

describe('albumApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('getAlbumDetail', () => {
    it('returns AlbumDetailResponse on 200', async () => {
      await givenApiReturns200(makeAlbumDetailResponse())

      const result = await whenGetAlbumDetailIsCalled('42')

      await thenResultIsOk(result)
      if (result.ok) {
        expect(result.value.id).toBe('42')
        expect(result.value.title).toBe('Dark Side of the Moon')
        expect(result.value.tracks).toHaveLength(1)
      }
    })

    it('returns NOT_FOUND error on 404', async () => {
      await givenApiReturns404('Album not found')

      const result = await whenGetAlbumDetailIsCalled('99')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'NOT_FOUND')
    })

    it('returns SERVER_ERROR on 503', async () => {
      await givenApiReturns503('LMS unreachable')

      const result = await whenGetAlbumDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'SERVER_ERROR')
    })

    it('returns TIMEOUT_ERROR on TimeoutError', async () => {
      await givenFetchThrowsTimeoutError()

      const result = await whenGetAlbumDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'TIMEOUT_ERROR')
    })

    it('returns ABORT_ERROR on AbortError', async () => {
      await givenFetchThrowsAbortError()

      const result = await whenGetAlbumDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'ABORT_ERROR')
    })

    it('returns NETWORK_ERROR on generic network failure', async () => {
      await givenFetchThrowsNetworkError('ECONNREFUSED')

      const result = await whenGetAlbumDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'NETWORK_ERROR')
    })

    it('encodes albumId in URL', async () => {
      await givenApiReturns200(makeAlbumDetailResponse())

      await whenGetAlbumDetailIsCalled('album with spaces')

      await thenFetchWasCalledWithEncodedAlbumId('album%20with%20spaces')
    })

    it('uses correct API base URL from env', async () => {
      vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001')
      await givenApiReturns200(makeAlbumDetailResponse())

      await whenGetAlbumDetailIsCalled('42')

      await thenFetchWasCalledWithBaseUrl('http://localhost:3001')
    })

    // Story 9.1: regression guard — backend was returning releaseYear as string "2008" before fix
    it('returns PARSE_ERROR when backend returns releaseYear as string (pre-fix regression)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...makeAlbumDetailResponse(),
          releaseYear: '2008', // string — Zod z.number().nullable() must reject this
        }),
      })

      const result = await whenGetAlbumDetailIsCalled('92')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('returns PARSE_ERROR when response shape does not match schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wrongField: 'not-an-album-detail' }),
      })

      const result = await whenGetAlbumDetailIsCalled('42')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })

  // GIVEN helpers
  const givenApiReturns200 = async (data: AlbumDetailResponse): Promise<void> => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    })
  }

  const givenApiReturns404 = async (message: string): Promise<void> => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message }),
    })
  }

  const givenApiReturns503 = async (message: string): Promise<void> => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message }),
    })
  }

  const givenFetchThrowsTimeoutError = async (): Promise<void> => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))
  }

  const givenFetchThrowsAbortError = async (): Promise<void> => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))
  }

  const givenFetchThrowsNetworkError = async (message: string): Promise<void> => {
    fetchMock.mockRejectedValue(new Error(message))
  }

  // WHEN helpers
  const whenGetAlbumDetailIsCalled = async (
    albumId: string,
  ): Promise<Result<AlbumDetailResponse, AlbumApiError>> => {
    return await getAlbumDetail(albumId)
  }

  // THEN helpers
  const thenResultIsOk = async (
    result: Result<AlbumDetailResponse, AlbumApiError>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
  }

  const thenResultIsError = async (
    result: Result<AlbumDetailResponse, AlbumApiError>,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
  }

  const thenErrorTypeIs = async (
    result: Result<AlbumDetailResponse, AlbumApiError>,
    expectedType: string,
  ): Promise<void> => {
    if (!result.ok) {
      expect(result.error.type).toBe(expectedType)
    }
  }

  const thenFetchWasCalledWithEncodedAlbumId = async (encodedId: string): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(encodedId), expect.any(Object))
  }

  const thenFetchWasCalledWithBaseUrl = async (baseUrl: string): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(baseUrl), expect.any(Object))
  }
})
