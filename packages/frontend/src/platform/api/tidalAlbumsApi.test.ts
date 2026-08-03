import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { getTidalAlbumDetail, getTidalAlbumTracks, resolveAlbum } from './tidalAlbumsApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const requestedUrl = (): string => String(fetchMock.mock.calls[0]?.[0])

const requestedQuery = (): string => requestedUrl().split('?')[1] ?? ''

const requestedInit = (): RequestInit | undefined => fetchMock.mock.calls[0]?.[1]

const requestedDeadlineMs = (spy: MockInstance<(ms: number) => AbortSignal>): number =>
  spy.mock.calls[0]?.[0] ?? Number.NaN

const okResponse = (body: unknown): unknown => ({ ok: true, status: 200, json: async () => body })

const errorResponse = (status: number, body: unknown = null): unknown => ({
  ok: false,
  status,
  json: async () => body,
})

type TrackBody = {
  readonly id: string
  readonly trackNumber: number
  readonly title: string
  readonly url: string
  readonly duration: number
}

type AlbumDetailBody = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly coverArtUrl: string
  readonly tracks: readonly TrackBody[]
  readonly totalCount: number
}

// Deliberately unsorted by trackNumber: a hidden re-sort has to change these
// values, not merely coincide with the fixture order.
const makeTracks = (): readonly TrackBody[] => [
  { id: 't3', trackNumber: 3, title: 'Nude', url: 'tidal://3003.flc', duration: 255 },
  { id: 't1', trackNumber: 1, title: '15 Step', url: 'tidal://3001.flc', duration: 237 },
  { id: 't2', trackNumber: 2, title: 'Bodysnatchers', url: 'tidal://3002.flc', duration: 0 },
]

describe('tidalAlbumsApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('resolveAlbum', () => {
    it('GETs the resolve endpoint with title and artist in their own encoded params', async () => {
      fetchMock.mockResolvedValue(okResponse({ albumId: '77' }))

      await resolveAlbum('Kid A/B', 'Sigur Rós')

      expect(requestedUrl()).toContain('/api/tidal/albums/resolve?')
      expect(requestedQuery()).toBe('title=Kid%20A%2FB&artist=Sigur%20R%C3%B3s')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('returns the resolved album id', async () => {
      fetchMock.mockResolvedValue(okResponse({ albumId: '123456' }))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albumId).toBe('123456')
      }
    })

    // `null` is the server's explicit "no match on Tidal" answer and must stay
    // distinguishable from a field that never arrived.
    it('keeps an explicit null albumId', async () => {
      fetchMock.mockResolvedValue(okResponse({ albumId: null }))

      const result = await resolveAlbum('Nothing', 'Nobody')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albumId).toBeNull()
      }
    })

    it('rejects a response without albumId instead of treating it as no match', async () => {
      fetchMock.mockResolvedValue(okResponse({}))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a numeric albumId', async () => {
      fetchMock.mockResolvedValue(okResponse({ albumId: 123456 }))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

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

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
        expect(result.error.message).toBe('Invalid JSON response body')
      }
    })

    it('surfaces the server message from the error body', async () => {
      fetchMock.mockResolvedValue(errorResponse(502, { message: 'Tidal session expired' }))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(502)
        expect(result.error.message).toBe('Tidal session expired')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('falls back to its own message when the error body carries none', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('Tidal album resolve failed: HTTP 500')
      }
    })

    it('maps a 404 to NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Tidal album resolve failed: HTTP 404')
      }
    })

    // Guards the 404 branch against widening: a broken upstream must stay
    // distinguishable from an album Tidal simply does not have.
    it('still reports a 500 as SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('still reports a 400 as SERVER_ERROR carrying the status', async () => {
      fetchMock.mockResolvedValue(errorResponse(400, { message: 'title is required' }))

      const result = await resolveAlbum('', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('title is required')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns ABORT_ERROR when the request is aborted', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await resolveAlbum('In Rainbows', 'Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
        expect(result.error.message).toBe('ECONNREFUSED')
      }
    })
  })

  describe('getTidalAlbumDetail', () => {
    const makeDetail = (): AlbumDetailBody => ({
      id: '99',
      title: 'In Rainbows',
      artist: 'Radiohead',
      coverArtUrl: 'https://tidal.test/inr.jpg',
      tracks: makeTracks(),
      totalCount: 3,
    })

    it('GETs the album detail path with the id encoded and without /tracks', async () => {
      fetchMock.mockResolvedValue(okResponse(makeDetail()))

      await getTidalAlbumDetail('album 12/34')

      expect(requestedUrl()).toContain('/api/tidal/albums/album%2012%2F34')
      expect(requestedUrl()).not.toContain('/tracks')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('returns the album fields and the track count', async () => {
      fetchMock.mockResolvedValue(okResponse(makeDetail()))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.id).toBe('99')
        expect(result.value.title).toBe('In Rainbows')
        expect(result.value.artist).toBe('Radiohead')
        expect(result.value.coverArtUrl).toBe('https://tidal.test/inr.jpg')
        expect(result.value.totalCount).toBe(3)
      }
    })

    it('keeps the track order the server sent', async () => {
      fetchMock.mockResolvedValue(okResponse(makeDetail()))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tracks.map((track) => track.trackNumber)).toEqual([3, 1, 2])
        expect(result.value.tracks.map((track) => track.title)).toEqual([
          'Nude',
          '15 Step',
          'Bodysnatchers',
        ])
      }
    })

    it('rejects a detail response without totalCount instead of defaulting it', async () => {
      const { totalCount: _totalCount, ...withoutTotal } = makeDetail()
      fetchMock.mockResolvedValue(okResponse(withoutTotal))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a detail response without a cover art url', async () => {
      const { coverArtUrl: _cover, ...withoutCover } = makeDetail()
      fetchMock.mockResolvedValue(okResponse(withoutCover))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a track whose id arrives as a number', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          ...makeDetail(),
          tracks: [
            { id: 1, trackNumber: 1, title: '15 Step', url: 'tidal://1.flc', duration: 237 },
          ],
        }),
      )

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('uses its own fallback message on a bodyless server error', async () => {
      fetchMock.mockResolvedValue(errorResponse(503))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(503)
        expect(result.error.message).toBe('Tidal album detail fetch failed: HTTP 503')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('maps a 404 to NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(errorResponse(404, { message: 'Album 99 is gone' }))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Album 99 is gone')
      }
    })

    // Guards the 404 branch against widening: a broken upstream must stay
    // distinguishable from an album Tidal simply does not have.
    it('still reports a 500 as SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('still reports a 400 as SERVER_ERROR carrying the status', async () => {
      fetchMock.mockResolvedValue(errorResponse(400, { message: 'albumId is required' }))

      const result = await getTidalAlbumDetail('')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('albumId is required')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    // This call waits longer than its siblings, so the wording has to come from
    // its own deadline rather than from a shared default.
    it('reports the deadline it actually set in the timeout message', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getTidalAlbumDetail('99')

      expect(requestedDeadlineMs(timeoutSpy)).toBe(10000)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe(
          `Request timed out (${requestedDeadlineMs(timeoutSpy) / 1000}s)`,
        )
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getTidalAlbumDetail('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('getTidalAlbumTracks', () => {
    const makeTracksResponse = (): {
      readonly tracks: readonly TrackBody[]
      readonly totalCount: number
    } => ({ tracks: makeTracks(), totalCount: 3 })

    it('GETs the /tracks sub-path with the album id encoded', async () => {
      fetchMock.mockResolvedValue(okResponse(makeTracksResponse()))

      await getTidalAlbumTracks('album 12/34')

      expect(requestedUrl()).toContain('/api/tidal/albums/album%2012%2F34/tracks')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('returns the tracks in server order with their values intact', async () => {
      fetchMock.mockResolvedValue(okResponse(makeTracksResponse()))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tracks.map((track) => track.id)).toEqual(['t3', 't1', 't2'])
        expect(result.value.tracks.map((track) => track.trackNumber)).toEqual([3, 1, 2])
        expect(result.value.tracks[0]?.url).toBe('tidal://3003.flc')
        expect(result.value.totalCount).toBe(3)
      }
    })

    // A duration of 0 is what the API sends for a track it could not measure;
    // a truthy check would turn it into "unknown" or drop the field.
    it('keeps a duration of 0', async () => {
      fetchMock.mockResolvedValue(okResponse(makeTracksResponse()))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tracks[2]?.duration).toBe(0)
      }
    })

    it('returns an empty track list with totalCount 0', async () => {
      fetchMock.mockResolvedValue(okResponse({ tracks: [], totalCount: 0 }))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tracks).toEqual([])
        expect(result.value.totalCount).toBe(0)
      }
    })

    it('rejects a bare track array that is not wrapped in the response object', async () => {
      fetchMock.mockResolvedValue(okResponse(makeTracks()))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a track without a duration instead of defaulting it to 0', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          tracks: [{ id: 't1', trackNumber: 1, title: '15 Step', url: 'tidal://1.flc' }],
          totalCount: 1,
        }),
      )

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('uses its own fallback message on a bodyless server error', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('Tidal album tracks fetch failed: HTTP 500')
      }
    })

    it('maps a 404 to NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Tidal album tracks fetch failed: HTTP 404')
      }
    })

    // Guards the 404 branch against widening: a broken upstream must stay
    // distinguishable from an album Tidal simply does not have.
    it('still reports a 500 as SERVER_ERROR', async () => {
      fetchMock.mockResolvedValue(errorResponse(500))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('still reports a 400 as SERVER_ERROR carrying the status', async () => {
      fetchMock.mockResolvedValue(errorResponse(400, { message: 'albumId is required' }))

      const result = await getTidalAlbumTracks('')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(400)
        expect(result.error.message).toBe('albumId is required')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    // The sibling calls keep the 5s deadline and the 5s wording they had before
    // the detail call got its own message.
    it('reports the deadline it actually set in the timeout message', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getTidalAlbumTracks('99')

      expect(requestedDeadlineMs(timeoutSpy)).toBe(5000)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('Request timed out (5s)')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getTidalAlbumTracks('99')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })
})
