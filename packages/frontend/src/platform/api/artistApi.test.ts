import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getArtistByName, getArtistTopAlbums, getArtistTopTracks } from './artistApi'
import type { ArtistByNameResponse, ArtistApiError } from './artistApi'
import type { Result } from '@signalform/shared'

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

  // GIVEN helpers
  const givenFetchThrowsTimeoutError = async (): Promise<void> => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))
  }

  const givenFetchThrowsAbortError = async (): Promise<void> => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))
  }

  const givenFetchThrowsNetworkError = async (message: string): Promise<void> => {
    fetchMock.mockRejectedValue(new Error(message))
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

  describe('artist popularity endpoints', () => {
    it('returns proxied playable top tracks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          artist: 'Pink Floyd',
          tracks: [
            {
              id: 'track-1',
              title: 'Time',
              artist: 'Pink Floyd',
              album: 'The Dark Side of the Moon',
              url: 'file:///music/time.flac',
              source: 'local',
              playcount: 1000,
              listeners: 500,
              rank: 1,
              coverArtUrl: 'http://localhost:9000/music/101/cover.jpg',
            },
          ],
        }),
      })

      const result = await getArtistTopTracks('Pink Floyd')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tracks[0]?.coverArtUrl).toBe(
          '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2F101%2Fcover.jpg',
        )
      }
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/artist/top-tracks?name=Pink%20Floyd'),
        expect.any(Object),
      )
    })

    it('returns album popularity entries', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          artist: 'Pink Floyd',
          albums: [{ title: 'The Wall', artist: 'Pink Floyd', playcount: 1000, rank: 1 }],
        }),
      })

      const result = await getArtistTopAlbums('Pink Floyd')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums[0]?.title).toBe('The Wall')
        expect(result.value.albums[0]?.rank).toBe(1)
      }
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/artist/top-albums?name=Pink%20Floyd'),
        expect.any(Object),
      )
    })
  })
})
