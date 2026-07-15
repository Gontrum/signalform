import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { completeLastFmAuth, disconnectLastFm, requestLastFmAuth } from './lastFmAuthApi'

const fetchMock = vi.fn()

describe('lastFmAuthApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('requestLastFmAuth', () => {
    it('returns token and authUrl on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'tok123', authUrl: 'https://last.fm/auth' }),
      })

      const result = await requestLastFmAuth()

      expect(result).toEqual({ token: 'tok123', authUrl: 'https://last.fm/auth' })
    })
  })

  describe('completeLastFmAuth', () => {
    it('sends token and userId in the request body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ username: 'ada_fm' }),
      })

      const result = await completeLastFmAuth('tok123', 'u1')

      expect(result).toEqual({ username: 'ada_fm' })

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/lastfm/auth/complete')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(fetchCall?.[1]?.body).toBe(JSON.stringify({ token: 'tok123', userId: 'u1' }))
    })

    it('returns null on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })

      expect(await completeLastFmAuth('tok123', 'u1')).toBeNull()
    })
  })

  describe('disconnectLastFm', () => {
    it('sends DELETE to /api/lastfm/auth/:userId', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await disconnectLastFm('u1')

      expect(result).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/lastfm/auth/u1')
      expect(fetchCall?.[1]?.method).toBe('DELETE')
    })

    it('returns false when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      expect(await disconnectLastFm('u1')).toBe(false)
    })
  })
})
