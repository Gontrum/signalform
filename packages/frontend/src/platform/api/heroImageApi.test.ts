import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Result } from '@signalform/shared'
import { getArtistHeroImage } from './heroImageApi'
import type { HeroImageApiError } from './heroImageApi'

const fetchMock = vi.fn()

describe('heroImageApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const givenApiReturns200 = (data: unknown): void => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    })
  }

  const givenApiReturnsStatus = (status: number): void => {
    fetchMock.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({}),
    })
  }

  it('returns ok(url) when API returns imageUrl string', async () => {
    givenApiReturns200({ imageUrl: 'https://assets.fanart.tv/fanart/music/artist.jpg' })

    const result: Result<string | null, HeroImageApiError> = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('https://assets.fanart.tv/fanart/music/artist.jpg')
    }
  })

  it('returns ok(null) when API returns imageUrl null', async () => {
    givenApiReturns200({ imageUrl: null })

    const result = await getArtistHeroImage('Unknown Artist')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBeNull()
    }
  })

  it('calls the correct endpoint with encoded artist name', async () => {
    givenApiReturns200({ imageUrl: null })

    await getArtistHeroImage('Die Ärzte')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/enrichment/artist/images?name=Die%20%C3%84rzte'),
      expect.any(Object),
    )
  })

  it('returns err(NOT_FOUND) on 404 response', async () => {
    givenApiReturnsStatus(404)

    const result = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('NOT_FOUND')
    }
  })

  it('returns err(SERVER_ERROR) on 503 response', async () => {
    givenApiReturnsStatus(503)

    const result = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('SERVER_ERROR')
      if (result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(503)
      }
    }
  })

  it('returns err(NETWORK_ERROR) on fetch rejection', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'))

    const result = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('NETWORK_ERROR')
    }
  })

  it('returns err(TIMEOUT_ERROR) on AbortSignal timeout', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    )

    const result = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('TIMEOUT_ERROR')
    }
  })

  it('returns err(ABORT_ERROR) on manual abort', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

    const result = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('ABORT_ERROR')
    }
  })

  it('returns err(PARSE_ERROR) on malformed JSON response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpectedField: 'bad' }),
    })

    const result = await getArtistHeroImage('Radiohead')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })
})
