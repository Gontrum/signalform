import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getAlbumEnrichment,
  getArtistEnrichment,
  getSimilarArtists,
  mapEnrichmentError,
} from './enrichmentApi'

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

type EnrichmentBase = {
  readonly name: string
  readonly mbid?: string
  readonly listeners: number
  readonly playcount: number
  readonly tags: readonly string[]
}

type ArtistEnrichmentBody = EnrichmentBase & { readonly bio: string }

type AlbumEnrichmentBody = EnrichmentBase & { readonly wiki: string }

const makeArtistEnrichment = (): ArtistEnrichmentBody => ({
  name: 'Radiohead',
  mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
  listeners: 4_812_003,
  playcount: 512_874_991,
  tags: ['electronic', 'alternative', 'rock'],
  bio: '<p>Radiohead are <b>an</b> English band. <a href="https://last.fm">Read more</a></p>',
})

const makeAlbumEnrichment = (): AlbumEnrichmentBody => ({
  name: 'In Rainbows',
  mbid: 'b1392450-e666-3926-a536-22c65998f3d7',
  listeners: 1_204_556,
  playcount: 61_004_912,
  tags: ['2007', 'art rock', 'alternative'],
  wiki: '<div>Released in 2007. <a href="https://last.fm">Read more</a></div>',
})

describe('enrichmentApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('getArtistEnrichment', () => {
    it('GETs /api/enrichment/artist with the name percent-encoded', async () => {
      fetchMock.mockResolvedValue(okResponse(makeArtistEnrichment()))

      await getArtistEnrichment('AC/DC & Friends')

      expect(requestedUrl()).toContain('/api/enrichment/artist?')
      expect(requestedUrl()).not.toContain('/similar')
      expect(requestedQuery()).toBe('name=AC%2FDC%20%26%20Friends')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('returns the parsed enrichment values', async () => {
      fetchMock.mockResolvedValue(okResponse(makeArtistEnrichment()))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.name).toBe('Radiohead')
        expect(result.value.mbid).toBe('a74b1b7f-71a5-4011-9441-d0b5e4122711')
        expect(result.value.listeners).toBe(4_812_003)
        expect(result.value.playcount).toBe(512_874_991)
      }
    })

    // Tags arrive pre-ranked by popularity; a hidden re-sort would silently
    // demote the most relevant tag, and an alphabetical fixture would hide it.
    it('keeps the tag order the server sent', async () => {
      fetchMock.mockResolvedValue(okResponse(makeArtistEnrichment()))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.tags).toEqual(['electronic', 'alternative', 'rock'])
      }
    })

    // Zero listeners is a real value for an obscure artist; a truthy check
    // would drop it and the UI would fall back to "unknown".
    it('keeps listeners and playcount of 0', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ ...makeArtistEnrichment(), listeners: 0, playcount: 0 }),
      )

      const result = await getArtistEnrichment('Unknown Act')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.listeners).toBe(0)
        expect(result.value.playcount).toBe(0)
      }
    })

    it('strips the HTML out of the bio', async () => {
      fetchMock.mockResolvedValue(okResponse(makeArtistEnrichment()))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.bio).toBe('Radiohead are an English band. Read more')
      }
    })

    it('trims a bio that carries no markup', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ ...makeArtistEnrichment(), bio: '  Plain bio text  ' }),
      )

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.bio).toBe('Plain bio text')
      }
    })

    // A missing mbid means "Last.fm has no MusicBrainz link", which is not the
    // same as an empty id — the caller must be able to tell the two apart.
    it('leaves a missing mbid undefined instead of filling in an empty string', async () => {
      const { mbid: _mbid, ...withoutMbid } = makeArtistEnrichment()
      fetchMock.mockResolvedValue(okResponse(withoutMbid))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.mbid).toBeUndefined()
        expect('mbid' in result.value).toBe(false)
      }
    })

    it('rejects a response without listeners instead of defaulting it to 0', async () => {
      const { listeners: _listeners, ...withoutListeners } = makeArtistEnrichment()
      fetchMock.mockResolvedValue(okResponse(withoutListeners))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a listeners count sent as a string', async () => {
      fetchMock.mockResolvedValue(okResponse({ ...makeArtistEnrichment(), listeners: '4812003' }))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects tags sent as a bare string', async () => {
      fetchMock.mockResolvedValue(okResponse({ ...makeArtistEnrichment(), tags: 'rock' }))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a response without a bio', async () => {
      const { bio: _bio, ...withoutBio } = makeArtistEnrichment()
      fetchMock.mockResolvedValue(okResponse(withoutBio))

      const result = await getArtistEnrichment('Radiohead')

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

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
        expect(result.error.message).toBe('Invalid JSON response body')
      }
    })

    it('returns NOT_FOUND on 404', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await getArtistEnrichment('Nobody At All')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Enrichment fetch failed: HTTP 404')
      }
    })

    // Unlike the tidal APIs, enrichment ignores the error body entirely and
    // builds its message from the status alone.
    it('returns SERVER_ERROR with the status-derived message on 500', async () => {
      fetchMock.mockResolvedValue(errorResponse(500, { message: 'last.fm exploded' }))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(500)
        expect(result.error.message).toBe('Enrichment fetch failed: HTTP 500')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns ABORT_ERROR when the request is aborted', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getArtistEnrichment('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
        expect(result.error.message).toBe('ECONNREFUSED')
      }
    })
  })

  describe('getAlbumEnrichment', () => {
    it('GETs /api/enrichment/album with artist and album encoded separately', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumEnrichment()))

      await getAlbumEnrichment('Sigur Rós', '( )')

      expect(requestedUrl()).toContain('/api/enrichment/album?')
      expect(requestedQuery()).toBe('artist=Sigur%20R%C3%B3s&album=(%20)')
      expect(requestedInit()?.method).toBe('GET')
    })

    it('returns the parsed album enrichment values', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumEnrichment()))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.name).toBe('In Rainbows')
        expect(result.value.mbid).toBe('b1392450-e666-3926-a536-22c65998f3d7')
        expect(result.value.listeners).toBe(1_204_556)
        expect(result.value.playcount).toBe(61_004_912)
        expect(result.value.tags).toEqual(['2007', 'art rock', 'alternative'])
      }
    })

    it('keeps listeners and playcount of 0', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ ...makeAlbumEnrichment(), listeners: 0, playcount: 0 }),
      )

      const result = await getAlbumEnrichment('Nobody', 'Nothing')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.listeners).toBe(0)
        expect(result.value.playcount).toBe(0)
      }
    })

    it('strips the HTML out of the wiki text', async () => {
      fetchMock.mockResolvedValue(okResponse(makeAlbumEnrichment()))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.wiki).toBe('Released in 2007. Read more')
      }
    })

    it('leaves a missing mbid undefined', async () => {
      const { mbid: _mbid, ...withoutMbid } = makeAlbumEnrichment()
      fetchMock.mockResolvedValue(okResponse(withoutMbid))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.mbid).toBeUndefined()
      }
    })

    it('rejects a response without a wiki field', async () => {
      const { wiki: _wiki, ...withoutWiki } = makeAlbumEnrichment()
      fetchMock.mockResolvedValue(okResponse(withoutWiki))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects an artist enrichment shape served on the album endpoint', async () => {
      fetchMock.mockResolvedValue(okResponse(makeArtistEnrichment()))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('returns NOT_FOUND on 404', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await getAlbumEnrichment('Radiohead', 'Unreleased')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Enrichment fetch failed: HTTP 404')
      }
    })

    it('returns SERVER_ERROR with the upstream status on 503', async () => {
      fetchMock.mockResolvedValue(errorResponse(503))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(503)
        expect(result.error.message).toBe('Enrichment fetch failed: HTTP 503')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getAlbumEnrichment('Radiohead', 'In Rainbows')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('getSimilarArtists', () => {
    const makeSimilarArtists = (): unknown => [
      {
        name: 'Thom Yorke',
        mbid: '8ab9c3d4-1111-2222-3333-444455556666',
        match: 0.31,
        url: 'https://last.fm/music/Thom+Yorke',
      },
      { name: 'Atoms for Peace', match: 1, url: 'https://last.fm/music/Atoms+for+Peace' },
      { name: 'Portishead', match: 0.55, url: 'https://last.fm/music/Portishead' },
    ]

    it('GETs /api/enrichment/artist/similar with the name encoded', async () => {
      fetchMock.mockResolvedValue(okResponse(makeSimilarArtists()))

      await getSimilarArtists('Sigur Rós')

      expect(requestedUrl()).toContain('/api/enrichment/artist/similar?')
      expect(requestedQuery()).toBe('name=Sigur%20R%C3%B3s')
      expect(requestedInit()?.method).toBe('GET')
    })

    // The list is ranked upstream. The fixture is deliberately unsorted so a
    // silent re-sort by match would change the asserted values, not just pass.
    it('returns the artists in the order the server sent them', async () => {
      fetchMock.mockResolvedValue(okResponse(makeSimilarArtists()))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.map((artist) => artist.name)).toEqual([
          'Thom Yorke',
          'Atoms for Peace',
          'Portishead',
        ])
        expect(result.value.map((artist) => artist.match)).toEqual([0.31, 1, 0.55])
      }
    })

    it('returns the url and mbid of each artist', async () => {
      fetchMock.mockResolvedValue(okResponse(makeSimilarArtists()))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value[0]?.url).toBe('https://last.fm/music/Thom+Yorke')
        expect(result.value[0]?.mbid).toBe('8ab9c3d4-1111-2222-3333-444455556666')
        expect(result.value[1]?.mbid).toBeUndefined()
      }
    })

    // A match of exactly 0 is a legitimate similarity score; dropping it via a
    // truthy check would silently remove the entry or blank the value.
    it('keeps an artist whose match is 0', async () => {
      fetchMock.mockResolvedValue(
        okResponse([{ name: 'Unrelated Act', match: 0, url: 'https://last.fm/music/Unrelated' }]),
      )

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0]?.match).toBe(0)
      }
    })

    it('returns an empty list when the server knows no similar artists', async () => {
      fetchMock.mockResolvedValue(okResponse([]))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual([])
      }
    })

    it('rejects a wrapped object instead of unwrapping it', async () => {
      fetchMock.mockResolvedValue(okResponse({ artists: makeSimilarArtists() }))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects the whole list when one entry has no url', async () => {
      fetchMock.mockResolvedValue(okResponse([{ name: 'Thom Yorke', match: 0.31 }]))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects a match sent as a string', async () => {
      fetchMock.mockResolvedValue(
        okResponse([{ name: 'Thom Yorke', match: '0.31', url: 'https://last.fm' }]),
      )

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('returns NOT_FOUND with its own fallback message on 404', async () => {
      fetchMock.mockResolvedValue(errorResponse(404))

      const result = await getSimilarArtists('Nobody At All')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Similar artists fetch failed: HTTP 404')
      }
    })

    it('returns SERVER_ERROR on 502', async () => {
      fetchMock.mockResolvedValue(errorResponse(502))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok && result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(502)
        expect(result.error.message).toBe('Similar artists fetch failed: HTTP 502')
      } else {
        expect.unreachable('expected a SERVER_ERROR result')
      }
    })

    it('returns TIMEOUT_ERROR when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getSimilarArtists('Radiohead')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('mapEnrichmentError re-export', () => {
    it('maps NOT_FOUND to the not-found state', () => {
      expect(mapEnrichmentError({ type: 'NOT_FOUND', message: 'nope' })).toEqual({
        kind: 'not-found',
      })
    })

    it('maps every other error to the unavailable state', () => {
      expect(mapEnrichmentError({ type: 'SERVER_ERROR', status: 503, message: 'down' })).toEqual({
        kind: 'unavailable',
      })
      expect(mapEnrichmentError({ type: 'TIMEOUT_ERROR', message: 'slow' })).toEqual({
        kind: 'unavailable',
      })
    })
  })
})
