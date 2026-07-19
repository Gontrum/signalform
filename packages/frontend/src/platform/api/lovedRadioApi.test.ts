import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startLovedRadio } from './lovedRadioApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('lovedRadioApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('startLovedRadio', () => {
    it('sends POST to /api/loved-radio/start and returns the parsed result on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracksAdded: 7 }),
      })

      const result = await startLovedRadio()

      expect(result).toEqual({ tracksAdded: 7 })

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/loved-radio/start')
      expect(fetchCall?.[1]?.method).toBe('POST')
    })

    it('injects the selected-user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracksAdded: 3 }),
      })

      await startLovedRadio()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBe('u1')
    })

    it('sends no user header when no user is selected', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tracksAdded: 3 }),
      })

      await startLovedRadio()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBeNull()
    })

    it('returns null on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 })

      expect(await startLovedRadio()).toBeNull()
    })

    it('returns null when the response shape does not match the schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      expect(await startLovedRadio()).toBeNull()
    })
  })
})
