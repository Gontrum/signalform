import type {
  DecadeFilter,
  FilterField,
  GenreSplit,
  LibraryAlbum,
  ReconciledFilters,
  SortOption,
  TidalAlbumForDisplay,
  ViewMode,
} from './types'

// One infinite-scroll step: 250 covers at once are too much for a phone,
// 60 fill several screen heights and arrive quickly.
export const PAGE_SIZE = 60

export const GENRE_CHIP_COUNT = 20

export const SORT_KEY = 'library-sort-by'
export const GENRE_KEY = 'library-genre-filter'
export const DECADE_KEY = 'library-decade-filter'
export const VIEW_MODE_KEY = 'library-view-mode'

const DEFAULT_SORT: SortOption = 'artist-az'
const DEFAULT_DECADE: DecadeFilter = 'all'

// The keys are checked against the union, so a new SortOption breaks the build
// here instead of silently parsing as the default.
const SORT_OPTION_VALUES = {
  'artist-az': true,
  'title-az': true,
  'year-newest': true,
  'recently-added': true,
} as const satisfies Record<SortOption, true>

const DECADE_FILTER_VALUES = {
  all: true,
  '2020s': true,
  '2010s': true,
  '2000s': true,
  '1990s': true,
  older: true,
} as const satisfies Record<DecadeFilter, true>

const isSortOption = (value: string): value is SortOption =>
  Object.hasOwn(SORT_OPTION_VALUES, value)

const isDecadeFilter = (value: string): value is DecadeFilter =>
  Object.hasOwn(DECADE_FILTER_VALUES, value)

export const sortOptions = (
  labels: Record<SortOption, string>,
): ReadonlyArray<{ readonly value: SortOption; readonly label: string }> => [
  { value: 'artist-az', label: labels['artist-az'] },
  { value: 'title-az', label: labels['title-az'] },
  { value: 'year-newest', label: labels['year-newest'] },
  { value: 'recently-added', label: labels['recently-added'] },
]

export const decadeOptions: ReadonlyArray<{
  readonly value: DecadeFilter
  readonly label: string
}> = [
  { value: 'all', label: 'All years' },
  { value: '2020s', label: '2020s' },
  { value: '2010s', label: '2010s' },
  { value: '2000s', label: '2000s' },
  { value: '1990s', label: '90s' },
  { value: 'older', label: 'Older' },
]

export const parseStoredViewMode = (stored: string | null): ViewMode =>
  stored === 'list' ? 'list' : 'grid'

export const parseStoredSort = (stored: string | null): SortOption =>
  stored !== null && isSortOption(stored) ? stored : DEFAULT_SORT

export const parseStoredDecade = (stored: string | null): DecadeFilter =>
  stored !== null && isDecadeFilter(stored) ? stored : DEFAULT_DECADE

// The backend rejects 'recently-added' plus a decade with 400 (resolvePagination):
// one orders by date added, the other selects by release year.
export const reconcileFilters = (
  sort: SortOption,
  decade: DecadeFilter,
  changed: FilterField,
): ReconciledFilters => {
  if (sort !== 'recently-added' || decade === 'all') {
    return { sort, decade }
  }

  return changed === 'sort'
    ? { sort, decade: DEFAULT_DECADE, adjusted: 'decade' }
    : { sort: DEFAULT_SORT, decade, adjusted: 'sort' }
}

// The server already ranks the genres by album count; re-sorting would drop that.
export const splitGenres = <Genre>(
  genres: readonly Genre[],
  chipCount: number,
): GenreSplit<Genre> => {
  const count = Math.max(chipCount, 0)

  return { chips: genres.slice(0, count), rest: genres.slice(count) }
}

export const adaptTidalAlbumsForDisplay = (
  albums: readonly TidalAlbumForDisplay[],
): readonly LibraryAlbum[] =>
  albums.map((album) => ({
    ...album,
    releaseYear: null,
  }))

export const buildRescanProgressMessage = (scanningLabel: string, step: string): string =>
  `${scanningLabel} (${step.replace(/_/g, ' ')})`
