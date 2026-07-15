import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startPersonalRadio } from './personalRadioApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('personalRadioApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('startPersonalRadio', () => {
    it('sends POST and returns the parsed result on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracksAdded: 12, seedArtists: ['Radiohead', 'Portishead'] }),
      })

      const result = await startPersonalRadio()

      expect(result).toEqual({ tracksAdded: 12, seedArtists: ['Radiohead', 'Portishead'] })

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/personal-radio/start')
      expect(fetchCall?.[1]?.method).toBe('POST')
    })

    it('injects the selected-user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracksAdded: 3, seedArtists: [] }),
      })

      await startPersonalRadio()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBe('u1')
    })

    it('sends no user header when no user is selected', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracksAdded: 3, seedArtists: [] }),
      })

      await startPersonalRadio()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBeNull()
    })

    it('returns null on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await startPersonalRadio()).toBeNull()
    })

    it('returns null when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      expect(await startPersonalRadio()).toBeNull()
    })
  })
})
