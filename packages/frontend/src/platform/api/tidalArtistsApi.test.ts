import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchTidalArtists } from './tidalArtistsApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const requestedUrl = (): string => String(fetchMock.mock.calls[0]?.[0])

const requestedQuery = (): string => requestedUrl().split('?')[1] ?? ''

const requestedInit = (): RequestInit | undefined => fetchMock.mock.calls[0]?.[1]

const okResponse = (body: unknown): unknown => ({ ok: true, status: 200, json: async () => body })

const errorResponse = (status: number, body: unknown = null): unknown => ({
  ok: false,
  status,
  json: async () => body,
})

type SearchArtistBody = {
  readonly artistId: string
  readonly name: string
  readonly coverArtUrl: string
}

// Relevance order from Tidal, deliberately neither alphabetical nor sorted by
// id: a hidden re-sort has to change these values, not merely coincide.
const makeSearchResponse = (): {
  readonly artists: readonly SearchArtistBody[]
  readonly totalCount: number
} => ({
  artists: [
    { artistId: '31', name: 'Zola Jesus', coverArtUrl: 'https://tidal.test/zola.jpg' },
    { artistId: '7', name: 'Alt-J', coverArtUrl: 'https://tidal.test/altj.jpg' },
    { artistId: '19', name: 'Massive Attack', coverArtUrl: 'https://tidal.test/massive.jpg' },
  ],
  totalCount: 42,
})

describe('tidalArtistsApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('searchTidalArtists', () => {
    it('GETs the artist search endpoint with the query percent-encoded', async () => {
      fetchMock.mockResolvedValue(okResponse(makeSearchResponse()))

      await searchTidalArtists('Sigur Rós & AC/DC')

      expect(requestedUrl()).toContain('/api/tidal/artists/search?')
      expect(requestedQuery()).toBe('q=Sigur%20R%C3%B3s%20%26%20AC%2FDC')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('still sends the q parameter for an empty query', async () => {
      fetchMock.mockResolvedValue(okResponse({ artists: [], totalCount: 0 }))

      await searchTidalArtists('')

      expect(requestedQuery()).toBe('q=')
    })

    it('returns the artists in the order the server ranked them', async () => {
      fetchMock.mockResolvedValue(okResponse(makeSearchResponse()))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.artists.map((artist) => artist.name)).toEqual([
          'Zola Jesus',
          'Alt-J',
          'Massive Attack',
        ])
        expect(result.value.artists.map((artist) => artist.artistId)).toEqual(['31', '7', '19'])
      }
    })

    it('returns the cover art url and total count unchanged', async () => {
      fetchMock.mockResolvedValue(okResponse(makeSearchResponse()))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.artists[0]?.coverArtUrl).toBe('https://tidal.test/zola.jpg')
        expect(result.value.totalCount).toBe(42)
      }
    })

    // Zero hits is a normal answer; a truthy check on totalCount would make an
    // empty result indistinguishable from a failed one.
    it('returns an empty result with totalCount 0', async () => {
      fetchMock.mockResolvedValue(okResponse({ artists: [], totalCount: 0 }))

      const result = await searchTidalArtists('nobody at all')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.artists).toEqual([])
        expect(result.value.totalCount).toBe(0)
      }
    })

    it('rejects a response without totalCount instead of defaulting it', async () => {
      fetchMock.mockResolvedValue(okResponse({ artists: [] }))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a totalCount sent as a string', async () => {
      fetchMock.mockResolvedValue(okResponse({ artists: [], totalCount: '0' }))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects an artist without a cover art url instead of blanking it', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ artists: [{ artistId: '7', name: 'Alt-J' }], totalCount: 1 }),
      )

      const result = await searchTidalArtists('alt')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects an artistId sent as a number', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          artists: [{ artistId: 7, name: 'Alt-J', coverArtUrl: 'https://tidal.test/altj.jpg' }],
          totalCount: 1,
        }),
      )

      const result = await searchTidalArtists('alt')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a bare artist array that is not wrapped in the response object', async () => {
      fetchMock.mockResolvedValue(
        okResponse([{ artistId: '7', name: 'Alt-J', coverArtUrl: 'https://tidal.test/altj.jpg' }]),
      )

      const result = await searchTidalArtists('alt')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('returns PARSE_ERROR when the body is not JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      })

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
        expect(result.error.message).toBe('Invalid JSON response body')
      }
    })

    it('surfaces the server message from the error body', async () => {
      fetchMock.mockResolvedValue(errorResponse(503, { message: 'Tidal is not configured' }))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(503)
        expect(result.error.message).toBe('Tidal is not configured')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('falls back to its own message when the error body carries none', async () => {
      fetchMock.mockResolvedValue(errorResponse(502))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(502)
        expect(result.error.message).toBe('Tidal artist search failed: HTTP 502')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    // Documents current behaviour: this module has no NOT_FOUND branch, so a
    // 404 arrives as a SERVER_ERROR carrying the status.
    it('reports a 404 as SERVER_ERROR with status 404', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(404)
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns ABORT_ERROR when the request is aborted', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await searchTidalArtists('massive')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
        expect(result.error.message).toBe('ECONNREFUSED')
      }
    })
  })
})
