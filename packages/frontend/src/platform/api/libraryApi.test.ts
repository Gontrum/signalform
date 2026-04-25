import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getLibraryAlbums } from './libraryApi'
import type { LibraryAlbumsResponse, LibraryApiError } from './libraryApi'
import type { Result } from '@signalform/shared'

const makeLibraryResponse = (): LibraryAlbumsResponse => ({
  albums: [
    {
      id: '42',
      title: 'The Wall',
      artist: 'Pink Floyd',
      releaseYear: 1979,
      genre: null,
      coverArtUrl: 'http://localhost:9000/music/abc123/cover.jpg',
    },
  ],
  totalCount: 1,
})

const fetchMock = vi.fn()

describe('libraryApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('getLibraryAlbums', () => {
    it('returns LibraryAlbumsResponse on 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeLibraryResponse(),
      })

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.albums).toHaveLength(1)
        expect(result.value.albums[0]?.id).toBe('42')
        expect(result.value.totalCount).toBe(1)
      }
    })

    it('uses default limit=250 and offset=0', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeLibraryResponse(),
      })

      await getLibraryAlbums()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=250'),
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=0'),
        expect.any(Object),
      )
    })

    it('passes custom limit and offset', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeLibraryResponse(),
      })

      await getLibraryAlbums(50, 100)

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=100'),
        expect.any(Object),
      )
    })

    it('returns SERVER_ERROR on 503', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'LMS unreachable' }),
      })

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SERVER_ERROR')
      }
    })

    it('returns TIMEOUT_ERROR on TimeoutError', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

      const result: Result<LibraryAlbumsResponse, LibraryApiError> = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TIMEOUT_ERROR')
      }
    })

    it('returns ABORT_ERROR on AbortError', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('ABORT_ERROR')
      }
    })

    it('returns NETWORK_ERROR on generic network failure', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('NETWORK_ERROR')
      }
    })

    it('uses correct API base URL from env', async () => {
      vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001')
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeLibraryResponse(),
      })

      await getLibraryAlbums()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3001'),
        expect.any(Object),
      )
    })

    it('returns PARSE_ERROR when response shape does not match schema', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wrongField: 'not-a-library-response' }),
      })

      const result = await getLibraryAlbums()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('PARSE_ERROR')
      }
    })
  })
})
