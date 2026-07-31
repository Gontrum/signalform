import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getLibraryAlbums, getLibraryGenres } from './libraryApi'
import type { LibraryAlbumsResponse, LibraryApiError } from './libraryApi'
import type { Result } from '@signalform/shared'

const makeLibraryResponse = (): LibraryAlbumsResponse => ({
  albums: [
    {
      id: '42',
      title: 'The Wall',
      artist: 'Pink Floyd',
      releaseYear: 1979,
      genre: null,
      coverArtUrl: 'http://localhost:9000/music/abc123/cover.jpg',
    },
  ],
  totalCount: 1,
})

const fetchMock = vi.fn()

const requestedUrl = (): string => {
  const [url] = fetchMock.mock.calls[0] ?? []
  return typeof url === 'string' ? url : String(url)
}

const requestedQuery = (): string => requestedUrl().split('?')[1] ?? ''

const okResponse = (body: unknown): unknown => ({
  ok: true,
  status: 200,
  json: async () => body,
})

describe('libraryApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('getLibraryAlbums', () => {
    it('returns LibraryAlbumsResponse on 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeLibraryResponse(),
      })

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums).toHaveLength(1)
        expect(result.value.albums[0]?.id).toBe('42')
        expect(result.value.albums[0]?.coverArtUrl).toBe(
          '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2Fabc123%2Fcover.jpg',
        )
        expect(result.value.totalCount).toBe(1)
      }
    })

    it('uses default limit=250 and offset=0', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeLibraryResponse(),
      })

      await getLibraryAlbums()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=250'),
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=0'),
        expect.any(Object),
      )
    })

    it('passes custom limit and offset', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeLibraryResponse(),
      })

      await getLibraryAlbums(50, 100)

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=100'),
        expect.any(Object),
      )
    })

    it('omits every filter param when called without a query', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums()

      expect(requestedQuery()).toBe('limit=250&offset=0')
    })

    it('sends sort when given', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, { sort: 'year-newest' })

      expect(requestedQuery()).toBe('limit=250&offset=0&sort=year-newest')
    })

    it('sends decade when given', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, { decade: '1990s' })

      expect(requestedQuery()).toBe('limit=250&offset=0&decade=1990s')
    })

    it('sends genreId when given', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, { genreId: 153 })

      expect(requestedQuery()).toBe('limit=250&offset=0&genreId=153')
    })

    it('sends genreId 0 rather than dropping it as falsy', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, { genreId: 0 })

      expect(requestedQuery()).toBe('limit=250&offset=0&genreId=0')
    })

    it('sends search when given', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, { search: 'floyd' })

      expect(requestedQuery()).toBe('limit=250&offset=0&search=floyd')
    })

    it('combines all params and percent-encodes spaces and umlauts in search', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(50, 100, {
        sort: 'title-az',
        decade: '2010s',
        genreId: 42,
        search: 'jazz für alle',
      })

      expect(requestedQuery()).toBe(
        'limit=50&offset=100&sort=title-az&decade=2010s&genreId=42&search=jazz%20f%C3%BCr%20alle',
      )
    })

    it('drops undefined and blank filter values from the URL', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, {
        sort: undefined,
        decade: undefined,
        genreId: undefined,
        search: '   ',
      })

      expect(requestedQuery()).toBe('limit=250&offset=0')
      expect(requestedUrl()).not.toContain('search')
    })

    it('trims a search term before sending it', async () => {
      fetchMock.mockResolvedValue(okResponse(makeLibraryResponse()))

      await getLibraryAlbums(250, 0, { search: '  hosen  ' })

      expect(requestedQuery()).toBe('limit=250&offset=0&search=hosen')
    })

    it('keeps the server message when recently-added is rejected with a decade (400)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'recently-added cannot be combined with a decade filter',
          code: 'INVALID_INPUT',
        }),
      })

      const result = await getLibraryAlbums(250, 0, {
        sort: 'recently-added',
        decade: '1990s',
      })

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('recently-added cannot be combined with a decade filter')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns SERVER_ERROR on 503', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'LMS unreachable' }),
      })

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns TIMEOUT_ERROR on TimeoutError', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result: Result<LibraryAlbumsResponse, LibraryApiError> = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns ABORT_ERROR on AbortError', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })

    it('returns NETWORK_ERROR on generic network failure', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })

    it('uses correct API base URL from env', async () => {
      vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001')
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeLibraryResponse(),
      })

      await getLibraryAlbums()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3001'),
        expect.any(Object),
      )
    })

    it('returns PARSE_ERROR when response shape does not match schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wrongField: 'not-a-library-response' }),
      })

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })

  describe('getLibraryGenres', () => {
    it('requests the genres endpoint without query params', async () => {
      fetchMock.mockResolvedValue(okResponse({ genres: [] }))

      await getLibraryGenres()

      expect(requestedUrl()).toContain('/api/library/genres')
      expect(requestedUrl()).not.toContain('?')
    })

    it('keeps album counts and the server order when the counts are warm', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          genres: [
            { id: 7, name: 'Ambient', albumCount: 40 },
            { id: 153, name: 'Rock', albumCount: 81 },
            { id: 91, name: 'Jazz', albumCount: 12 },
          ],
        }),
      )

      const result = await getLibraryGenres()

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Neither name-ascending nor count-descending: a client-side re-sort would show.
        expect(result.value).toEqual([
          { id: 7, name: 'Ambient', albumCount: 40 },
          { id: 153, name: 'Rock', albumCount: 81 },
          { id: 91, name: 'Jazz', albumCount: 12 },
        ])
      }
    })

    it('parses the cold response where albumCount is absent', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          genres: [
            { id: 91, name: 'Jazz' },
            { id: 7, name: 'Ambient' },
            { id: 153, name: 'Rock' },
          ],
        }),
      )

      const result = await getLibraryGenres()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual([
          { id: 91, name: 'Jazz' },
          { id: 7, name: 'Ambient' },
          { id: 153, name: 'Rock' },
        ])
        expect(result.value[0]?.albumCount).toBeUndefined()
      }
    })

    it('returns SERVER_ERROR with the server message on 503', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'LMS not reachable', code: 'LMS_UNREACHABLE' }),
      })

      const result = await getLibraryGenres()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(503)
        expect(result.error.message).toBe('LMS not reachable')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns SERVER_ERROR on 400', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid query parameters', code: 'INVALID_INPUT' }),
      })

      const result = await getLibraryGenres()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('Invalid query parameters')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns PARSE_ERROR when a genre entry has the wrong shape', async () => {
      fetchMock.mockResolvedValue(okResponse({ genres: [{ id: '153', name: 'Rock' }] }))

      const result = await getLibraryGenres()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('returns TIMEOUT_ERROR on TimeoutError', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getLibraryGenres()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })
  })
})
