import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { listTidalPlaylists, getTidalPlaylistTracks, playTidalPlaylist } from './tidalPlaylistsApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const bodyOf = (init: RequestInit | undefined): unknown => JSON.parse(String(init?.body ?? 'null'))

describe('tidalPlaylistsApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('listTidalPlaylists', () => {
    it('GETs /api/tidal/playlists and returns the parsed playlists', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          playlists: [
            { id: '3.1', name: 'Bacoben’s Top 500', coverArtUrl: 'http://host:9000/img/a.jpg' },
            { id: '3.0', name: 'Road trip', coverArtUrl: '' },
          ],
          totalCount: 2,
          hasMore: false,
        }),
      })

      const result = await listTidalPlaylists()

      expect(result).toEqual([
        { id: '3.1', name: 'Bacoben’s Top 500', coverArtUrl: 'http://host:9000/img/a.jpg' },
        { id: '3.0', name: 'Road trip', coverArtUrl: '' },
      ])
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/tidal/playlists')
      expect(call?.[1]?.method).toBe('GET')
    })

    it('returns [] on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await listTidalPlaylists()).toEqual([])
    })

    it('returns [] when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      expect(await listTidalPlaylists()).toEqual([])
    })
  })

  describe('getTidalPlaylistTracks', () => {
    // Not alphabetical, and positions start above 0: a page from offset 2
    // carries the positions in the whole playlist, not in the page.
    const serverPage = {
      tracks: [
        {
          id: '3.0.2',
          position: 2,
          title: 'Layla',
          url: 'tidal://5816049.flc',
          coverArtUrl: 'http://host:9000/img/c.jpg',
          duration: 434,
        },
        {
          id: '3.0.3',
          position: 3,
          title: 'Satisfaction',
          url: 'tidal://5693554.flc',
          coverArtUrl: 'http://host:9000/img/d.jpg',
        },
      ],
      totalCount: 449,
      hasMore: true,
    }

    it('GETs /api/tidal/playlists/:id/tracks with limit and offset', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      await getTidalPlaylistTracks('3.0', 50, 100)

      const call = fetchMock.mock.calls[0]
      expect(String(call?.[0])).toMatch(/\/api\/tidal\/playlists\/3\.0\/tracks\?/u)
      expect(String(call?.[0])).toContain('limit=50')
      expect(String(call?.[0])).toContain('offset=100')
      expect(call?.[1]?.method).toBe('GET')
    })

    it('defaults to the first page when limit and offset are omitted', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      await getTidalPlaylistTracks('3.0')

      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=250&offset=0')
    })

    it('returns the tracks, totalCount and hasMore from the response', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      const result = await getTidalPlaylistTracks('3.0')

      expect(result?.totalCount).toBe(449)
      expect(result?.hasMore).toBe(true)
      expect(result?.tracks.map((track) => track.position)).toEqual([2, 3])
      expect(result?.tracks.map((track) => track.title)).toEqual(['Layla', 'Satisfaction'])
      expect(result?.tracks[0]?.duration).toBe(434)
      expect(result?.tracks[1]?.duration).toBeUndefined()
    })

    it('encodes an id containing special characters into the request url', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      await getTidalPlaylistTracks('my playlist.2 ümläut/x')

      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        `/api/tidal/playlists/${encodeURIComponent('my playlist.2 ümläut/x')}/tracks?`,
      )
    })

    it('returns undefined on http error, not an empty page', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await getTidalPlaylistTracks('3.0')).toBeUndefined()
    })

    it('returns undefined when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracks: serverPage.tracks }),
      })

      // A silent fallback of `{ tracks: [], hasMore: false }` would read as
      // "this playlist has no more tracks", which is false when the real
      // problem was a malformed response.
      expect(await getTidalPlaylistTracks('3.0')).toBeUndefined()
    })
  })

  describe('playTidalPlaylist', () => {
    it('POSTs { id } to /api/playback/play-tidal-playlist and returns true on 204', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 })

      const result = await playTidalPlaylist('3.0')

      expect(result).toBe(true)
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/playback/play-tidal-playlist')
      expect(call?.[1]?.method).toBe('POST')
      expect(bodyOf(call?.[1])).toEqual({ id: '3.0' })
    })

    it('returns false on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await playTidalPlaylist('3.0')).toBe(false)
    })

    it('does not depend on a response body: a 204 with no body still reports true', async () => {
      // The route responds 204 with no body; treating an unreadable/absent
      // body as failure would break the happy path.
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('no body')),
      })

      expect(await playTidalPlaylist('3.0')).toBe(true)
    })
  })
})
