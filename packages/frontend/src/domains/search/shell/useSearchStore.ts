import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  searchTracks,
  fetchAutocomplete,
  fetchFullResults,
  type SearchResult,
  type AutocompleteSuggestion,
  type SearchResultsResponse,
} from '@/platform/api/searchApi'
import { mapSearchErrorMessage } from '../core/service'

export const useSearchStore = defineStore('search', () => {
  // ── State ──────────────────────────────────────────────────
  const searchQuery = ref('')
  const searchResults = ref<readonly SearchResult[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Autocomplete State
  const autocompleteSuggestions = ref<readonly AutocompleteSuggestion[]>([])
  const isAutocompleteLoading = ref(false)
  const autocompleteError = ref<string | null>(null)

  // Full Results State
  const fullResults = ref<SearchResultsResponse | null>(null)
  const isFullResultsLoading = ref(false)
  const fullResultsError = ref<string | null>(null)

  // ── Getters (Functional Core) ─────────────────────────────
  const hasResults = computed(() => searchResults.value.length > 0)
  const resultCount = computed(() => searchResults.value.length)
  const hasSuggestions = computed(() => autocompleteSuggestions.value.length > 0)
  const suggestionCount = computed(() => autocompleteSuggestions.value.length)

  // ── Actions (Imperative Shell) ────────────────────────────
  const search = async (query: string): Promise<void> => {
    searchQuery.value = query
    isLoading.value = true
    error.value = null

    const result = await searchTracks(query)

    if (!result.ok) {
      error.value = mapSearchErrorMessage(result.error)
      searchResults.value = []
    } else {
      searchResults.value = result.value.results
    }

    isLoading.value = false
  }

  const clearResults = (): void => {
    searchQuery.value = ''
    searchResults.value = []
    error.value = null
  }

  const clearError = (): void => {
    error.value = null
  }

  const fetchAutocompleteSuggestions = async (
    query: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<void> => {
    isAutocompleteLoading.value = true
    autocompleteError.value = null

    const result = await fetchAutocomplete(query, options)

    if (!result.ok) {
      // Ignore AbortError (expected when user types fast)
      if (result.error.type !== 'ABORT_ERROR') {
        autocompleteError.value = mapSearchErrorMessage(result.error)
        autocompleteSuggestions.value = []
      }
    } else {
      autocompleteSuggestions.value = result.value.suggestions
    }

    isAutocompleteLoading.value = false
  }

  const clearAutocompleteSuggestions = (): void => {
    autocompleteSuggestions.value = []
    autocompleteError.value = null
  }

  const searchFullResults = async (query: string): Promise<void> => {
    searchQuery.value = query
    isFullResultsLoading.value = true
    fullResultsError.value = null

    const result = await fetchFullResults(query)

    if (!result.ok) {
      fullResultsError.value = mapSearchErrorMessage(result.error)
      fullResults.value = null
    } else {
      fullResults.value = result.value
    }

    isFullResultsLoading.value = false
  }

  const clearFullResults = (): void => {
    fullResults.value = null
    fullResultsError.value = null
  }

  return {
    // State
    searchQuery,
    searchResults,
    isLoading,
    error,
    // Autocomplete State
    autocompleteSuggestions,
    isAutocompleteLoading,
    autocompleteError,
    // Full Results State
    fullResults,
    isFullResultsLoading,
    fullResultsError,
    // Getters
    hasResults,
    resultCount,
    hasSuggestions,
    suggestionCount,
    // Actions
    search,
    clearResults,
    clearError,
    fetchAutocompleteSuggestions,
    clearAutocompleteSuggestions,
    searchFullResults,
    clearFullResults,
  }
})
