import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  savePlaylist,
  listPlaylists,
  loadPlaylist,
  deletePlaylist,
  renamePlaylist,
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
})
