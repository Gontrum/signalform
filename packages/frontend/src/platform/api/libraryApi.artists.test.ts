/**
 * getLibraryArtists — sibling of libraryApi.test.ts so the artist-browser cases
 * do not grow the album/genre suite any further.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getLibraryArtists } from './libraryApi'

const fetchMock = vi.fn()

const requestedUrl = (): string => {
  const [url] = fetchMock.mock.calls[0] ?? []
  return typeof url === 'string' ? url : String(url)
}

const requestedQuery = (): string => requestedUrl().split('?')[1] ?? ''

const okResponse = (body: unknown): unknown => ({
  ok: true,
  status: 200,
  json: async () => body,
})

// Deliberately not alphabetical: a client-side re-sort would show up here.
const serverPage = {
  artists: [
    { id: '17', name: 'Tocotronic' },
    { id: '3', name: 'ABBA' },
    { id: '9', name: 'Kraftwerk' },
  ],
  hasMore: false,
} as const

describe('getLibraryArtists', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('requests the artists endpoint with the default window', async () => {
    fetchMock.mockResolvedValue(okResponse(serverPage))

    await getLibraryArtists()

    expect(requestedUrl()).toContain('/api/library/artists')
    expect(requestedQuery()).toBe('limit=250&offset=0')
  })

  it('sends the given limit and offset', async () => {
    fetchMock.mockResolvedValue(okResponse(serverPage))

    await getLibraryArtists(60, 120)

    expect(requestedQuery()).toBe('limit=60&offset=120')
  })

  it('sends a trimmed and percent-encoded search term', async () => {
    fetchMock.mockResolvedValue(okResponse(serverPage))

    await getLibraryArtists(60, 0, { search: '  die ärzte  ' })

    expect(requestedQuery()).toBe('limit=60&offset=0&search=die%20%C3%A4rzte')
  })

  it('omits search when it is undefined or blank', async () => {
    fetchMock.mockResolvedValue(okResponse(serverPage))

    await getLibraryArtists(60, 0, { search: '   ' })

    expect(requestedUrl()).not.toContain('search')
  })

  it('keeps the artists in the order the server sent them', async () => {
    fetchMock.mockResolvedValue(okResponse(serverPage))

    const result = await getLibraryArtists()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.artists).toEqual([
        { id: '17', name: 'Tocotronic' },
        { id: '3', name: 'ABBA' },
        { id: '9', name: 'Kraftwerk' },
      ])
    }
  })

  it('takes hasMore from the response when another page exists', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...serverPage, hasMore: true }))

    const result = await getLibraryArtists()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.hasMore).toBe(true)
    }
  })

  // A missing flag must not slip through as `false`: that would strand the user
  // on page one of an artist list that has more.
  it('rejects a response without hasMore instead of defaulting it', async () => {
    fetchMock.mockResolvedValue(okResponse({ artists: [] }))

    const result = await getLibraryArtists()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  it('rejects a hasMore that is not a boolean', async () => {
    fetchMock.mockResolvedValue(okResponse({ artists: [], hasMore: 'yes' }))

    const result = await getLibraryArtists()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  it('rejects an artist entry with the wrong shape', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ artists: [{ id: 17, name: 'Tocotronic' }], hasMore: false }),
    )

    const result = await getLibraryArtists()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  it('returns SERVER_ERROR with the server message on 503', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'LMS not reachable', code: 'LMS_UNREACHABLE' }),
    })

    const result = await getLibraryArtists()

    expect(result.ok).toBe(false)
    if (!result.ok && result.error.type === 'SERVER_ERROR') {
      expect(result.error.status).toBe(503)
      expect(result.error.message).toBe('LMS not reachable')
    } else {
      expect.unreachable('expected a SERVER_ERROR result')
    }
  })

  it('returns SERVER_ERROR on a rejected query (400)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid query parameters', code: 'INVALID_INPUT' }),
    })

    const result = await getLibraryArtists(-1, 0)

    expect(result.ok).toBe(false)
    if (!result.ok && result.error.type === 'SERVER_ERROR') {
      expect(result.error.status).toBe(400)
      expect(result.error.message).toBe('Invalid query parameters')
    } else {
      expect.unreachable('expected a SERVER_ERROR result')
    }
  })

  it('returns TIMEOUT_ERROR on TimeoutError', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

    const result = await getLibraryArtists()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('TIMEOUT_ERROR')
    }
  })

  it('returns NETWORK_ERROR on generic network failure', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await getLibraryArtists()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('NETWORK_ERROR')
    }
  })
})
