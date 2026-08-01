import { ordersByYearFirst } from '@signalform/shared'
import type {
  DecadeFilter,
  FilterField,
  GenreSplit,
  LibraryAlbum,
  LoadingStatus,
  ReconciledFilters,
  SortOption,
  Source,
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

// Both orderings group by year first, so without the headings the secondary
// sort inside a year reads as a broken list. Tidal has no such ordering.
export const showsYearHeadings = (
  source: Source,
  sort: SortOption,
  decade: DecadeFilter,
): boolean => source === 'local' && ordersByYearFirst(sort, decade)

const yearLabel = (year: number | null, unknownYearLabel: string): string =>
  year === null ? unknownYearLabel : String(year)

// Comparing against the previous entry of the merged list — not per page — is
// what keeps a year from being announced twice across a load-more boundary.
export const buildAlbumRows = (
  albums: readonly LibraryAlbum[],
  showHeadings: boolean,
  unknownYearLabel: string,
): ReadonlyArray<{ readonly album: LibraryAlbum; readonly heading?: string }> =>
  albums.map((album, index) => {
    const previous = albums[index - 1]
    const label = yearLabel(album.releaseYear, unknownYearLabel)
    const startsYear =
      showHeadings &&
      (previous === undefined || yearLabel(previous.releaseYear, unknownYearLabel) !== label)

    return { album, heading: startsYear ? label : undefined }
  })

export const findGenreName = <Genre extends { readonly id: number; readonly name: string }>(
  genres: readonly Genre[],
  genreId: number | null,
): string => genres.find((genre) => genre.id === genreId)?.name ?? ''

const matchGenreByName = <Genre extends { readonly name: string }>(
  genres: readonly Genre[],
  typed: string,
): Genre | undefined => {
  const needle = typed.trim().toLowerCase()

  return needle === '' ? undefined : genres.find((genre) => genre.name.toLowerCase() === needle)
}

export type GenreFilterStep =
  | { readonly action: 'clear' }
  | { readonly action: 'set'; readonly genreId: number }
  | { readonly action: 'keep' }

const KEEP: GenreFilterStep = { action: 'keep' }

// A free-text field: every keystroke asks again, so anything but a new answer
// has to stay silent — re-setting the genre already filtered on would restart
// the album query on each typed character.
export const nextGenreFilter = <Genre extends { readonly id: number; readonly name: string }>(
  genres: readonly Genre[],
  typed: string,
  current: number | null,
): GenreFilterStep => {
  if (typed.trim() === '') {
    return current === null ? KEEP : { action: 'clear' }
  }

  const match = matchGenreByName(genres, typed)

  return match === undefined || match.id === current ? KEEP : { action: 'set', genreId: match.id }
}

// The cold genre endpoint answers alphabetically and without counts, so the
// first 20 entries are not the biggest ones — showing them as chips would
// reshuffle the row as soon as the counts arrive.
export const showsGenreChips = <Genre extends { readonly albumCount?: number }>(
  chips: readonly Genre[],
): boolean => chips.some((genre) => genre.albumCount !== undefined)

export const showsEmptyLibrary = (
  source: Source,
  status: LoadingStatus,
  albumCount: number,
  hasActiveFilters: boolean,
): boolean => source === 'local' && status === 'success' && albumCount === 0 && !hasActiveFilters
