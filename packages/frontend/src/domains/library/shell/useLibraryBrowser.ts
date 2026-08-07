import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MessageKey } from '@/i18n'
import { playAlbum } from '@/platform/api/playbackApi'
import {
  getTidalAlbums,
  getTidalFeaturedAlbums,
  type TidalAlbum,
} from '@/platform/api/tidalAlbumsApi'
import { addAlbumToQueue } from '@/platform/api/queueApi'
import {
  getLibraryAlbums,
  getLibraryArtists,
  getLibraryGenres,
  getRescanStatus,
  triggerLibraryRescan,
  type LibraryAlbumsQuery,
  type LibraryArtist,
  type LibraryArtistsQuery,
  type LibraryGenre,
} from '@/platform/api/libraryApi'
import {
  adaptTidalAlbumsForDisplay,
  buildDecadeScopeMessage,
  buildFilterSummary,
  buildRescanProgressMessage,
  decadeFilterOptions,
  DECADE_KEY,
  findGenreName,
  findOptionLabel,
  GENRE_CHIP_COUNT,
  GENRE_KEY,
  libraryControlVisibility,
  PAGE_SIZE,
  parseStoredDecade,
  parseStoredSort,
  parseStoredViewMode,
  reconcileFilters,
  resolveLocalStatus,
  showsDecadeScopeNotice as showsDecadeScopeNoticeFor,
  showsLoadMore as showsLoadMoreFor,
  showsRecentlyAddedCapNotice as showsRecentlyAddedCapNoticeFor,
  sortOptions,
  splitGenres,
  SORT_KEY,
  VIEW_MODE_KEY,
} from '../core/service'
import type {
  BrowseMode,
  DecadeFilter,
  FilterField,
  LibraryAlbum,
  LoadingStatus,
  ReconciledFilters,
  SortOption,
  Source,
  ViewMode,
} from '../core/types'

type Translator = (key: MessageKey) => string

const SEARCH_DEBOUNCE_MS = 300

// Tidal favourites are still fetched in one go — only the local library got
// server-side pagination.
const TIDAL_FETCH_LIMIT = 250

type UseLibraryBrowserResult = {
  readonly activeSource: Ref<Source>
  readonly setSource: (source: Source) => void
  readonly currentStatus: ComputedRef<LoadingStatus>
  readonly albums: Ref<readonly LibraryAlbum[]>
  readonly browseMode: Ref<BrowseMode>
  readonly setBrowseMode: (mode: BrowseMode) => void
  readonly artists: Ref<readonly LibraryArtist[]>
  readonly loadMoreCurrent: () => Promise<void>
  readonly handleNavigateArtist: (name: string) => void
  readonly showsAlbumControls: ComputedRef<boolean>
  readonly showsBrowseModeToggle: ComputedRef<boolean>
  readonly showsArtistBrowser: ComputedRef<boolean>
  readonly showsEmptyArtists: ComputedRef<boolean>
  readonly showsLoadMore: ComputedRef<boolean>
  readonly isLoadingMoreCurrent: ComputedRef<boolean>
  readonly loadMoreCurrentFailed: ComputedRef<boolean>
  readonly errorMessage: ComputedRef<string>
  readonly loadMoreErrorMessage: ComputedRef<string>
  readonly searchPlaceholder: ComputedRef<string>
  readonly tidalAlbumsForDisplay: ComputedRef<readonly LibraryAlbum[]>
  readonly featuredAlbums: Ref<readonly TidalAlbum[]>
  readonly featuredStatus: Ref<LoadingStatus>
  readonly isRescanning: Ref<boolean>
  readonly rescanMessage: Ref<string | null>
  readonly handleRescan: () => Promise<void>
  readonly handleNavigate: (albumId: string) => void
  readonly handlePlay: (albumId: string) => Promise<void>
  readonly handleAddToQueue: (albumId: string) => Promise<void>
  readonly viewMode: Ref<ViewMode>
  readonly setViewMode: (mode: ViewMode) => void
  readonly currentAlbumsForDisplay: ComputedRef<readonly LibraryAlbum[]>
  readonly sortOptions: ComputedRef<
    ReadonlyArray<{ readonly value: SortOption; readonly label: string }>
  >
  readonly decadeOptions: ComputedRef<
    ReadonlyArray<{ readonly value: DecadeFilter; readonly label: string }>
  >
  readonly sortBy: Ref<SortOption>
  readonly setSortBy: (sort: SortOption) => void
  readonly genreFilter: Ref<number | null>
  readonly setGenreFilter: (genreId: number | null) => void
  readonly decadeFilter: Ref<DecadeFilter>
  readonly setDecadeFilter: (decade: DecadeFilter) => void
  readonly adjustedFilter: Ref<FilterField | null>
  readonly genreChips: ComputedRef<readonly LibraryGenre[]>
  readonly genreRest: ComputedRef<readonly LibraryGenre[]>
  readonly searchQuery: Ref<string>
  readonly setSearchQuery: (value: string) => void
  readonly clearAllFilters: () => void
  readonly hasActiveFilters: ComputedRef<boolean>
  readonly filterSummary: ComputedRef<string>
  readonly showsRecentlyAddedCapNotice: ComputedRef<boolean>
  readonly showsDecadeScopeNotice: ComputedRef<boolean>
  readonly decadeScopeMessage: ComputedRef<string>
}

const parseStoredGenreId = (stored: string | null): number | null => {
  if (stored === null) {
    return null
  }

  const parsed = Number(stored)
  return Number.isInteger(parsed) ? parsed : null
}

const storeDecade = (decade: DecadeFilter): void => {
  if (decade === 'all') {
    sessionStorage.removeItem(DECADE_KEY)
    return
  }

  sessionStorage.setItem(DECADE_KEY, decade)
}

// Storage predates the server-side browse rules and holds combinations the
// backend now answers with 400, so the restored pair goes through the same
// reconciliation as a clicked one — before the first request, not after it.
// 'sort' names the winner: the stored sort is the more prominent choice and
// 'all' is the decade value that hides nothing.
const restoreFilters = (): ReconciledFilters => {
  const reconciled = reconcileFilters(
    parseStoredSort(sessionStorage.getItem(SORT_KEY)),
    parseStoredDecade(sessionStorage.getItem(DECADE_KEY)),
    'sort',
  )

  if (reconciled.adjusted !== undefined) {
    storeDecade(reconciled.decade)
  }

  return reconciled
}

export const useLibraryBrowser = (t: Translator): UseLibraryBrowserResult => {
  const router = useRouter()

  const activeSource = ref<Source>('local')
  const status = ref<LoadingStatus>('loading')
  const albums = ref<readonly LibraryAlbum[]>([])
  // Authoritative from the server: a full page is not a promise of another one.
  const hasMoreState = ref(false)
  const isLoadingMore = ref(false)
  const loadMoreFailed = ref(false)

  const browseMode = ref<BrowseMode>('albums')
  const artists = ref<readonly LibraryArtist[]>([])
  const artistsStatus = ref<LoadingStatus>('loading')
  const artistsHasMoreState = ref(false)
  const isLoadingMoreArtists = ref(false)
  const loadMoreArtistsFailed = ref(false)

  const tidalStatus = ref<LoadingStatus>('loading')
  const tidalAlbums = ref<readonly TidalAlbum[]>([])

  const featuredStatus = ref<LoadingStatus>('loading')
  const featuredAlbums = ref<readonly TidalAlbum[]>([])

  const isRescanning = ref(false)
  const rescanMessage = ref<string | null>(null)
  const rescanPollTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  const restored = restoreFilters()
  const sortBy = ref<SortOption>(restored.sort)
  const genreFilter = ref<number | null>(parseStoredGenreId(sessionStorage.getItem(GENRE_KEY)))
  const decadeFilter = ref<DecadeFilter>(restored.decade)
  const viewMode = ref<ViewMode>(parseStoredViewMode(localStorage.getItem(VIEW_MODE_KEY)))
  // Deliberately not seeded from `restored.adjusted`: announcing a correction
  // the user never triggered explains nothing on arrival.
  const adjustedFilter = ref<FilterField | null>(null)
  const searchQuery = ref('')

  const genres = ref<readonly LibraryGenre[]>([])
  const genreSplit = computed(() => splitGenres(genres.value, GENRE_CHIP_COUNT))
  const genreChips = computed(() => genreSplit.value.chips)
  const genreRest = computed(() => genreSplit.value.rest)

  // Every album request carries the counter value it started with; a response
  // whose token is no longer current belongs to a filter the user already left.
  const requestRef = { current: 0 }
  const searchTimerRef = { current: null as ReturnType<typeof setTimeout> | null }

  // Every setter that loads on its own must call this first: the pending timer
  // would otherwise fetch the same page a second time right after.
  const cancelSearchDebounce = (): void => {
    if (searchTimerRef.current !== null) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
  }

  const tidalAlbumsForDisplay = computed(() => adaptTidalAlbumsForDisplay(tidalAlbums.value))
  const localStatus = computed(() =>
    resolveLocalStatus(browseMode.value, status.value, artistsStatus.value),
  )
  const currentStatus = computed(() =>
    activeSource.value === 'local' ? localStatus.value : tidalStatus.value,
  )
  const currentAlbumsForDisplay = computed(() =>
    activeSource.value === 'local' ? albums.value : tidalAlbumsForDisplay.value,
  )
  const hasActiveFilters = computed(
    () =>
      genreFilter.value !== null || decadeFilter.value !== 'all' || searchQuery.value.trim() !== '',
  )

  const controlVisibility = computed(() =>
    libraryControlVisibility({
      source: activeSource.value,
      mode: browseMode.value,
      artistStatus: artistsStatus.value,
      artistCount: artists.value.length,
    }),
  )
  const showsAlbumControls = computed(() => controlVisibility.value.albumControls)
  const showsBrowseModeToggle = computed(() => controlVisibility.value.browseModeToggle)
  const showsArtistBrowser = computed(() => controlVisibility.value.artistBrowser)
  const showsEmptyArtists = computed(() => controlVisibility.value.emptyArtists)
  const showsLoadMore = computed(() =>
    showsLoadMoreFor(
      activeSource.value,
      currentStatus.value,
      browseMode.value === 'artists' ? artistsHasMoreState.value : hasMoreState.value,
    ),
  )
  const isLoadingMoreCurrent = computed(() =>
    browseMode.value === 'artists' ? isLoadingMoreArtists.value : isLoadingMore.value,
  )
  const loadMoreCurrentFailed = computed(() =>
    browseMode.value === 'artists' ? loadMoreArtistsFailed.value : loadMoreFailed.value,
  )

  const errorMessage = computed(() => {
    if (activeSource.value === 'tidal') {
      return t('library.errorTidal')
    }

    return browseMode.value === 'artists' ? t('library.errorArtists') : t('library.errorLocal')
  })
  const loadMoreErrorMessage = computed(() =>
    t(browseMode.value === 'artists' ? 'library.loadMoreArtistsError' : 'library.loadMoreError'),
  )
  const searchPlaceholder = computed(() =>
    t(
      browseMode.value === 'artists'
        ? 'library.searchArtistsPlaceholder'
        : 'library.searchPlaceholder',
    ),
  )

  // Computed, not built once: the language arrives from the server config
  // after this composable has already run, so a plain array would keep every
  // chip and the whole summary line in the default language forever.
  const librarySortOptions = computed(() =>
    sortOptions({
      'artist-az': t('library.sort.artistAz'),
      'title-az': t('library.sort.titleAz'),
      'year-newest': t('library.sort.yearNewest'),
      'recently-added': t('library.sort.recentlyAdded'),
    }),
  )

  const libraryDecadeOptions = computed(() =>
    decadeFilterOptions({
      all: t('library.decadeAll'),
      '2020s': t('library.decade2020s'),
      '2010s': t('library.decade2010s'),
      '2000s': t('library.decade2000s'),
      '1990s': t('library.decade1990s'),
      older: t('library.decadeOlder'),
    }),
  )

  const showsRecentlyAddedCapNotice = computed(() =>
    showsRecentlyAddedCapNoticeFor({
      albumControls: controlVisibility.value.albumControls,
      status: status.value,
      sort: sortBy.value,
      albumCount: albums.value.length,
    }),
  )

  const showsDecadeScopeNotice = computed(() =>
    showsDecadeScopeNoticeFor({
      albumControls: controlVisibility.value.albumControls,
      status: status.value,
      decade: decadeFilter.value,
      albumCount: albums.value.length,
    }),
  )

  const activeSortLabel = computed(() => findOptionLabel(librarySortOptions.value, sortBy.value))

  const decadeScopeMessage = computed(() =>
    buildDecadeScopeMessage(t('library.decadeScopeNotice'), activeSortLabel.value),
  )

  // 'all' and "no genre" are the values that hide nothing, so they are absent
  // from the summary rather than listed in it.
  const activeDecadeLabel = computed(() =>
    decadeFilter.value === 'all'
      ? undefined
      : findOptionLabel(libraryDecadeOptions.value, decadeFilter.value),
  )

  const activeGenreName = computed(() => findGenreName(genres.value, genreFilter.value))

  const filterSummary = computed(() =>
    buildFilterSummary({
      sortLabel: activeSortLabel.value,
      decadeLabel: activeDecadeLabel.value,
      genreName: activeGenreName.value,
      noFilterLabel: t('library.filterSummaryNone'),
    }),
  )

  const setSource = (source: Source): void => {
    activeSource.value = source
  }

  const currentQuery = (): LibraryAlbumsQuery => {
    const search = searchQuery.value.trim()

    return {
      sort: sortBy.value,
      decade: decadeFilter.value,
      genreId: genreFilter.value ?? undefined,
      search: search === '' ? undefined : search,
    }
  }

  const loadLocalAlbums = async (): Promise<void> => {
    requestRef.current += 1
    const token = requestRef.current

    status.value = 'loading'
    albums.value = []
    hasMoreState.value = false
    isLoadingMore.value = false
    loadMoreFailed.value = false

    const result = await getLibraryAlbums(PAGE_SIZE, 0, currentQuery())
    if (token !== requestRef.current) {
      return
    }

    if (!result.ok) {
      status.value = 'error'
      return
    }

    albums.value = result.value.albums
    hasMoreState.value = result.value.hasMore
    status.value = 'success'
  }

  const loadMore = async (): Promise<void> => {
    if (status.value !== 'success' || isLoadingMore.value || !hasMoreState.value) {
      return
    }

    requestRef.current += 1
    const token = requestRef.current
    isLoadingMore.value = true
    loadMoreFailed.value = false

    const result = await getLibraryAlbums(PAGE_SIZE, albums.value.length, currentQuery())
    if (token !== requestRef.current) {
      return
    }

    isLoadingMore.value = false

    if (!result.ok) {
      loadMoreFailed.value = true
      return
    }

    albums.value = [...albums.value, ...result.value.albums]
    hasMoreState.value = result.value.hasMore
  }

  const currentArtistsQuery = (): LibraryArtistsQuery => {
    const search = searchQuery.value.trim()

    return { search: search === '' ? undefined : search }
  }

  // Shares the album counter on purpose: a mode switch must invalidate whatever
  // the other list still has in flight.
  const loadArtists = async (): Promise<void> => {
    requestRef.current += 1
    const token = requestRef.current

    artistsStatus.value = 'loading'
    artists.value = []
    artistsHasMoreState.value = false
    isLoadingMoreArtists.value = false
    loadMoreArtistsFailed.value = false

    const result = await getLibraryArtists(PAGE_SIZE, 0, currentArtistsQuery())
    if (token !== requestRef.current) {
      return
    }

    if (!result.ok) {
      artistsStatus.value = 'error'
      return
    }

    artists.value = result.value.artists
    artistsHasMoreState.value = result.value.hasMore
    artistsStatus.value = 'success'
  }

  const loadMoreArtists = async (): Promise<void> => {
    if (
      artistsStatus.value !== 'success' ||
      isLoadingMoreArtists.value ||
      !artistsHasMoreState.value
    ) {
      return
    }

    requestRef.current += 1
    const token = requestRef.current
    isLoadingMoreArtists.value = true
    loadMoreArtistsFailed.value = false

    const result = await getLibraryArtists(PAGE_SIZE, artists.value.length, currentArtistsQuery())
    if (token !== requestRef.current) {
      return
    }

    isLoadingMoreArtists.value = false

    if (!result.ok) {
      loadMoreArtistsFailed.value = true
      return
    }

    artists.value = [...artists.value, ...result.value.artists]
    artistsHasMoreState.value = result.value.hasMore
  }

  // Both loaders start at offset 0 and drop their list, so every caller of this
  // gets the pagination reset for free.
  const reloadCurrentList = (): void => {
    if (browseMode.value === 'artists') {
      void loadArtists()
      return
    }

    void loadLocalAlbums()
  }

  const setBrowseMode = (mode: BrowseMode): void => {
    if (mode === browseMode.value) {
      return
    }

    cancelSearchDebounce()
    browseMode.value = mode
    reloadCurrentList()
  }

  const loadMoreCurrent = async (): Promise<void> => {
    await (browseMode.value === 'artists' ? loadMoreArtists() : loadMore())
  }

  // A genre list without counts is the server's cold state, not an error: keep
  // whatever is already on screen rather than blanking the filter.
  const loadGenres = async (): Promise<void> => {
    const result = await getLibraryGenres()
    if (result.ok) {
      genres.value = result.value
    }
  }

  const stopRescanPoll = (): void => {
    if (rescanPollTimer.value !== null) {
      clearTimeout(rescanPollTimer.value)
      rescanPollTimer.value = null
    }
  }

  const pollRescanStatus = async (): Promise<void> => {
    const result = await getRescanStatus()
    if (result.ok && result.value.scanning) {
      rescanMessage.value = result.value.step
        ? buildRescanProgressMessage(t('library.rescanScanning'), result.value.step)
        : t('library.rescanScanning')
      rescanPollTimer.value = setTimeout(() => void pollRescanStatus(), 1500)
      return
    }

    isRescanning.value = false
    rescanMessage.value = t('library.rescanScanning')
    stopRescanPoll()

    setTimeout((): void => {
      void (async (): Promise<void> => {
        rescanMessage.value = null
        await loadLocalAlbums()
        await loadGenres()
      })()
    }, 1500)
  }

  const handleRescan = async (): Promise<void> => {
    if (isRescanning.value) {
      return
    }

    isRescanning.value = true
    rescanMessage.value = t('library.rescanStarting')

    const result = await triggerLibraryRescan()
    if (!result.ok) {
      isRescanning.value = false
      rescanMessage.value = t('library.rescanServerError')
      setTimeout(() => {
        rescanMessage.value = null
      }, 3000)
      return
    }

    rescanPollTimer.value = setTimeout(() => void pollRescanStatus(), 500)
  }

  const loadTidalAlbums = async (): Promise<void> => {
    tidalStatus.value = 'loading'
    const result = await getTidalAlbums(TIDAL_FETCH_LIMIT, 0)
    if (result.ok) {
      tidalAlbums.value = result.value.albums
      tidalStatus.value = 'success'
      return
    }

    tidalStatus.value = 'error'
  }

  const loadFeaturedAlbums = async (): Promise<void> => {
    featuredStatus.value = 'loading'
    const result = await getTidalFeaturedAlbums(50, 0)
    if (result.ok) {
      featuredAlbums.value = result.value.albums
      featuredStatus.value = 'success'
      return
    }

    featuredStatus.value = 'error'
  }

  onMounted(async () => {
    void loadGenres()
    await loadLocalAlbums()
  })

  onScopeDispose(() => {
    cancelSearchDebounce()
    stopRescanPoll()
  })

  watch(activeSource, async (source) => {
    if (source === 'tidal' && tidalStatus.value !== 'success') {
      await loadTidalAlbums()
    }
  })

  watch(tidalStatus, async (nextStatus) => {
    if (nextStatus === 'success' && tidalAlbums.value.length === 0) {
      await loadFeaturedAlbums()
    }
  })

  const handleNavigate = (albumId: string): void => {
    if (activeSource.value === 'tidal') {
      const album =
        tidalAlbums.value.find((entry) => entry.id === albumId) ??
        featuredAlbums.value.find((entry) => entry.id === albumId)
      void router.push({
        name: 'album-detail',
        params: { albumId },
        state: {
          tidalTitle: album?.title ?? '',
          tidalArtist: album?.artist ?? '',
          tidalCoverArtUrl: album?.coverArtUrl ?? '',
        },
      })
      return
    }

    void router.push({ name: 'album-detail', params: { albumId } })
  }

  // The artist detail view is reached by name, the same way search does it.
  const handleNavigateArtist = (name: string): void => {
    void router.push({ name: 'unified-artist', query: { name } })
  }

  const handlePlay = async (albumId: string): Promise<void> => {
    const result = await playAlbum(albumId)
    if (!result.ok) {
      return
    }
  }

  const handleAddToQueue = async (albumId: string): Promise<void> => {
    const result = await addAlbumToQueue(albumId)
    if (!result.ok) {
      return
    }
  }

  const setViewMode = (mode: ViewMode): void => {
    viewMode.value = mode
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  const applyReconciled = (reconciled: ReconciledFilters): void => {
    cancelSearchDebounce()
    sortBy.value = reconciled.sort
    sessionStorage.setItem(SORT_KEY, reconciled.sort)
    decadeFilter.value = reconciled.decade
    storeDecade(reconciled.decade)
    adjustedFilter.value = reconciled.adjusted ?? null

    void loadLocalAlbums()
  }

  const setSortBy = (sort: SortOption): void => {
    applyReconciled(reconcileFilters(sort, decadeFilter.value, 'sort'))
  }

  const setDecadeFilter = (decade: DecadeFilter): void => {
    applyReconciled(reconcileFilters(sortBy.value, decade, 'decade'))
  }

  const storeGenre = (genreId: number | null): void => {
    if (genreId === null) {
      sessionStorage.removeItem(GENRE_KEY)
      return
    }

    sessionStorage.setItem(GENRE_KEY, String(genreId))
  }

  const setGenreFilter = (genreId: number | null): void => {
    cancelSearchDebounce()
    genreFilter.value = genreId
    storeGenre(genreId)

    void loadLocalAlbums()
  }

  const setSearchQuery = (value: string): void => {
    searchQuery.value = value
    cancelSearchDebounce()

    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null
      reloadCurrentList()
    }, SEARCH_DEBOUNCE_MS)
  }

  const clearAllFilters = (): void => {
    cancelSearchDebounce()
    genreFilter.value = null
    storeGenre(null)
    decadeFilter.value = 'all'
    storeDecade('all')
    searchQuery.value = ''
    adjustedFilter.value = null

    void loadLocalAlbums()
  }

  return {
    activeSource,
    setSource,
    currentStatus,
    albums,
    browseMode,
    setBrowseMode,
    artists,
    loadMoreCurrent,
    handleNavigateArtist,
    showsAlbumControls,
    showsBrowseModeToggle,
    showsArtistBrowser,
    showsEmptyArtists,
    showsLoadMore,
    isLoadingMoreCurrent,
    loadMoreCurrentFailed,
    errorMessage,
    loadMoreErrorMessage,
    searchPlaceholder,
    tidalAlbumsForDisplay,
    featuredAlbums,
    featuredStatus,
    isRescanning,
    rescanMessage,
    handleRescan,
    handleNavigate,
    handlePlay,
    handleAddToQueue,
    viewMode,
    setViewMode,
    currentAlbumsForDisplay,
    sortOptions: librarySortOptions,
    decadeOptions: libraryDecadeOptions,
    sortBy,
    setSortBy,
    genreFilter,
    setGenreFilter,
    decadeFilter,
    setDecadeFilter,
    adjustedFilter,
    genreChips,
    genreRest,
    searchQuery,
    setSearchQuery,
    clearAllFilters,
    hasActiveFilters,
    filterSummary,
    showsRecentlyAddedCapNotice,
    showsDecadeScopeNotice,
    decadeScopeMessage,
  }
}
