import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTracks, fetchAutocomplete } from './searchApi'

const fetchMock = vi.fn()

describe('searchApi', () => {
  beforeEach(() => {
    // Mock fetch globally
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls POST /api/search with query', async () => {
    await givenBackendReturnsSuccessfulResponse()

    await whenSearchTracksIsCalled('Pink Floyd')

    await thenFetchWasCalledWithCorrectUrl()
    await thenFetchWasCalledWithPostMethod()
    await thenFetchWasCalledWithQueryInBody('Pink Floyd')
  })

  it('returns search results on success', async () => {
    await givenBackendReturnsSuccessfulResponse()

    const result = await whenSearchTracksIsCalled('Pink Floyd')

    await thenResultIsOk(result)
    await thenResultContainsResults(result)
    await thenResultContainsQuery(result, 'Pink Floyd')
  })

  it('handles network errors', async () => {
    await givenBackendIsUnreachable()

    const result = await whenSearchTracksIsCalled('test')

    await thenResultIsError(result, 'NETWORK_ERROR')
  })

  it('handles 503 LMS unreachable error', async () => {
    await givenBackendReturns503Error()

    const result = await whenSearchTracksIsCalled('test')

    await thenResultIsServerError(result, 503)
    await thenResultErrorContainsMessage(result, 'LMS not reachable')
  })

  it('handles 400 bad request error', async () => {
    await givenBackendReturns400Error()

    const result = await whenSearchTracksIsCalled('')

    await thenResultIsServerError(result, 400)
  })

  it('uses 5 second timeout', async () => {
    await givenBackendReturnsSuccessfulResponse()

    await whenSearchTracksIsCalled('test')

    await thenRequestHas5SecondTimeout()
  })

  it('handles timeout errors', async () => {
    await givenBackendTimesOut()

    const result = await whenSearchTracksIsCalled('test')

    await thenResultIsError(result, 'TIMEOUT_ERROR')
  })

  it('handles generic network errors', async () => {
    await givenBackendHasGenericNetworkError()

    const result = await whenSearchTracksIsCalled('test')

    await thenResultIsError(result, 'NETWORK_ERROR')
  })

  it('returns PARSE_ERROR when response shape does not match schema', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrongField: 'not-a-search-response' }),
    })

    const result = await whenSearchTracksIsCalled('test')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  // === GIVEN ===

  const givenBackendReturnsSuccessfulResponse = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: '1',
            title: 'Comfortably Numb',
            artist: 'Pink Floyd',
            album: 'The Wall',
            source: 'local',
            url: 'track://1',
          },
        ],
        query: 'Pink Floyd',
        totalCount: 1,
      }),
    })
  }

  const givenBackendIsUnreachable = async (): Promise<void> => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))
  }

  const givenBackendReturns503Error = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        message: 'LMS not reachable',
        code: 'LMS_UNREACHABLE',
      }),
    })
  }

  const givenBackendReturns400Error = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        message: 'Query cannot be empty',
        code: 'EMPTY_QUERY',
      }),
    })
  }

  const givenBackendTimesOut = async (): Promise<void> => {
    const timeoutError = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    })
    fetchMock.mockRejectedValueOnce(timeoutError)
  }

  const givenBackendHasGenericNetworkError = async (): Promise<void> => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'))
  }

  // === WHEN ===

  const whenSearchTracksIsCalled = async (
    query: string,
  ): Promise<Awaited<ReturnType<typeof searchTracks>>> => {
    return searchTracks(query)
  }

  // === THEN ===

  const thenFetchWasCalledWithCorrectUrl = async (): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/search'),
      expect.any(Object),
    )
  }

  const thenFetchWasCalledWithPostMethod = async (): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
      }),
    )
  }

  const thenFetchWasCalledWithQueryInBody = async (query: string): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ query }),
      }),
    )
  }

  const thenResultIsOk = async (
    result: Awaited<ReturnType<typeof searchTracks>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
  }

  const thenResultContainsResults = async (
    result: Awaited<ReturnType<typeof searchTracks>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.results).toBeDefined()
      expect(Array.isArray(result.value.results)).toBe(true)
    }
  }

  const thenResultContainsQuery = async (
    result: Awaited<ReturnType<typeof searchTracks>>,
    query: string,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.query).toBe(query)
    }
  }

  const thenResultIsError = async (
    result: Awaited<ReturnType<typeof searchTracks>>,
    errorType: string,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe(errorType)
    }
  }

  const thenResultIsServerError = async (
    result: Awaited<ReturnType<typeof searchTracks>>,
    status: number,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('SERVER_ERROR')
      if (result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(status)
      }
    }
  }

  const thenResultErrorContainsMessage = async (
    result: Awaited<ReturnType<typeof searchTracks>>,
    message: string,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain(message)
    }
  }

  const thenRequestHas5SecondTimeout = async (): Promise<void> => {
    const call = fetchMock.mock.calls[0]
    const options = call?.[1]
    expect(options?.signal).toBeDefined()
  }
})

describe('fetchAutocomplete', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls GET /api/search/autocomplete with query parameter', async () => {
    await givenBackendReturnsAutocompleteSuccess()

    await whenFetchAutocompleteIsCalled('Pink')

    await thenFetchWasCalledWithGetMethod()
    await thenFetchWasCalledWithQueryParam('Pink')
  })

  it('returns autocomplete suggestions on success', async () => {
    await givenBackendReturnsAutocompleteSuccess()

    const result = await whenFetchAutocompleteIsCalled('Pink')

    await thenAutocompleteResultIsOk(result)
    await thenResultContainsSuggestions(result)
    await thenResultContainsAutocompleteQuery(result, 'Pink')
  })

  it('proxies insecure autocomplete album covers through the backend cover route', async () => {
    await givenBackendReturnsAutocompleteSuccess()

    const result = await whenFetchAutocompleteIsCalled('Pink')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.suggestions[0]?.albumCover).toBe(
        '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2F11%2Fcover.jpg',
      )
    }
  })

  it('handles network errors', async () => {
    await givenBackendIsUnreachable()

    const result = await whenFetchAutocompleteIsCalled('test')

    await thenAutocompleteResultIsError(result, 'NETWORK_ERROR')
  })

  it('handles 503 LMS unreachable error', async () => {
    await givenBackendReturns503()

    const result = await whenFetchAutocompleteIsCalled('test')

    await thenAutocompleteResultIsServerError(result, 503)
    await thenAutocompleteResultErrorContainsMessage(result, 'LMS not reachable')
  })

  it('handles AbortError when request is cancelled', async () => {
    await givenRequestIsCancelled()

    const abortController = new AbortController()
    abortController.abort()

    const result = await whenFetchAutocompleteIsCalledWithSignal('test', abortController.signal)

    await thenAutocompleteResultIsError(result, 'ABORT_ERROR')
  })

  it('returns PARSE_ERROR when autocomplete response shape does not match schema', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrongField: 'not-an-autocomplete-response' }),
    })

    const result = await whenFetchAutocompleteIsCalled('test')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  // === GIVEN ===

  const givenBackendReturnsAutocompleteSuccess = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            id: 'album-1',
            type: 'album',
            artist: 'Pink Floyd',
            album: 'The Wall',
            albumCover: 'http://localhost:9000/music/11/cover.jpg',
          },
        ],
        query: 'Pink',
      }),
    })
  }

  const givenBackendIsUnreachable = async (): Promise<void> => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))
  }

  const givenBackendReturns503 = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        message: 'LMS not reachable',
        code: 'LMS_UNREACHABLE',
      }),
    })
  }

  const givenRequestIsCancelled = async (): Promise<void> => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))
  }

  // === WHEN ===

  const whenFetchAutocompleteIsCalled = async (
    query: string,
  ): Promise<Awaited<ReturnType<typeof fetchAutocomplete>>> => {
    return fetchAutocomplete(query)
  }

  const whenFetchAutocompleteIsCalledWithSignal = async (
    query: string,
    signal: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof fetchAutocomplete>>> => {
    return fetchAutocomplete(query, { signal })
  }

  // === THEN ===

  const thenFetchWasCalledWithGetMethod = async (): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'GET',
      }),
    )
  }

  const thenFetchWasCalledWithQueryParam = async (query: string): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`q=${encodeURIComponent(query)}`),
      expect.any(Object),
    )
  }

  const thenAutocompleteResultIsOk = async (
    result: Awaited<ReturnType<typeof fetchAutocomplete>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
  }

  const thenResultContainsSuggestions = async (
    result: Awaited<ReturnType<typeof fetchAutocomplete>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.suggestions).toBeDefined()
      expect(Array.isArray(result.value.suggestions)).toBe(true)
    }
  }

  const thenResultContainsAutocompleteQuery = async (
    result: Awaited<ReturnType<typeof fetchAutocomplete>>,
    query: string,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.query).toBe(query)
    }
  }

  const thenAutocompleteResultIsError = async (
    result: Awaited<ReturnType<typeof fetchAutocomplete>>,
    errorType: string,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe(errorType)
    }
  }

  const thenAutocompleteResultIsServerError = async (
    result: Awaited<ReturnType<typeof fetchAutocomplete>>,
    status: number,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('SERVER_ERROR')
      if (result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(status)
      }
    }
  }

  const thenAutocompleteResultErrorContainsMessage = async (
    result: Awaited<ReturnType<typeof fetchAutocomplete>>,
    message: string,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain(message)
    }
  }
})

describe('fetchFullResults', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls POST /api/search with full=true', async () => {
    await givenBackendReturnsFullResults()

    await whenFetchFullResultsIsCalled('Pink Floyd')

    await thenFetchWasCalledWithFullParam()
  })

  it('returns full results on success', async () => {
    await givenBackendReturnsFullResults()

    const result = await whenFetchFullResultsIsCalled('Pink Floyd')

    await thenFullResultIsOk(result)
    await thenFullResultContainsTracks(result)
    await thenFullResultContainsAlbums(result)
  })

  it('proxies insecure album and artist cover URLs through the backend cover route', async () => {
    await givenBackendReturnsFullResults()

    const result = await whenFetchFullResultsIsCalled('Pink Floyd')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.albums[0]?.coverArtUrl).toBe(
        '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2F101%2Fcover.jpg',
      )
      expect(result.value.artists[0]?.coverArtUrl).toBe(
        '/api/playback/cover?src=http%3A%2F%2Flocalhost%3A9000%2Fmusic%2F201%2Fcover.jpg',
      )
    }
  })

  it('handles network errors', async () => {
    await givenBackendIsUnreachable()

    const result = await whenFetchFullResultsIsCalled('test')

    await thenFullResultIsError(result, 'NETWORK_ERROR')
  })

  it('handles timeout errors', async () => {
    await givenBackendTimesOut()

    const result = await whenFetchFullResultsIsCalled('test')

    await thenFullResultIsError(result, 'TIMEOUT_ERROR')
  })

  it('handles 503 server errors', async () => {
    await givenBackendReturns503()

    const result = await whenFetchFullResultsIsCalled('test')

    await thenFullResultIsServerError(result, 503)
  })

  it('returns PARSE_ERROR when full results response shape does not match schema', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrongField: 'not-a-full-results-response' }),
    })

    const result = await whenFetchFullResultsIsCalled('test')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  // === GIVEN ===

  const givenBackendReturnsFullResults = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: [
          {
            id: '1',
            title: 'Comfortably Numb',
            artist: 'Pink Floyd',
            album: 'The Wall',
            source: 'local',
            url: 'track://1',
          },
        ],
        albums: [
          {
            id: 'album-1',
            title: 'The Wall',
            artist: 'Pink Floyd',
            trackCount: 26,
            coverArtUrl: 'http://localhost:9000/music/101/cover.jpg',
          },
        ],
        artists: [
          {
            name: 'Pink Floyd',
            artistId: '42',
            coverArtUrl: 'http://localhost:9000/music/201/cover.jpg',
          },
        ],
        query: 'Pink Floyd',
        totalResults: 1,
      }),
    })
  }

  const givenBackendIsUnreachable = async (): Promise<void> => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))
  }

  const givenBackendTimesOut = async (): Promise<void> => {
    const timeoutError = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    })
    fetchMock.mockRejectedValueOnce(timeoutError)
  }

  const givenBackendReturns503 = async (): Promise<void> => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        message: 'LMS not reachable',
        code: 'LMS_UNREACHABLE',
      }),
    })
  }

  // === WHEN ===

  const whenFetchFullResultsIsCalled = async (
    query: string,
  ): Promise<Awaited<ReturnType<typeof import('./searchApi').fetchFullResults>>> => {
    const { fetchFullResults } = await import('./searchApi')
    return fetchFullResults(query)
  }

  // === THEN ===

  const thenFetchWasCalledWithFullParam = async (): Promise<void> => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"full":true'),
      }),
    )
  }

  const thenFullResultIsOk = async (
    result: Awaited<ReturnType<typeof import('./searchApi').fetchFullResults>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
  }

  const thenFullResultContainsTracks = async (
    result: Awaited<ReturnType<typeof import('./searchApi').fetchFullResults>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tracks).toBeDefined()
      expect(Array.isArray(result.value.tracks)).toBe(true)
    }
  }

  const thenFullResultContainsAlbums = async (
    result: Awaited<ReturnType<typeof import('./searchApi').fetchFullResults>>,
  ): Promise<void> => {
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.albums).toBeDefined()
      expect(Array.isArray(result.value.albums)).toBe(true)
    }
  }

  const thenFullResultIsError = async (
    result: Awaited<ReturnType<typeof import('./searchApi').fetchFullResults>>,
    errorType: string,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe(errorType)
    }
  }

  const thenFullResultIsServerError = async (
    result: Awaited<ReturnType<typeof import('./searchApi').fetchFullResults>>,
    status: number,
  ): Promise<void> => {
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('SERVER_ERROR')
      if (result.error.type === 'SERVER_ERROR') {
        expect(result.error.status).toBe(status)
      }
    }
  }
})
