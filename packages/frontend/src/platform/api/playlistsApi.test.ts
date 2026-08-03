import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  savePlaylist,
  listPlaylists,
  loadPlaylist,
  deletePlaylist,
  renamePlaylist,
  getPlaylistTracks,
  removePlaylistTrack,
} from './playlistsApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const bodyOf = (init: RequestInit | undefined): unknown => JSON.parse(String(init?.body ?? 'null'))

describe('playlistsApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('savePlaylist', () => {
    it('POSTs { name } and returns true on ok', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await savePlaylist('Road trip')

      expect(result).toBe(true)
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/playlists')
      expect(call?.[1]?.method).toBe('POST')
      expect(bodyOf(call?.[1])).toEqual({ name: 'Road trip' })
    })

    it('returns false on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await savePlaylist('')).toBe(false)
    })
  })

  describe('listPlaylists', () => {
    it('GETs and returns the parsed playlists', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          playlists: [
            { id: 'a', name: 'One' },
            { id: 'b', name: 'Two' },
          ],
        }),
      })

      const result = await listPlaylists()

      expect(result).toEqual([
        { id: 'a', name: 'One' },
        { id: 'b', name: 'Two' },
      ])
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/playlists')
      expect(call?.[1]?.method).toBe('GET')
    })

    it('returns [] on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 })

      expect(await listPlaylists()).toEqual([])
    })

    it('returns [] when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      expect(await listPlaylists()).toEqual([])
    })
  })

  describe('loadPlaylist', () => {
    it('POSTs { id } and returns true on ok', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await loadPlaylist('pl-1')

      expect(result).toBe(true)
      const call = fetchMock.mock.calls[0]
      expect(call?.[0]).toContain('/api/playlists/load')
      expect(call?.[1]?.method).toBe('POST')
      expect(bodyOf(call?.[1])).toEqual({ id: 'pl-1' })
    })

    it('returns false on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 })

      expect(await loadPlaylist('missing')).toBe(false)
    })
  })

  describe('renamePlaylist', () => {
    it('PATCHes /api/playlists/:id with { name } and returns true on ok', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await renamePlaylist('pl-1', 'Road trip vol. 2')

      expect(result).toBe(true)
      const call = fetchMock.mock.calls[0]
      expect(String(call?.[0])).toMatch(/\/api\/playlists\/pl-1$/u)
      expect(call?.[1]?.method).toBe('PATCH')
      expect(bodyOf(call?.[1])).toEqual({ name: 'Road trip vol. 2' })
    })

    it('encodes ids containing special characters', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      await renamePlaylist('my mix/2?a=b', 'New')

      const call = fetchMock.mock.calls[0]
      expect(String(call?.[0])).toMatch(/\/api\/playlists\/my%20mix%2F2%3Fa%3Db$/u)
    })

    it('returns false when the server rejects the name', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await renamePlaylist('pl-1', '   ')).toBe(false)
    })

    it('returns false when LMS is unreachable', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await renamePlaylist('pl-1', 'New')).toBe(false)
    })
  })

  describe('deletePlaylist', () => {
    it('DELETEs /api/playlists/:id without a body and returns true on ok', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await deletePlaylist('pl-1')

      expect(result).toBe(true)
      const call = fetchMock.mock.calls[0]
      // Anchored: `toContain` would also pass for `/api/playlists/pl-1/x`.
      expect(String(call?.[0])).toMatch(/\/api\/playlists\/pl-1$/u)
      const init = call?.[1]
      expect(init).toBeDefined()
      expect(init?.method).toBe('DELETE')
      expect(init?.body).toBeUndefined()
    })

    it('encodes ids containing special characters', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      await deletePlaylist('my mix/2?a=b')

      const call = fetchMock.mock.calls[0]
      expect(String(call?.[0])).toMatch(/\/api\/playlists\/my%20mix%2F2%3Fa%3Db$/u)
    })

    it('returns false on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await deletePlaylist('missing')).toBe(false)
    })
  })

  describe('getPlaylistTracks', () => {
    // Not alphabetical, and the indices start at 5: a page from offset 5
    // carries the positions in the whole playlist, not in the page.
    const serverPage = {
      tracks: [
        { index: 5, title: 'Zoo Station', artist: 'U2', album: 'Achtung Baby', duration: 276 },
        { index: 6, title: 'Anthem', artist: 'Leonard Cohen', album: 'The Future' },
        { index: 7, title: 'Bad', artist: 'U2', album: 'The Unforgettable Fire', duration: 366 },
      ],
      hasMore: false,
    }

    it('GETs /api/playlists/:id/tracks with limit and offset', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      await getPlaylistTracks('pl-1', 50, 100)

      const call = fetchMock.mock.calls[0]
      expect(String(call?.[0])).toMatch(/\/api\/playlists\/pl-1\/tracks\?/u)
      expect(String(call?.[0])).toContain('limit=50')
      expect(String(call?.[0])).toContain('offset=100')
      expect(call?.[1]?.method).toBe('GET')
    })

    it('defaults to the first page when limit and offset are omitted', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      await getPlaylistTracks('pl-1')

      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=250&offset=0')
    })

    it('encodes ids containing special characters', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      await getPlaylistTracks('my mix/2?a=b')

      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        '/api/playlists/my%20mix%2F2%3Fa%3Db/tracks?',
      )
    })

    it('returns the tracks in server order with their real playlist indices', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => serverPage })

      const result = await getPlaylistTracks('pl-1')

      expect(result?.tracks.map((track) => track.index)).toEqual([5, 6, 7])
      expect(result?.tracks.map((track) => track.title)).toEqual(['Zoo Station', 'Anthem', 'Bad'])
      expect(result?.tracks[1]?.duration).toBeUndefined()
      expect(result?.tracks[2]?.duration).toBe(366)
    })

    it('takes hasMore from the response when another page exists', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ...serverPage, hasMore: true }),
      })

      expect((await getPlaylistTracks('pl-1'))?.hasMore).toBe(true)
    })

    it('rejects a response without hasMore instead of defaulting it to false', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ tracks: serverPage.tracks }) })

      // A silent `hasMore: false` would look like "the playlist ends here" and
      // hide every track after the first page.
      expect(await getPlaylistTracks('pl-1')).toBeUndefined()
    })

    it('rejects a hasMore that is not a boolean', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracks: [], hasMore: 'yes' }),
      })

      expect(await getPlaylistTracks('pl-1')).toBeUndefined()
    })

    it('rejects a track missing its index', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          tracks: [{ title: 'Bad', artist: 'U2', album: 'The Unforgettable Fire' }],
          hasMore: false,
        }),
      })

      expect(await getPlaylistTracks('pl-1')).toBeUndefined()
    })

    it('returns undefined on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await getPlaylistTracks('pl-1')).toBeUndefined()
    })
  })

  describe('removePlaylistTrack', () => {
    it('DELETEs /api/playlists/:id/tracks/:index without a body', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await removePlaylistTrack('pl-1', 7)

      expect(result).toBe(true)
      const call = fetchMock.mock.calls[0]
      expect(String(call?.[0])).toMatch(/\/api\/playlists\/pl-1\/tracks\/7$/u)
      expect(call?.[1]?.method).toBe('DELETE')
      expect(call?.[1]?.body).toBeUndefined()
    })

    it('puts index 0 into the url', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      await removePlaylistTrack('pl-1', 0)

      // A truthiness check on the index drops exactly the first track.
      expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/playlists\/pl-1\/tracks\/0$/u)
    })

    it('encodes ids containing special characters', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      await removePlaylistTrack('my mix/2?a=b', 3)

      expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
        /\/api\/playlists\/my%20mix%2F2%3Fa%3Db\/tracks\/3$/u,
      )
    })

    it('returns false when the server rejects the index', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await removePlaylistTrack('pl-1', 99)).toBe(false)
    })

    it('returns false when LMS is unreachable', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })

      expect(await removePlaylistTrack('pl-1', 1)).toBe(false)
    })
  })
})
