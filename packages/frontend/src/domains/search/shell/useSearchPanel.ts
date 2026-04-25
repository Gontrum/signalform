import { computed, onUnmounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { playAlbum } from '@/platform/api/playbackApi'
import { useSearchStore } from './useSearchStore'
import {
  getDisplayedAlbumResults,
  getDisplayedArtistResults,
  getDisplayedTrackResults,
} from '../core/service'
import type { AutocompleteSuggestion, SearchResultsResponse, TrackResult } from '../core/types'

type UseSearchPanelResult = {
  readonly searchStore: ReturnType<typeof useSearchStore>
  readonly searchQuery: Ref<string>
  readonly searchInputEl: Ref<HTMLInputElement | null>
  readonly showMinLengthHint: Ref<boolean>
  readonly showLoadingIndicator: Ref<boolean>
  readonly activeIndex: Ref<number>
  readonly showFullResults: ComputedRef<boolean>
  readonly displayedTracks: ComputedRef<readonly TrackResult[]>
  readonly displayedAlbums: ComputedRef<SearchResultsResponse['albums']>
  readonly displayedArtists: ComputedRef<SearchResultsResponse['artists']>
  readonly handleQueryChange: (event: Event) => void
  readonly handleArrowDown: () => void
  readonly handleArrowUp: () => void
  readonly handleEscapeKey: () => void
  readonly handleSelect: (suggestion: AutocompleteSuggestion) => void
  readonly handleEnterKey: () => Promise<void>
  readonly handlePlayTrack: (track: TrackResult) => Promise<void>
  readonly handlePause: () => void
  readonly handleNavigateArtist: (payload: {
    readonly artistId: string | null
    readonly name: string
  }) => void
  readonly handleNavigateAlbum: (payload: { readonly albumId: string }) => void
  readonly handleNavigateTidalAlbum: (payload: {
    readonly title: string
    readonly artist: string
    readonly coverArtUrl?: string
    readonly trackUrls: ReadonlyArray<string>
    readonly trackTitles?: ReadonlyArray<string>
  }) => void
  readonly handlePlayAlbum: (albumId: string) => Promise<void>
  readonly backToSearch: () => Promise<void>
}

export const useSearchPanel = (): UseSearchPanelResult => {
  const router = useRouter()
  const route = useRoute()
  const searchStore = useSearchStore()
  const playbackStore = usePlaybackStore()

  const searchQuery = ref('')
  const searchInputEl = ref<HTMLInputElement | null>(null)
  const abortControllerRef = ref<AbortController | null>(null)
  const showMinLengthHint = ref(false)
  const showLoadingIndicator = ref(false)
  const loadingTimer = ref<number | null>(null)
  const activeIndex = ref(-1)

  const showFullResults = computed(
    () => route.query.full === 'true' && typeof route.query.q === 'string' && route.query.q !== '',
  )

  const displayedTracks = computed(() =>
    getDisplayedTrackResults(searchQuery.value, searchStore.fullResults),
  )
  const displayedAlbums = computed(() =>
    getDisplayedAlbumResults(searchQuery.value, searchStore.fullResults),
  )
  const displayedArtists = computed(() =>
    getDisplayedArtistResults(searchQuery.value, searchStore.fullResults),
  )

  const debouncedAutocomplete = useDebounceFn(async (): Promise<void> => {
    const query = searchQuery.value.trim()

    if (query.length < 2) {
      searchStore.clearAutocompleteSuggestions()
      showMinLengthHint.value = query.length === 1
      return
    }

    showMinLengthHint.value = false

    if (abortControllerRef.value) {
      abortControllerRef.value.abort()
    }

    if (loadingTimer.value !== null) {
      clearTimeout(loadingTimer.value)
      loadingTimer.value = null
    }

    loadingTimer.value = setTimeout((): void => {
      showLoadingIndicator.value = true
    }, 150)

    abortControllerRef.value = new AbortController()

    try {
      await searchStore.fetchAutocompleteSuggestions(query, {
        signal: abortControllerRef.value.signal,
      })
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        return
      }
    } finally {
      if (loadingTimer.value !== null) {
        clearTimeout(loadingTimer.value)
        loadingTimer.value = null
      }
      showLoadingIndicator.value = false
    }
  }, 300)

  const handleQueryChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement)) {
      return
    }

    searchQuery.value = event.target.value
    activeIndex.value = -1
    void debouncedAutocomplete()
  }

  const handleArrowDown = (): void => {
    if (!searchStore.hasSuggestions) {
      return
    }

    const total = searchStore.autocompleteSuggestions.length + 1
    activeIndex.value = activeIndex.value < total - 1 ? activeIndex.value + 1 : 0
  }

  const handleArrowUp = (): void => {
    if (!searchStore.hasSuggestions) {
      return
    }

    const total = searchStore.autocompleteSuggestions.length + 1
    activeIndex.value = activeIndex.value > 0 ? activeIndex.value - 1 : total - 1
  }

  const handleEscapeKey = (): void => {
    if (searchStore.hasSuggestions) {
      searchStore.clearAutocompleteSuggestions()
      activeIndex.value = -1
      showMinLengthHint.value = false
      return
    }

    searchQuery.value = ''
    activeIndex.value = -1
    showMinLengthHint.value = false
  }

  const handleSelect = (suggestion: AutocompleteSuggestion): void => {
    searchStore.clearAutocompleteSuggestions()
    activeIndex.value = -1

    const nextQuery = `${suggestion.artist}${suggestion.album ? ` - ${suggestion.album}` : ''}`
    searchQuery.value = nextQuery

    if (suggestion.type === 'artist' && suggestion.artist) {
      void router.push({ name: 'unified-artist', query: { name: suggestion.artist } })
    } else if (suggestion.type === 'album' && suggestion.albumId) {
      void router.push({ name: 'album-detail', params: { albumId: suggestion.albumId } })
    }
  }

  const handleEnterKey = async (): Promise<void> => {
    const suggestions = searchStore.autocompleteSuggestions

    if (activeIndex.value >= 0 && activeIndex.value < suggestions.length) {
      const suggestion = suggestions[activeIndex.value]
      if (suggestion !== undefined) {
        handleSelect(suggestion)
        return
      }
    }

    if (activeIndex.value === suggestions.length && suggestions.length > 0) {
      activeIndex.value = -1
      searchStore.clearAutocompleteSuggestions()
    }

    const query = searchQuery.value.trim()
    if (query.length < 2) {
      showMinLengthHint.value = true
      return
    }

    searchStore.clearAutocompleteSuggestions()
    activeIndex.value = -1

    const fetchPromise = searchStore.searchFullResults(query)
    await router.push({ query: { q: query, full: 'true' } })
    await fetchPromise
  }

  const handlePlayTrack = async (track: TrackResult): Promise<void> => {
    await playbackStore.play({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      url: track.url,
      duration: track.duration,
      source: track.source,
      availableSources: track.availableSources,
    })
  }

  const handlePause = (): void => {
    void playbackStore.pause()
  }

  const handleNavigateArtist = (payload: {
    readonly artistId: string | null
    readonly name: string
  }): void => {
    void router.push({ name: 'unified-artist', query: { name: payload.name } })
  }

  const handleNavigateAlbum = ({ albumId }: { readonly albumId: string }): void => {
    void router.push({ name: 'album-detail', params: { albumId } })
  }

  const handleNavigateTidalAlbum = (payload: {
    readonly title: string
    readonly artist: string
    readonly coverArtUrl?: string
    readonly trackUrls: ReadonlyArray<string>
    readonly trackTitles?: ReadonlyArray<string>
  }): void => {
    void router.push({
      name: 'tidal-search-album',
      state: {
        title: payload.title,
        artist: payload.artist,
        coverArtUrl: payload.coverArtUrl ?? '',
        trackUrls: [...payload.trackUrls],
        trackTitles: [...(payload.trackTitles ?? [])],
      },
    })
  }

  const handlePlayAlbum = async (albumId: string): Promise<void> => {
    const result = await playAlbum(albumId)
    if (!result.ok) {
      return
    }
  }

  const backToSearch = async (): Promise<void> => {
    try {
      await router.replace({ query: {} })
    } finally {
      searchStore.clearFullResults()
    }
  }

  onUnmounted((): void => {
    if (abortControllerRef.value) {
      abortControllerRef.value.abort()
    }
    if (loadingTimer.value !== null) {
      clearTimeout(loadingTimer.value)
    }
  })

  const restoreQuery =
    route.query.full === 'true' && typeof route.query.q === 'string' ? route.query.q : null
  if (restoreQuery) {
    searchQuery.value = restoreQuery
    if (!searchStore.fullResults || searchStore.searchQuery !== restoreQuery) {
      void searchStore.searchFullResults(restoreQuery)
    }
  }

  return {
    searchStore,
    searchQuery,
    searchInputEl,
    showMinLengthHint,
    showLoadingIndicator,
    activeIndex,
    showFullResults,
    displayedTracks,
    displayedAlbums,
    displayedArtists,
    handleQueryChange,
    handleArrowDown,
    handleArrowUp,
    handleEscapeKey,
    handleSelect,
    handleEnterKey,
    handlePlayTrack,
    handlePause,
    handleNavigateArtist,
    handleNavigateAlbum,
    handleNavigateTidalAlbum,
    handlePlayAlbum,
    backToSearch,
  }
}
