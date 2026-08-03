import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTidalAlbums, getTidalFeaturedAlbums } from './tidalAlbumsApi'

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

type AlbumBody = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly coverArtUrl: string
}

// Deliberately unsorted by id and title: a hidden re-sort has to change these
// values, not merely coincide with the fixture order.
const makeAlbums = (): readonly AlbumBody[] => [
  { id: '3', title: 'Zaba', artist: 'Glass Animals', coverArtUrl: 'https://tidal.test/zaba.jpg' },
  { id: '1', title: 'Amok', artist: 'Atoms for Peace', coverArtUrl: 'https://tidal.test/amok.jpg' },
  { id: '2', title: 'In Rainbows', artist: 'Radiohead', coverArtUrl: 'https://tidal.test/inr.jpg' },
]

describe('tidalAlbumsApi listings', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('getTidalFeaturedAlbums', () => {
    const makeAlbumsResponse = (): {
      readonly albums: readonly AlbumBody[]
      readonly totalCount: number
    } => ({ albums: makeAlbums(), totalCount: 137 })

    it('GETs the featured-albums endpoint with the default paging', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      await getTidalFeaturedAlbums()

      expect(requestedUrl()).toContain('/api/tidal/featured-albums?')
      expect(requestedQuery()).toBe('limit=50&offset=0')
      expect(requestedInit()?.method).toBe('GET')
    })

    // offset=0 has to survive into the query string; dropping it on a falsy
    // check would silently re-request page one on every "load more".
    it('sends an explicit limit with offset 0', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      await getTidalFeaturedAlbums(20, 0)

      expect(requestedQuery()).toBe('limit=20&offset=0')
    })

    it('sends a non-zero offset unchanged', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      await getTidalFeaturedAlbums(20, 40)

      expect(requestedQuery()).toBe('limit=20&offset=40')
    })

    it('returns the albums in server order with their values intact', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums.map((album) => album.id)).toEqual(['3', '1', '2'])
        expect(result.value.albums.map((album) => album.title)).toEqual([
          'Zaba',
          'Amok',
          'In Rainbows',
        ])
        expect(result.value.albums[0]?.artist).toBe('Glass Animals')
        expect(result.value.albums[0]?.coverArtUrl).toBe('https://tidal.test/zaba.jpg')
        expect(result.value.totalCount).toBe(137)
      }
    })

    it('keeps a totalCount of 0 on an empty result', async () => {
      fetchMock.mockResolvedValue(okResponse({ albums: [], totalCount: 0 }))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums).toEqual([])
        expect(result.value.totalCount).toBe(0)
      }
    })

    it('rejects a response without totalCount instead of defaulting it', async () => {
      fetchMock.mockResolvedValue(okResponse({ albums: makeAlbums() }))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects an album without a cover art url', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          albums: [{ id: '1', title: 'Amok', artist: 'Atoms for Peace' }],
          totalCount: 1,
        }),
      )

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('uses its own fallback message on a bodyless server error', async () => {
      fetchMock.mockResolvedValue(errorResponse(503))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('Tidal featured albums fetch failed: HTTP 503')
      }
    })

    it('maps a 404 to NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Tidal featured albums fetch failed: HTTP 404')
      }
    })

    // Guards the 404 branch against widening: a broken upstream must stay
    // distinguishable from a listing Tidal simply does not have.
    it('still reports a 500 as SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('still reports a 400 as SERVER_ERROR carrying the status', async () => {
      fetchMock.mockResolvedValue(errorResponse(400, { message: 'limit must be a number' }))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('limit must be a number')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getTidalFeaturedAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('getTidalAlbums', () => {
    const makeAlbumsResponse = (): {
      readonly albums: readonly AlbumBody[]
      readonly totalCount: number
    } => ({ albums: makeAlbums(), totalCount: 4012 })

    it('GETs the plain albums endpoint, not the featured one', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      await getTidalAlbums()

      expect(requestedUrl()).toContain('/api/tidal/albums?')
      expect(requestedUrl()).not.toContain('featured-albums')
      expect(requestedQuery()).toBe('limit=250&offset=0')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('passes an explicit limit and offset through', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      await getTidalAlbums(100, 250)

      expect(requestedQuery()).toBe('limit=100&offset=250')
    })

    it('returns the albums in server order with the total count', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumsResponse()))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums.map((album) => album.title)).toEqual([
          'Zaba',
          'Amok',
          'In Rainbows',
        ])
        expect(result.value.albums[2]?.artist).toBe('Radiohead')
        expect(result.value.totalCount).toBe(4012)
      }
    })

    it('rejects a totalCount sent as a string', async () => {
      fetchMock.mockResolvedValue(okResponse({ albums: makeAlbums(), totalCount: '4012' }))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('surfaces the server message from the error body', async () => {
      fetchMock.mockResolvedValue(errorResponse(500, { message: 'Tidal quota exceeded' }))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
        expect(result.error.message).toBe('Tidal quota exceeded')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('maps a 404 to NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Tidal albums fetch failed: HTTP 404')
      }
    })

    // Guards the 404 branch against widening: a broken upstream must stay
    // distinguishable from a listing Tidal simply does not have.
    it('still reports a 500 as SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('still reports a 400 as SERVER_ERROR carrying the status', async () => {
      fetchMock.mockResolvedValue(errorResponse(400, { message: 'offset must be a number' }))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('offset must be a number')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('uses its own fallback message when the error body is unreadable', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      })

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('Tidal albums fetch failed: HTTP 500')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getTidalAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })
})
