/**
 * searchApi — `tags` on the full-results response.
 *
 * Sibling of searchApi.test.ts (see AGENTS.md "Testing", 20 KB rule) —
 * covers only the `tags` field on `fetchFullResults`. `tags` is a secondary
 * field: a backend that omits it must not take tracks, albums and artists
 * down with it.
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

  it('degrades to an empty tags list when the response omits tags, keeping all other results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: [
          {
            id: 'track-1',
            title: 'Cloudbusting',
            artist: 'Kate Bush',
            album: 'Hounds of Love',
            duration: 341,
            url: 'file:///music/cloudbusting.flac',
            source: 'local',
          },
        ],
        albums: [
          {
            id: 'album-1',
            albumId: '4711',
            title: 'Hounds of Love',
            artist: 'Kate Bush',
            trackCount: 12,
          },
        ],
        artists: [{ name: 'Kate Bush', artistId: 'artist-1' }],
        // tags intentionally omitted — pre-upgrade backend shape
        query: 'kate bush',
        totalResults: 3,
      }),
    })

    const result = await fetchFullResults('kate bush')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tags).toEqual([])
      expect(result.value.tracks).toEqual([
        {
          id: 'track-1',
          title: 'Cloudbusting',
          artist: 'Kate Bush',
          album: 'Hounds of Love',
          duration: 341,
          url: 'file:///music/cloudbusting.flac',
          source: 'local',
        },
      ])
      expect(result.value.albums).toEqual([
        {
          id: 'album-1',
          albumId: '4711',
          title: 'Hounds of Love',
          artist: 'Kate Bush',
          trackCount: 12,
        },
      ])
      expect(result.value.artists).toEqual([{ name: 'Kate Bush', artistId: 'artist-1' }])
      expect(result.value.query).toBe('kate bush')
      expect(result.value.totalResults).toBe(3)
    }
  })
})
