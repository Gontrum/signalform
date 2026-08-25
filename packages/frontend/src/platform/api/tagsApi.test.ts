import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTagAlbumsPage } from './tagsApi'
import type { TagAlbumsPage } from './tagsApi'

const fetchMock = vi.fn()

const requestedUrl = (): string => {
  const [url] = fetchMock.mock.calls[0] ?? []
  return typeof url === 'string' ? url : String(url)
}

const makePage = (): TagAlbumsPage => ({
  albums: [
    {
      artist: 'Madonna',
      title: 'The Immaculate Collection',
      year: 1990,
      coverArtUrl: 'http://localhost:9000/music/c1a4667e/cover.jpg',
      source: 'local',
      albumId: '883',
    },
  ],
  hasMore: true,
  totalCandidates: 75,
})

const okResponse = (body: unknown): unknown => ({
  ok: true,
  status: 200,
  json: async () => body,
})

describe('tagsApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('getTagAlbumsPage', () => {
    it('returns a local album with its albumId and the cover sent through the proxy', async () => {
      fetchMock.mockResolvedValue(okResponse(makePage()))

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums).toHaveLength(1)
        expect(result.value.albums[0]).toEqual({
          artist: 'Madonna',
          title: 'The Immaculate Collection',
          year: 1990,
          source: 'local',
          albumId: '883',
          coverArtUrl:
            '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2Fc1a4667e%2Fcover.jpg',
        })
        expect(result.value.hasMore).toBe(true)
        expect(result.value.totalCandidates).toBe(75)
      }
    })

    it('returns a Tidal album without an albumId, cover proxied the same way', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          albums: [
            {
              artist: 'Sting',
              title: 'The Soul Cages',
              year: 1991,
              coverArtUrl: 'http://localhost:9000/imageproxy/sting/image.jpg',
              source: 'tidal',
            },
          ],
          hasMore: true,
          totalCandidates: 75,
        }),
      )

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums[0]?.source).toBe('tidal')
        expect(result.value.albums[0]).not.toHaveProperty('albumId')
        expect(result.value.albums[0]?.coverArtUrl).toBe(
          '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fimageproxy%2Fsting%2Fimage.jpg',
        )
      }
    })

    it('omits year when the server sent none', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          albums: [
            {
              artist: 'Deep Forest',
              title: 'Boheme',
              coverArtUrl: 'https://cdn.example/boheme.jpg',
              source: 'tidal',
            },
          ],
          hasMore: false,
          totalCandidates: 1,
        }),
      )

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums[0]).not.toHaveProperty('year')
        expect(result.value.albums[0]?.coverArtUrl).toBe('https://cdn.example/boheme.jpg')
      }
    })

    it('rejects an album without coverArtUrl instead of rendering a coverless card', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          albums: [{ artist: 'Deep Forest', title: 'Boheme', source: 'local', albumId: '12' }],
          hasMore: false,
          totalCandidates: 1,
        }),
      )

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('rejects an unknown source value instead of coercing it', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          albums: [
            {
              artist: 'Deep Forest',
              title: 'Boheme',
              coverArtUrl: 'https://cdn.example/boheme.jpg',
              source: 'discogs',
            },
          ],
          hasMore: false,
          totalCandidates: 1,
        }),
      )

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('builds a tag-only query string, without an empty q', async () => {
      fetchMock.mockResolvedValue(okResponse(makePage()))

      await getTagAlbumsPage('qsound', '', 24, 12)

      const [path, search] = requestedUrl().split('?')
      expect(path).toContain('/api/tags/discogs/albums')
      expect(search).toBe('tag=qsound&offset=24&limit=12')
      expect(search).not.toContain('q=')
    })

    it('adds the free text as q when there is any', async () => {
      fetchMock.mockResolvedValue(okResponse(makePage()))

      await getTagAlbumsPage('sacd', 'miles davis', 0, 12)

      const [, search] = requestedUrl().split('?')
      expect(search).toBe('tag=sacd&q=miles+davis&offset=0&limit=12')
    })

    it('maps a 503 with DISCOGS_UNREACHABLE code onto SERVER_ERROR with that code', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'Discogs is down', code: 'DISCOGS_UNREACHABLE' }),
      })

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
        expect(result.error).toMatchObject({ status: 503, code: 'DISCOGS_UNREACHABLE' })
      }
    })

    it('maps a 400 without a code onto SERVER_ERROR with no code', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'q is required' }),
      })

      const result = await getTagAlbumsPage('sacd', '', 0, 12)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
        if (result.error.type === 'SERVER_ERROR') {
          expect(result.error.code).toBeUndefined()
        }
      }
    })

    it('rejects a response missing hasMore instead of defaulting it', async () => {
      fetchMock.mockResolvedValue(okResponse({ albums: [], totalCandidates: 0 }))

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })

    it('maps a thrown network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      const result = await getTagAlbumsPage('qsound', '', 0, 12)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })
  })
})
