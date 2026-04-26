import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getArtistDetail, getArtistByName } from './artistApi'
import type { ArtistDetailResponse, ArtistByNameResponse, ArtistApiError } from './artistApi'
import type { Result } from '@signalform/shared'

const makeArtistDetailResponse = (): ArtistDetailResponse => ({
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
})

const fetchMock = vi.fn()

describe('artistApi', () => {
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

  describe('getArtistDetail', () => {
    it('returns ArtistDetailResponse on 200', async () => {
      await givenApiReturns200(makeArtistDetailResponse())

      const result = await whenGetArtistDetailIsCalled('42')

      await thenResultIsOk(result)
      if (result.ok) {
        expect(result.value.id).toBe('42')
        expect(result.value.name).toBe('Pink Floyd')
        expect(result.value.albums).toHaveLength(2)
        expect(result.value.albums[0]?.coverArtUrl).toBe(
          '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2F101%2Fcover.jpg',
        )
      }
    })

    it('returns NOT_FOUND error on 404', async () => {
      await givenApiReturns404('Artist not found')

      const result = await whenGetArtistDetailIsCalled('99')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'NOT_FOUND')
    })

    it('returns SERVER_ERROR on 503', async () => {
      await givenApiReturns503('LMS unreachable')

      const result = await whenGetArtistDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'SERVER_ERROR')
    })

    it('returns TIMEOUT_ERROR on TimeoutError', async () => {
      await givenFetchThrowsTimeoutError()

      const result = await whenGetArtistDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'TIMEOUT_ERROR')
    })

    it('returns ABORT_ERROR on AbortError', async () => {
      await givenFetchThrowsAbortError()

      const result = await whenGetArtistDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'ABORT_ERROR')
    })

    it('returns NETWORK_ERROR on generic network failure', async () => {
      await givenFetchThrowsNetworkError('ECONNREFUSED')

      const result = await whenGetArtistDetailIsCalled('42')

      await thenResultIsError(result)
      await thenErrorTypeIs(result, 'NETWORK_ERROR')
    })

    it('encodes artistId in URL', async () => {
      await givenApiReturns200(makeArtistDetailResponse())

      await whenGetArtistDetailIsCalled('artist with spaces')

      await thenFetchWasCalledWithEncodedArtistId('artist%20with%20spaces')
    })

    it('returns PARSE_ERROR when response shape does not match schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wrongField: 'not-an-artist-detail' }),
      })

      const result = await whenGetArtistDetailIsCalled('42')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })

  // GIVEN helpers
  const givenApiReturns200 = async (data: ArtistDetailResponse): Promise<void> => {
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
  const whenGetArtistDetailIsCalled = async (
    artistId: string,
  ): Promise<Result<ArtistDetailResponse, ArtistApiError>> => {
    return await getArtistDetail(artistId)
  }

  // THEN helpers
  const thenResultIsOk = async (
    result: Result<ArtistDetailResponse, ArtistApiError>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
  }

  const thenResultIsError = async (
    result: Result<ArtistDetailResponse, ArtistApiError>,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
  }

  const thenErrorTypeIs = async (
    result: Result<ArtistDetailResponse, ArtistApiError>,
    expectedType: string,
  ): Promise<void> => {
    if (!result.ok) {
      expect(result.error.type).toBe(expectedType)
    }
  }

  const thenFetchWasCalledWithEncodedArtistId = async (encodedId: string): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(encodedId), expect.any(Object))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getArtistByName — Story 9.13
  // ─────────────────────────────────────────────────────────────────────────

  const makeArtistByNameResponse = (): ArtistByNameResponse => ({
    localAlbums: [
      {
        id: '42',
        albumId: '42',
        title: 'Pablo Honey',
        artist: 'Radiohead',
        source: 'local',
        coverArtUrl: 'http://localhost:9000/music/101/cover.jpg',
      },
    ],
    tidalAlbums: [
      {
        id: 'radiohead::pablo honey',
        title: 'Pablo Honey',
        artist: 'Radiohead',
        source: 'tidal',
        trackUrls: ['tidal://12345.flc'],
      },
    ],
  })

  const givenByNameApiReturns200 = async (data: ArtistByNameResponse): Promise<void> => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    })
  }

  const givenByNameApiReturns503 = async (): Promise<void> => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'LMS unreachable' }),
    })
  }

  const whenGetArtistByNameIsCalled = async (
    name: string,
  ): Promise<Result<ArtistByNameResponse, ArtistApiError>> => {
    return await getArtistByName(name)
  }

  describe('getArtistByName', () => {
    it('returns ArtistByNameResponse with localAlbums and tidalAlbums on 200', async () => {
      await givenByNameApiReturns200(makeArtistByNameResponse())

      const result = await whenGetArtistByNameIsCalled('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.localAlbums).toHaveLength(1)
        expect(result.value.tidalAlbums).toHaveLength(1)
        expect(result.value.localAlbums[0]?.title).toBe('Pablo Honey')
        expect(result.value.localAlbums[0]?.coverArtUrl).toBe(
          '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2F101%2Fcover.jpg',
        )
      }
    })

    it('returns SERVER_ERROR on 503', async () => {
      await givenByNameApiReturns503()

      const result = await whenGetArtistByNameIsCalled('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns TIMEOUT_ERROR on TimeoutError', async () => {
      await givenFetchThrowsTimeoutError()

      const result = await whenGetArtistByNameIsCalled('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns ABORT_ERROR on AbortError', async () => {
      await givenFetchThrowsAbortError()

      const result = await whenGetArtistByNameIsCalled('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })

    it('returns NETWORK_ERROR on generic network failure', async () => {
      await givenFetchThrowsNetworkError('ECONNREFUSED')

      const result = await whenGetArtistByNameIsCalled('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })

    it('returns PARSE_ERROR when response shape does not match schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wrongField: 'not-a-by-name-response' }),
      })

      const result = await whenGetArtistByNameIsCalled('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('encodes artist name in URL', async () => {
      await givenByNameApiReturns200(makeArtistByNameResponse())

      await whenGetArtistByNameIsCalled('Pink Floyd')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('name=Pink%20Floyd'),
        expect.any(Object),
      )
    })

    it('returns empty arrays when both sections are empty', async () => {
      await givenByNameApiReturns200({ localAlbums: [], tidalAlbums: [] })

      const result = await whenGetArtistByNameIsCalled('Unknown Artist')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.localAlbums).toHaveLength(0)
        expect(result.value.tidalAlbums).toHaveLength(0)
      }
    })
  })
})
