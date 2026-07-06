import type { ArtistAlbumPopularity, ArtistAlbumSortOption, ArtistByNameAlbum } from './types'

export const getArtistNameQuery = (value: unknown): string =>
  typeof value === 'string' ? value : ''

export const getAlbumDetailId = (album: ArtistByNameAlbum): string => album.albumId ?? album.id

export const setCoverError = (
  current: Readonly<Record<string, boolean>>,
  albumId: string,
): Record<string, boolean> => ({
  ...current,
  [albumId]: true,
})

type SortableArtistAlbum = {
  readonly title: string
  readonly releaseYear?: number | null
}

const normalizeAlbumTitle = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

const getPopularityRank = (
  album: SortableArtistAlbum,
  popularity: ReadonlyArray<ArtistAlbumPopularity>,
): number => {
  const normalizedTitle = normalizeAlbumTitle(album.title)
  return popularity.find((entry) => normalizeAlbumTitle(entry.title) === normalizedTitle)?.rank ?? 0
}

export const sortArtistAlbums = <TAlbum extends SortableArtistAlbum>(
  albums: ReadonlyArray<TAlbum>,
  sortBy: ArtistAlbumSortOption,
  popularity: ReadonlyArray<ArtistAlbumPopularity>,
): ReadonlyArray<TAlbum> => {
  if (sortBy === 'title') {
    return [...albums].sort((left, right) => left.title.localeCompare(right.title))
  }

  if (sortBy === 'popularity') {
    return [...albums].sort((left, right) => {
      const leftRank = getPopularityRank(left, popularity)
      const rightRank = getPopularityRank(right, popularity)
      if (leftRank === 0 && rightRank === 0) {
        return left.title.localeCompare(right.title)
      }
      if (leftRank === 0) {
        return 1
      }
      if (rightRank === 0) {
        return -1
      }
      return leftRank - rightRank || left.title.localeCompare(right.title)
    })
  }

  return [...albums].sort((left, right) => {
    const leftYear = left.releaseYear ?? null
    const rightYear = right.releaseYear ?? null
    if (leftYear === null && rightYear === null) {
      return 0
    }
    if (leftYear === null) {
      return 1
    }
    if (rightYear === null) {
      return -1
    }
    return rightYear - leftYear || left.title.localeCompare(right.title)
  })
}
