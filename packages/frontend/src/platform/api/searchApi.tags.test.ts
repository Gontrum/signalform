/**
 * searchApi — `tags` on the full-results response.
 *
 * Sibling of searchApi.test.ts (see AGENTS.md "Testing", 20 KB rule) —
 * covers only the new `tags` field on `fetchFullResults`. `tags` is
 * non-optional like `tracks`/`albums`/`artists`: an older backend that omits
 * it fails parsing rather than degrading silently, the same way a backend
 * missing `albums` already does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchFullResults } from './searchApi'

const fetchMock = vi.fn()

describe('fetchFullResults — tags', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses tags sorted by displayName as returned by the server', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: [],
        albums: [],
        artists: [],
        tags: [
          { query: 'hi-res-audio', displayName: 'Hi-Res Audio', albumCount: 3 },
          { query: 'qsound', displayName: 'QSound', albumCount: 12 },
        ],
        query: 'qso',
        totalResults: 2,
      }),
    })

    const result = await fetchFullResults('qso')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tags).toEqual([
        { query: 'hi-res-audio', displayName: 'Hi-Res Audio', albumCount: 3 },
        { query: 'qsound', displayName: 'QSound', albumCount: 12 },
      ])
    }
  })

  it('parses an empty tags array when no tag matched the query', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: [],
        albums: [],
        artists: [],
        tags: [],
        query: 'nonexistent',
        totalResults: 0,
      }),
    })

    const result = await fetchFullResults('nonexistent')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tags).toEqual([])
    }
  })

  it('returns PARSE_ERROR when an older backend response omits tags entirely', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: [],
        albums: [],
        artists: [],
        // tags intentionally omitted — pre-upgrade backend shape
        query: 'test',
        totalResults: 0,
      }),
    })

    const result = await fetchFullResults('test')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })
})
