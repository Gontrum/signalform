import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { importPlaylist, importPlaylistFromLastFm } from './playlistImportApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const bodyOf = (init: RequestInit | undefined): unknown => JSON.parse(String(init?.body ?? 'null'))

const lastCallBody = (): unknown => bodyOf(fetchMock.mock.calls[0]?.[1])

describe('playlistImportApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('importPlaylist', () => {
    it('POSTs { text } to /api/playlists/import and normalises the result', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 3, missing: ['Song A', 'Song B'], skippedLines: 1 }),
      })

      const result = await importPlaylist('Song A\nSong B\nSong C')

      expect(result).toEqual({
        ok: true,
        imported: 3,
        missing: ['Song A', 'Song B'],
        total: 5,
        skippedLines: 1,
      })
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/playlists/import')
      expect(call?.[1]?.method).toBe('POST')
      expect(bodyOf(call?.[1])).toEqual({ text: 'Song A\nSong B\nSong C' })
    })

    it('derives total as imported + missing.length and passes skippedLines through', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 7, missing: ['X', 'Y', 'Z'], skippedLines: 4 }),
      })

      const result = await importPlaylist('anything')

      expect(result.ok).toBe(true)
      expect(result.ok ? result.total : undefined).toBe(10)
      expect(result.ok ? result.skippedLines : undefined).toBe(4)
    })

    it('includes name in the body when provided', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 1, missing: [], skippedLines: 0 }),
      })

      await importPlaylist('Song A', 'Road trip')

      expect(lastCallBody()).toEqual({ text: 'Song A', name: 'Road trip' })
    })

    it('omits name from the body entirely when not provided', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 1, missing: [], skippedLines: 0 }),
      })

      await importPlaylist('Song A')

      const body = lastCallBody()
      expect(body).toEqual({ text: 'Song A' })
      expect(body).not.toHaveProperty('name')
    })

    it('returns the http status on an error response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await importPlaylist('Song A')).toEqual({ ok: false, status: 503 })
    })

    it('returns a status-less failure when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      const result = await importPlaylist('Song A')

      expect(result).toEqual({ ok: false })
      expect(result).not.toHaveProperty('status')
    })

    it('returns a status-less failure when fetch rejects', async () => {
      fetchMock.mockRejectedValue(new Error('network down'))

      const result = await importPlaylist('Song A')

      expect(result).toEqual({ ok: false })
      expect(result).not.toHaveProperty('status')
    })
  })

  describe('importPlaylistFromLastFm', () => {
    const okResponse = {
      ok: true,
      json: async (): Promise<unknown> => ({
        imported: 2,
        missing: ['Missing One'],
        totalCandidates: 9,
      }),
    }

    it('POSTs to /api/playlists/from-lastfm and normalises total from totalCandidates', async () => {
      fetchMock.mockResolvedValue(okResponse)

      const result = await importPlaylistFromLastFm({ kind: 'loved' }, 50)

      expect(result).toEqual({
        ok: true,
        imported: 2,
        missing: ['Missing One'],
        total: 9,
        skippedLines: 0,
      })
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/playlists/from-lastfm')
      expect(call?.[1]?.method).toBe('POST')
    })

    it('sends exactly { source, period, limit } for top-tracks', async () => {
      fetchMock.mockResolvedValue(okResponse)

      await importPlaylistFromLastFm({ kind: 'top-tracks', period: '1month' }, 25)

      expect(lastCallBody()).toEqual({ source: 'top-tracks', period: '1month', limit: 25 })
    })

    it('sends exactly { source, limit } for loved', async () => {
      fetchMock.mockResolvedValue(okResponse)

      await importPlaylistFromLastFm({ kind: 'loved' }, 40)

      expect(lastCallBody()).toEqual({ source: 'loved', limit: 40 })
    })

    it('sends exactly { source, tag, limit } for tag', async () => {
      fetchMock.mockResolvedValue(okResponse)

      await importPlaylistFromLastFm({ kind: 'tag', tag: 'shoegaze' }, 10)

      expect(lastCallBody()).toEqual({ source: 'tag', tag: 'shoegaze', limit: 10 })
    })

    it('sends exactly { source, artist, limit } for artist', async () => {
      fetchMock.mockResolvedValue(okResponse)

      await importPlaylistFromLastFm({ kind: 'artist', artist: 'Radiohead' }, 30)

      expect(lastCallBody()).toEqual({ source: 'artist', artist: 'Radiohead', limit: 30 })
    })

    it('sends exactly { source, limit } for recommended', async () => {
      fetchMock.mockResolvedValue(okResponse)

      await importPlaylistFromLastFm({ kind: 'recommended' }, 60)

      expect(lastCallBody()).toEqual({ source: 'recommended', limit: 60 })
    })

    it('adds name to the body when provided and omits it otherwise', async () => {
      fetchMock.mockResolvedValue(okResponse)

      await importPlaylistFromLastFm({ kind: 'tag', tag: 'shoegaze' }, 10, 'Fuzz')

      const body = lastCallBody()
      expect(body).toEqual({ source: 'tag', tag: 'shoegaze', limit: 10, name: 'Fuzz' })

      fetchMock.mockClear()
      await importPlaylistFromLastFm({ kind: 'tag', tag: 'shoegaze' }, 10)
      expect(lastCallBody()).not.toHaveProperty('name')
    })

    it('returns the http status on an error response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await importPlaylistFromLastFm({ kind: 'loved' }, 50)).toEqual({
        ok: false,
        status: 400,
      })
    })

    it('surfaces the error string of the response body alongside the status', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'No Last.fm username configured' }),
      })

      expect(await importPlaylistFromLastFm({ kind: 'loved' }, 50)).toEqual({
        ok: false,
        status: 400,
        message: 'No Last.fm username configured',
      })
    })

    it('keeps the status and omits the message when the error body is not JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: (): Promise<unknown> => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
      })

      const result = await importPlaylistFromLastFm({ kind: 'loved' }, 50)

      expect(result).toEqual({ ok: false, status: 400 })
      expect(result).not.toHaveProperty('message')
    })

    it('omits the message when the error body has no error string', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ unexpected: 'shape' }),
      })

      const result = await importPlaylistFromLastFm({ kind: 'loved' }, 50)

      expect(result).toEqual({ ok: false, status: 503 })
      expect(result).not.toHaveProperty('message')
    })

    it('returns a status-less failure when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 2, missing: ['A'], skippedLines: 0 }),
      })

      const result = await importPlaylistFromLastFm({ kind: 'loved' }, 50)

      expect(result).toEqual({ ok: false })
      expect(result).not.toHaveProperty('status')
    })

    it('returns a status-less failure when fetch rejects', async () => {
      fetchMock.mockRejectedValue(new Error('timed out'))

      const result = await importPlaylistFromLastFm({ kind: 'loved' }, 50)

      expect(result).toEqual({ ok: false })
      expect(result).not.toHaveProperty('status')
    })

    it('reports skippedLines as 0 because the endpoint has no text to skip', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 5, missing: [], totalCandidates: 5 }),
      })

      const result = await importPlaylistFromLastFm({ kind: 'loved' }, 50)

      expect(result.ok ? result.skippedLines : undefined).toBe(0)
      expect(result.ok ? result.total : undefined).toBe(5)
    })
  })
})
