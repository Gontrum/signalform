import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setSleepTimer, getSleepTimer } from './sleepTimerApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('sleepTimerApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  describe('setSleepTimer', () => {
    it('sends POST with { seconds } (1800 for 30 min) and returns ok on 204', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 })

      const result = await setSleepTimer(1800)

      expect(result.ok).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(String(fetchCall?.[0])).toContain('/api/playback/sleep')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(fetchCall?.[1]?.body).toBe(JSON.stringify({ seconds: 1800 }))
      expect(new Headers(fetchCall?.[1]?.headers).get('Content-Type')).toBe('application/json')
    })

    it('posts { seconds: 0 } when cancelling', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 })

      await setSleepTimer(0)

      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ seconds: 0 }))
    })

    it('returns a VALIDATION_ERROR on http 400', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'out of range' }),
      })

      const result = await setSleepTimer(999999)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
      }
    })

    it('returns a NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      const result = await setSleepTimer(1800)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('getSleepTimer', () => {
    it('sends GET and returns remainingSeconds from the parsed body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ remainingSeconds: 1200 }),
      })

      const result = await getSleepTimer()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(1200)
      }

      const fetchCall = fetchMock.mock.calls[0]
      expect(String(fetchCall?.[0])).toContain('/api/playback/sleep')
      expect(fetchCall?.[1]?.method).toBe('GET')
    })

    it('returns 0 when no timer is active', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ remainingSeconds: 0 }),
      })

      const result = await getSleepTimer()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(0)
      }
    })

    it('returns a PARSE_ERROR when the response shape is wrong', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      })

      const result = await getSleepTimer()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })
})
