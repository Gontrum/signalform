import type {
  DecadeFilter,
  LibraryAlbum,
  SortOption,
  TidalAlbumForDisplay,
  ViewMode,
} from './types'

export const DISPLAY_LIMIT = 250

export const SORT_KEY = 'library-sort-by'
export const GENRE_KEY = 'library-genre-filter'
export const DECADE_KEY = 'library-decade-filter'
export const VIEW_MODE_KEY = 'library-view-mode'

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
  stored === 'title-az' || stored === 'year-newest' || stored === 'recently-added'
    ? stored
    : 'artist-az'

export const parseStoredDecade = (stored: string | null): DecadeFilter =>
  stored === '2020s' ||
  stored === '2010s' ||
  stored === '2000s' ||
  stored === '1990s' ||
  stored === 'older'
    ? stored
    : 'all'

export const getAvailableGenres = (albums: readonly LibraryAlbum[]): readonly string[] =>
  Array.from(
    new Set(albums.map((album) => album.genre).filter((genre): genre is string => genre !== null)),
  ).sort((left, right) => left.localeCompare(right))

export const adaptTidalAlbumsForDisplay = (
  albums: readonly TidalAlbumForDisplay[],
): readonly LibraryAlbum[] =>
  albums.map((album) => ({
    ...album,
    releaseYear: null,
    genre: null,
  }))

export const getDisplayedAlbums = (
  albums: readonly LibraryAlbum[],
  sortBy: SortOption,
  genreFilter: string | null,
  decadeFilter: DecadeFilter,
): readonly LibraryAlbum[] => {
  const filteredByGenre = genreFilter
    ? albums.filter((album) => album.genre === genreFilter)
    : albums

  const filtered =
    decadeFilter !== 'all'
      ? filteredByGenre.filter((album) => {
          const year = album.releaseYear
          if (year === null) {
            return false
          }

          if (decadeFilter === '2020s') {
            return year >= 2020
          }
          if (decadeFilter === '2010s') {
            return year >= 2010 && year < 2020
          }
          if (decadeFilter === '2000s') {
            return year >= 2000 && year < 2010
          }
          if (decadeFilter === '1990s') {
            return year >= 1990 && year < 2000
          }

          return year < 1990
        })
      : filteredByGenre

  if (sortBy === 'artist-az') {
    return [...filtered].sort(
      (left, right) =>
        left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title),
    )
  }

  if (sortBy === 'title-az') {
    return [...filtered].sort(
      (left, right) =>
        left.title.localeCompare(right.title) || left.artist.localeCompare(right.artist),
    )
  }

  if (sortBy === 'year-newest') {
    return [...filtered].sort((left, right) => {
      if (left.releaseYear === null && right.releaseYear === null) {
        return left.title.localeCompare(right.title)
      }
      if (left.releaseYear === null) {
        return 1
      }
      if (right.releaseYear === null) {
        return -1
      }

      return right.releaseYear - left.releaseYear || left.title.localeCompare(right.title)
    })
  }

  return filtered
}

export const buildRescanProgressMessage = (scanningLabel: string, step: string): string =>
  `${scanningLabel} (${step.replace(/_/g, ' ')})`
