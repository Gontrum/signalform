import { ref, computed } from 'vue'
import { startGenreRadio, searchTags } from '@/platform/api/genreRadioApi'

export const useGenreRadio = (): {
  readonly query: import('vue').Ref<string>
  readonly suggestions: import('vue').Ref<
    readonly { readonly name: string; readonly count: number; readonly url: string }[]
  >
  readonly isSearching: import('vue').Ref<boolean>
  readonly isStarting: import('vue').Ref<boolean>
  readonly error: import('vue').Ref<boolean>
  readonly showSuggestions: import('vue').Ref<boolean>
  readonly activeIndex: import('vue').Ref<number>
  readonly canStart: import('vue').ComputedRef<boolean>
  readonly handleQueryInput: (value: string) => void
  readonly selectSuggestion: (name: string) => void
  readonly handleArrowDown: () => void
  readonly handleArrowUp: () => void
  readonly handleStart: () => Promise<void>
  readonly handleEnterKey: () => Promise<void>
} => {
  const query = ref('')
  const suggestions = ref<
    readonly { readonly name: string; readonly count: number; readonly url: string }[]
  >([])
  const isSearching = ref(false)
  const isStarting = ref(false)
  const error = ref(false)
  const showSuggestions = ref(false)
  const activeIndex = ref(-1)

  const debounceTimerRef = { current: null as ReturnType<typeof setTimeout> | null }

  const handleQueryInput = (value: string): void => {
    query.value = value
    error.value = false
    activeIndex.value = -1
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    if (value.trim().length < 2) {
      suggestions.value = []
      showSuggestions.value = false
      return
    }
    debounceTimerRef.current = setTimeout(() => {
      isSearching.value = true
      void searchTags(value.trim())
        .then((tags) => {
          suggestions.value = tags
          showSuggestions.value = tags.length > 0
        })
        .catch(() => {
          suggestions.value = []
        })
        .finally(() => {
          isSearching.value = false
        })
    }, 300)
  }

  const selectSuggestion = (name: string): void => {
    query.value = name
    showSuggestions.value = false
    suggestions.value = []
    activeIndex.value = -1
  }

  const handleArrowDown = (): void => {
    if (suggestions.value.length === 0) {
      return
    }

    const total = suggestions.value.length
    activeIndex.value = activeIndex.value < total - 1 ? activeIndex.value + 1 : 0
  }

  const handleArrowUp = (): void => {
    if (suggestions.value.length === 0) {
      return
    }

    const total = suggestions.value.length
    activeIndex.value = activeIndex.value > 0 ? activeIndex.value - 1 : total - 1
  }

  const handleStart = async (): Promise<void> => {
    const genre = query.value.trim()
    if (genre.length === 0) return
    isStarting.value = true
    error.value = false
    showSuggestions.value = false
    const result = await startGenreRadio(genre)
    if (result === null) {
      error.value = true
    }
    isStarting.value = false
  }

  const handleEnterKey = async (): Promise<void> => {
    if (activeIndex.value >= 0 && activeIndex.value < suggestions.value.length) {
      const suggestion = suggestions.value[activeIndex.value]
      if (suggestion !== undefined) {
        selectSuggestion(suggestion.name)
        return
      }
    }

    await handleStart()
  }

  const canStart = computed(() => query.value.trim().length > 0 && !isStarting.value)

  return {
    query,
    suggestions,
    isSearching,
    isStarting,
    error,
    showSuggestions,
    activeIndex,
    canStart,
    handleQueryInput,
    selectSuggestion,
    handleArrowDown,
    handleArrowUp,
    handleStart,
    handleEnterKey,
  }
}
