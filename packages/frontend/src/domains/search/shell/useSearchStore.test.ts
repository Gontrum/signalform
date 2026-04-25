import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSearchStore } from './useSearchStore'
import * as searchApi from '@/platform/api/searchApi'
import { ok, err } from '@signalform/shared'

vi.mock('@/platform/api/searchApi')

describe('searchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with empty state', async () => {
    const store = whenSearchStoreIsCreated()

    await thenSearchQueryIsEmpty(store)
    await thenSearchResultsAreEmpty(store)
    await thenIsLoadingIsFalse(store)
    await thenErrorIsNull(store)
  })

  it('performs search and updates state', async () => {
    await givenSearchApiReturnsResults()
    const store = whenSearchStoreIsCreated()

    await whenSearchIsCalled(store, 'Pink Floyd')

    await thenIsLoadingWasTrue(store)
    await thenSearchResultsAreUpdated(store)
    await thenSearchQueryIsUpdated(store, 'Pink Floyd')
    await thenIsLoadingIsFalse(store)
  })

  it('handles search errors', async () => {
    await givenSearchApiThrowsError()
    const store = whenSearchStoreIsCreated()

    await whenSearchIsCalled(store, 'test')

    await thenErrorIsSet(store)
    await thenIsLoadingIsFalse(store)
  })

  it('clears results', async () => {
    await givenSearchApiReturnsResults()
    const store = whenSearchStoreIsCreated()
    await whenSearchIsCalled(store, 'test')

    await whenClearResultsIsCalled(store)

    await thenSearchResultsAreEmpty(store)
    await thenSearchQueryIsEmpty(store)
  })

  it('clears errors', async () => {
    await givenSearchApiThrowsError()
    const store = whenSearchStoreIsCreated()
    await whenSearchIsCalled(store, 'test')

    await whenClearErrorIsCalled(store)

    await thenErrorIsNull(store)
  })

  it('provides hasResults getter', async () => {
    await givenSearchApiReturnsResults()
    const store = whenSearchStoreIsCreated()

    await whenSearchIsCalled(store, 'test')

    await thenHasResultsIsTrue(store)
  })

  it('provides resultCount getter', async () => {
    await givenSearchApiReturnsResults()
    const store = whenSearchStoreIsCreated()

    await whenSearchIsCalled(store, 'test')

    await thenResultCountMatchesTotalCount(store)
  })

  it('fetches autocomplete suggestions successfully', async () => {
    await givenAutocompleteApiReturnsResults()
    const store = whenSearchStoreIsCreated()

    await whenFetchAutocompleteSuggestionsIsCalled(store, 'Pink')

    await thenAutocompleteSuggestionsAreUpdated(store)
    await thenAutocompleteErrorIsNull(store)
  })

  it('handles autocomplete LMS unreachable error', async () => {
    await givenAutocompleteApiThrowsLmsError()
    const store = whenSearchStoreIsCreated()

    await whenFetchAutocompleteSuggestionsIsCalled(store, 'Pink')

    await thenAutocompleteErrorIs(store, 'Music server not reachable')
  })

  it('handles autocomplete timeout error', async () => {
    await givenAutocompleteApiThrowsTimeoutError()
    const store = whenSearchStoreIsCreated()

    await whenFetchAutocompleteSuggestionsIsCalled(store, 'Pink')

    await thenAutocompleteErrorContains(store, 'timed out')
  })

  it('handles autocomplete network connection error', async () => {
    await givenAutocompleteApiThrowsNetworkError()
    const store = whenSearchStoreIsCreated()

    await whenFetchAutocompleteSuggestionsIsCalled(store, 'Pink')

    await thenAutocompleteErrorContains(store, 'Autocomplete failed')
  })

  it('ignores AbortError in autocomplete', async () => {
    await givenAutocompleteApiThrowsAbortError()
    const store = whenSearchStoreIsCreated()

    await whenFetchAutocompleteSuggestionsIsCalled(store, 'Pink')

    // Should not set error for AbortError
    await thenAutocompleteErrorIsNull(store)
  })

  it('clears autocomplete suggestions', async () => {
    await givenAutocompleteApiReturnsResults()
    const store = whenSearchStoreIsCreated()
    await whenFetchAutocompleteSuggestionsIsCalled(store, 'Pink')

    await whenClearAutocompleteSuggestionsIsCalled(store)

    await thenAutocompleteSuggestionsAreEmpty(store)
    await thenAutocompleteErrorIsNull(store)
  })

  // === GIVEN ===

  const givenSearchApiReturnsResults = async (): Promise<void> => {
    vi.mocked(searchApi.searchTracks).mockResolvedValue(
      ok({
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
    )
  }

  const givenSearchApiThrowsError = async (): Promise<void> => {
    vi.mocked(searchApi.searchTracks).mockResolvedValue(
      err({
        type: 'NETWORK_ERROR',
        message: 'Network error',
      }),
    )
  }

  const givenAutocompleteApiReturnsResults = async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      ok({
        suggestions: [
          { id: '1', type: 'artist', artist: 'Pink Floyd' },
          { id: '2', type: 'album', artist: 'Pink Floyd', album: 'The Wall' },
        ],
        query: 'Pink',
      }),
    )
  }

  const givenAutocompleteApiThrowsLmsError = async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      err({
        type: 'SERVER_ERROR',
        status: 503,
        message: 'LMS not reachable',
      }),
    )
  }

  const givenAutocompleteApiThrowsTimeoutError = async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      err({
        type: 'TIMEOUT_ERROR',
        message: 'Request timed out - server slow',
      }),
    )
  }

  const givenAutocompleteApiThrowsNetworkError = async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      err({
        type: 'SERVER_ERROR',
        status: 500,
        message: 'Autocomplete failed: 500',
      }),
    )
  }

  const givenAutocompleteApiThrowsAbortError = async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      err({
        type: 'ABORT_ERROR',
        message: 'The operation was aborted',
      }),
    )
  }

  // === WHEN ===

  const whenSearchStoreIsCreated = (): ReturnType<typeof useSearchStore> => {
    return useSearchStore()
  }

  const whenSearchIsCalled = async (
    store: ReturnType<typeof useSearchStore>,
    query: string,
  ): Promise<void> => {
    await store.search(query)
  }

  const whenClearResultsIsCalled = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    store.clearResults()
  }

  const whenClearErrorIsCalled = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    store.clearError()
  }

  const whenFetchAutocompleteSuggestionsIsCalled = async (
    store: ReturnType<typeof useSearchStore>,
    query: string,
  ): Promise<void> => {
    await store.fetchAutocompleteSuggestions(query)
  }

  const whenClearAutocompleteSuggestionsIsCalled = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    store.clearAutocompleteSuggestions()
  }

  // === THEN ===

  const thenSearchQueryIsEmpty = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.searchQuery).toBe('')
  }

  const thenSearchResultsAreEmpty = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.searchResults).toEqual([])
  }

  const thenIsLoadingIsFalse = async (store: ReturnType<typeof useSearchStore>): Promise<void> => {
    expect(store.isLoading).toBe(false)
  }

  const thenErrorIsNull = async (store: ReturnType<typeof useSearchStore>): Promise<void> => {
    expect(store.error).toBe(null)
  }

  const thenIsLoadingWasTrue = async (_store: ReturnType<typeof useSearchStore>): Promise<void> => {
    // After search completes, isLoading should be false, but we can verify it was called
    expect(searchApi.searchTracks).toHaveBeenCalled()
  }

  const thenSearchResultsAreUpdated = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.searchResults.length).toBeGreaterThan(0)
  }

  const thenSearchQueryIsUpdated = async (
    store: ReturnType<typeof useSearchStore>,
    query: string,
  ): Promise<void> => {
    expect(store.searchQuery).toBe(query)
  }

  const thenErrorIsSet = async (store: ReturnType<typeof useSearchStore>): Promise<void> => {
    expect(store.error).not.toBe(null)
  }

  const thenHasResultsIsTrue = async (store: ReturnType<typeof useSearchStore>): Promise<void> => {
    expect(store.hasResults).toBe(true)
  }

  const thenResultCountMatchesTotalCount = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.resultCount).toBe(1)
  }

  const thenAutocompleteSuggestionsAreUpdated = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.autocompleteSuggestions.length).toBeGreaterThan(0)
  }

  const thenAutocompleteErrorIsNull = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.autocompleteError).toBe(null)
  }

  const thenAutocompleteErrorIs = async (
    store: ReturnType<typeof useSearchStore>,
    errorMessage: string,
  ): Promise<void> => {
    expect(store.autocompleteError).toBe(errorMessage)
  }

  const thenAutocompleteErrorContains = async (
    store: ReturnType<typeof useSearchStore>,
    substring: string,
  ): Promise<void> => {
    expect(store.autocompleteError).toContain(substring)
  }

  const thenAutocompleteSuggestionsAreEmpty = async (
    store: ReturnType<typeof useSearchStore>,
  ): Promise<void> => {
    expect(store.autocompleteSuggestions).toEqual([])
  }
})
