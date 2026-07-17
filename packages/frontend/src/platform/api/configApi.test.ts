import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getConfig, updateConfig } from './configApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('configApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
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
          hasLastFmSharedSecret: true,
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
      expect(result.value.hasLastFmSharedSecret).toBe(true)
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

    it('passes an optional lmsMacAddress through the masked-config schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lmsHost: '192.168.1.100',
          lmsPort: 9000,
          lmsMacAddress: '00:11:22:33:44:55',
          playerId: 'aa:bb:cc:dd:ee:ff',
          hasLastFmKey: true,
          hasLastFmSharedSecret: true,
          hasFanartKey: false,
          isConfigured: true,
          language: 'en',
        }),
      })

      const result = await getConfig()

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.lmsMacAddress).toBe('00:11:22:33:44:55')
    })

    it('defaults hasLastFmSharedSecret to false when the backend omits it', async () => {
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
      expect(result.value.hasLastFmSharedSecret).toBe(false)
    })

    it('strips per-user Last.fm fields that are no longer part of the config', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lmsHost: '192.168.1.100',
          lmsPort: 9000,
          playerId: 'aa:bb:cc:dd:ee:ff',
          hasLastFmKey: true,
          hasLastFmSharedSecret: true,
          hasFanartKey: false,
          isConfigured: true,
          language: 'en',
          lastFmUsername: 'legacy_user',
          hasLastFmSession: true,
        }),
      })

      const result = await getConfig()

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect('lastFmUsername' in result.value).toBe(false)
      expect('hasLastFmSession' in result.value).toBe(false)
    })

    it('injects the selected-user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lmsHost: '192.168.1.100',
          lmsPort: 9000,
          playerId: 'aa:bb:cc:dd:ee:ff',
          hasLastFmKey: true,
          hasLastFmSharedSecret: true,
          hasFanartKey: false,
          isConfigured: true,
          language: 'en',
        }),
      })

      await getConfig()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBe('u1')
    })

    it('does not add a user header when no user is selected', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lmsHost: '192.168.1.100',
          lmsPort: 9000,
          playerId: 'aa:bb:cc:dd:ee:ff',
          hasLastFmKey: true,
          hasLastFmSharedSecret: true,
          hasFanartKey: false,
          isConfigured: true,
          language: 'en',
        }),
      })

      await getConfig()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBeNull()
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
          hasLastFmSharedSecret: false,
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
