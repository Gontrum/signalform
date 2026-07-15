import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loveTrack, unloveTrack } from './lastFmLoveApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('lastFmLoveApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('loveTrack', () => {
    it('sends POST with artist and track and returns true on success', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      const result = await loveTrack('Radiohead', 'Reckoner')

      expect(result).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/lastfm/love')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(fetchCall?.[1]?.body).toBe(JSON.stringify({ artist: 'Radiohead', track: 'Reckoner' }))
    })

    it('injects the selected-user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({ ok: true })

      await loveTrack('Radiohead', 'Reckoner')

      const init = fetchMock.mock.calls[0]?.[1]
      const headers = new Headers(init?.headers)
      expect(headers.get(USER_HEADER_NAME)).toBe('u1')
      expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('returns false on http error', async () => {
      fetchMock.mockResolvedValue({ ok: false })

      expect(await loveTrack('Radiohead', 'Reckoner')).toBe(false)
    })

    it('returns false when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      expect(await loveTrack('Radiohead', 'Reckoner')).toBe(false)
    })
  })

  describe('unloveTrack', () => {
    it('sends DELETE with the user header when a user is selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u2')
      fetchMock.mockResolvedValue({ ok: true })

      const result = await unloveTrack('Radiohead', 'Reckoner')

      expect(result).toBe(true)

      const init = fetchMock.mock.calls[0]?.[1]
      expect(init?.method).toBe('DELETE')
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBe('u2')
    })

    it('sends no user header when no user is selected', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      await unloveTrack('Radiohead', 'Reckoner')

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBeNull()
    })
  })
})
