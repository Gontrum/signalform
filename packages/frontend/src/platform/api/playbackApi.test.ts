import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { RepeatMode, ShuffleMode } from '@signalform/shared'
import { setShuffleMode, setRepeatMode, getPlaybackStatus } from './playbackApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const readBody = (): unknown => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))

describe('playbackApi shuffle/repeat', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('setShuffleMode', () => {
    it('POSTs the mode as JSON to /api/playback/shuffle', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 })

      const result = await setShuffleMode('songs')

      expect(result.ok).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(String(fetchCall?.[0])).toContain('/api/playback/shuffle')
      expect(String(fetchCall?.[0])).not.toContain('/api/playback/repeat')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(new Headers(fetchCall?.[1]?.headers).get('Content-Type')).toBe('application/json')
    })

    // Each mode asserted on its own: a swapped or hard-coded mapping in the
    // request body would still produce a valid-looking POST otherwise.
    it.each<ShuffleMode>(['off', 'songs', 'albums'])(
      'sends %s through unchanged in the body',
      async (mode) => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 })

        await setShuffleMode(mode)

        expect(readBody()).toEqual({ mode })
      },
    )

    it('returns a VALIDATION_ERROR on http 400', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'VALIDATION_ERROR' }),
      })

      const result = await setShuffleMode('albums')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
      }
    })

    it('returns a SERVER_ERROR when LMS is unreachable (503)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Cannot connect to music server' }),
      })

      const result = await setShuffleMode('songs')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns a NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      const result = await setShuffleMode('songs')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('setRepeatMode', () => {
    it('POSTs the mode as JSON to /api/playback/repeat', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 })

      const result = await setRepeatMode('playlist')

      expect(result.ok).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(String(fetchCall?.[0])).toContain('/api/playback/repeat')
      expect(String(fetchCall?.[0])).not.toContain('/api/playback/shuffle')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(new Headers(fetchCall?.[1]?.headers).get('Content-Type')).toBe('application/json')
    })

    it.each<RepeatMode>(['off', 'track', 'playlist'])(
      'sends %s through unchanged in the body',
      async (mode) => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 })

        await setRepeatMode(mode)

        expect(readBody()).toEqual({ mode })
      },
    )

    it('returns a VALIDATION_ERROR on http 400', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'VALIDATION_ERROR' }),
      })

      const result = await setRepeatMode('track')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
      }
    })

    it('returns a SERVER_ERROR when LMS is unreachable (503)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Cannot connect to music server' }),
      })

      const result = await setRepeatMode('playlist')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns a NETWORK_ERROR when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      const result = await setRepeatMode('track')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('getPlaybackStatus', () => {
    it('parses shuffle and repeat from the status body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'playing',
          currentTime: 12,
          queuePreview: [],
          shuffle: 'albums',
          repeat: 'track',
        }),
      })

      const result = await getPlaybackStatus()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shuffle).toBe('albums')
        expect(result.value.repeat).toBe('track')
      }
    })

    it('still parses a status without the mode fields', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'paused', currentTime: 0, queuePreview: [] }),
      })

      const result = await getPlaybackStatus()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shuffle).toBeUndefined()
        expect(result.value.repeat).toBeUndefined()
      }
    })

    it('rejects a status carrying a mode the app does not know', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'playing',
          currentTime: 0,
          queuePreview: [],
          shuffle: 'sideways',
        }),
      })

      const result = await getPlaybackStatus()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })
})
