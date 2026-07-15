import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startGenreRadio } from './genreRadioApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('genreRadioApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('startGenreRadio', () => {
    it('sends POST with the genre name and returns the parsed result on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ genreName: 'shoegaze', tracksAdded: 8 }),
      })

      const result = await startGenreRadio('shoegaze')

      expect(result).toEqual({ genreName: 'shoegaze', tracksAdded: 8 })

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/genre-radio/start')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(fetchCall?.[1]?.body).toBe(JSON.stringify({ genreName: 'shoegaze' }))
    })

    it('injects the selected-user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ genreName: 'shoegaze', tracksAdded: 8 }),
      })

      await startGenreRadio('shoegaze')

      const init = fetchMock.mock.calls[0]?.[1]
      const headers = new Headers(init?.headers)
      expect(headers.get(USER_HEADER_NAME)).toBe('u1')
      expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('sends no user header when no user is selected', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ genreName: 'shoegaze', tracksAdded: 8 }),
      })

      await startGenreRadio('shoegaze')

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBeNull()
    })

    it('returns null on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await startGenreRadio('shoegaze')).toBeNull()
    })

    it('returns null when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      expect(await startGenreRadio('shoegaze')).toBeNull()
    })
  })
})
