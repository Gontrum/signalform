import { computed, onMounted, ref, watch } from 'vue'
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
import { getLibraryAlbums, getRescanStatus, triggerLibraryRescan } from '@/platform/api/libraryApi'
import {
  adaptTidalAlbumsForDisplay,
  buildRescanProgressMessage,
  decadeOptions,
  DECADE_KEY,
  DISPLAY_LIMIT,
  GENRE_KEY,
  getAvailableGenres,
  getDisplayedAlbums,
  parseStoredDecade,
  parseStoredSort,
  parseStoredViewMode,
  sortOptions,
  SORT_KEY,
  VIEW_MODE_KEY,
} from '../core/service'
import type {
  DecadeFilter,
  LibraryAlbum,
  LoadingStatus,
  SortOption,
  Source,
  ViewMode,
} from '../core/types'

type Translator = (key: MessageKey) => string

type UseLibraryBrowserResult = {
  readonly activeSource: Ref<Source>
  readonly setSource: (source: Source) => void
  readonly currentStatus: ComputedRef<LoadingStatus>
  readonly albums: Ref<readonly LibraryAlbum[]>
  readonly totalCount: Ref<number>
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
  readonly sortOptions: ReadonlyArray<{ readonly value: SortOption; readonly label: string }>
  readonly decadeOptions: typeof decadeOptions
  readonly sortBy: Ref<SortOption>
  readonly setSortBy: (sort: SortOption) => void
  readonly genreFilter: Ref<string | null>
  readonly setGenreFilter: (genre: string | null) => void
  readonly decadeFilter: Ref<DecadeFilter>
  readonly setDecadeFilter: (decade: DecadeFilter) => void
  readonly availableGenres: ComputedRef<readonly string[]>
  readonly displayedAlbums: ComputedRef<readonly LibraryAlbum[]>
  readonly clearAllFilters: () => void
  readonly hasActiveFilters: ComputedRef<boolean>
  readonly displayLimit: number
}

export const useLibraryBrowser = (t: Translator): UseLibraryBrowserResult => {
  const router = useRouter()

  const activeSource = ref<Source>('local')
  const status = ref<LoadingStatus>('loading')
  const albums = ref<readonly LibraryAlbum[]>([])
  const totalCount = ref(0)

  const tidalStatus = ref<LoadingStatus>('loading')
  const tidalAlbums = ref<readonly TidalAlbum[]>([])

  const featuredStatus = ref<LoadingStatus>('loading')
  const featuredAlbums = ref<readonly TidalAlbum[]>([])

  const isRescanning = ref(false)
  const rescanMessage = ref<string | null>(null)
  const rescanPollTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  const sortBy = ref<SortOption>(parseStoredSort(sessionStorage.getItem(SORT_KEY)))
  const genreFilter = ref<string | null>(sessionStorage.getItem(GENRE_KEY))
  const decadeFilter = ref<DecadeFilter>(parseStoredDecade(sessionStorage.getItem(DECADE_KEY)))
  const viewMode = ref<ViewMode>(parseStoredViewMode(localStorage.getItem(VIEW_MODE_KEY)))

  const availableGenres = computed(() => getAvailableGenres(albums.value))
  const displayedAlbums = computed(() =>
    getDisplayedAlbums(albums.value, sortBy.value, genreFilter.value, decadeFilter.value),
  )
  const tidalAlbumsForDisplay = computed(() => adaptTidalAlbumsForDisplay(tidalAlbums.value))
  const currentStatus = computed(() =>
    activeSource.value === 'local' ? status.value : tidalStatus.value,
  )
  const currentAlbumsForDisplay = computed(() =>
    activeSource.value === 'local' ? displayedAlbums.value : tidalAlbumsForDisplay.value,
  )
  const hasActiveFilters = computed(
    () => genreFilter.value !== null || decadeFilter.value !== 'all',
  )

  const librarySortOptions = sortOptions({
    'artist-az': t('library.sort.artistAz'),
    'title-az': t('library.sort.titleAz'),
    'year-newest': t('library.sort.yearNewest'),
    'recently-added': t('library.sort.recentlyAdded'),
  })

  const setSource = (source: Source): void => {
    activeSource.value = source
  }

  const loadLocalAlbums = async (): Promise<void> => {
    status.value = 'loading'
    const result = await getLibraryAlbums(DISPLAY_LIMIT, 0)

    if (result.ok) {
      albums.value = result.value.albums
      totalCount.value = result.value.totalCount
      status.value = 'success'
      return
    }

    status.value = 'error'
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
      })()
    }, 1500)
  }

  const handleRescan = async (): Promise<void> => {
    if (isRescanning.value) {
      return
    }

    isRescanning.value = true
    rescanMessage.value = 'Starting scan…'

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
    const result = await getTidalAlbums(DISPLAY_LIMIT, 0)
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
    await loadLocalAlbums()
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

  const setSortBy = (sort: SortOption): void => {
    sortBy.value = sort
    sessionStorage.setItem(SORT_KEY, sort)
  }

  const setGenreFilter = (genre: string | null): void => {
    genreFilter.value = genre
    if (genre === null) {
      sessionStorage.removeItem(GENRE_KEY)
      return
    }

    sessionStorage.setItem(GENRE_KEY, genre)
  }

  const setDecadeFilter = (decade: DecadeFilter): void => {
    decadeFilter.value = decade
    if (decade === 'all') {
      sessionStorage.removeItem(DECADE_KEY)
      return
    }

    sessionStorage.setItem(DECADE_KEY, decade)
  }

  const clearAllFilters = (): void => {
    setGenreFilter(null)
    setDecadeFilter('all')
  }

  return {
    activeSource,
    setSource,
    currentStatus,
    albums,
    totalCount,
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
    decadeOptions,
    sortBy,
    setSortBy,
    genreFilter,
    setGenreFilter,
    decadeFilter,
    setDecadeFilter,
    availableGenres,
    displayedAlbums,
    clearAllFilters,
    hasActiveFilters,
    displayLimit: DISPLAY_LIMIT,
  }
}
