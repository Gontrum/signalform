import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getConfig, updateConfig } from './configApi'

const fetchMock = vi.fn()

describe('configApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getConfig', () => {
    it('returns MaskedConfig on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lmsHost: '192.168.1.100',
          lmsPort: 9000,
          playerId: 'aa:bb:cc:dd:ee:ff',
          hasLastFmKey: true,
          hasFanartKey: false,
          isConfigured: true,
          language: 'en',
        }),
      })

      const result = await getConfig()

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.lmsHost).toBe('192.168.1.100')
      expect(result.value.isConfigured).toBe(true)
    })

    it('returns SERVER_ERROR on non-200', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })

      const result = await getConfig()

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.type).toBe('SERVER_ERROR')
    })

    it('returns NETWORK_ERROR on fetch failure', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      const result = await getConfig()

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.type).toBe('NETWORK_ERROR')
    })
  })

  describe('updateConfig', () => {
    it('sends PUT with updates and returns updated config', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lmsHost: '192.168.1.200',
          lmsPort: 9000,
          playerId: 'ff:ee:dd:cc:bb:aa',
          hasLastFmKey: false,
          hasFanartKey: false,
          isConfigured: true,
          language: 'de',
        }),
      })

      const result = await updateConfig({
        lmsHost: '192.168.1.200',
        playerId: 'ff:ee:dd:cc:bb:aa',
        language: 'de',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.lmsHost).toBe('192.168.1.200')
      expect(result.value.playerId).toBe('ff:ee:dd:cc:bb:aa')
      expect(result.value.language).toBe('de')

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[1]?.method).toBe('PUT')
    })
  })
})
