import { describe, expect, it } from 'vitest'
import { sortArtistAlbums } from './service'
import type { ArtistAlbumPopularity } from './types'

const makeAlbum = (
  title: string,
  releaseYear: number | null,
): {
  readonly title: string
  readonly releaseYear: number | null
} => ({ title, releaseYear })

describe('sortArtistAlbums', () => {
  it('sorts by release year newest first with unknown years last', () => {
    const result = sortArtistAlbums(
      [makeAlbum('No Year', null), makeAlbum('Older', 1970), makeAlbum('Newer', 2000)],
      'year',
      [],
    )

    expect(result.map((album) => album.title)).toEqual(['Newer', 'Older', 'No Year'])
  })

  it('sorts alphabetically by title', () => {
    const result = sortArtistAlbums(
      [makeAlbum('The Wall', 1979), makeAlbum('Animals', 1977)],
      'title',
      [],
    )

    expect(result.map((album) => album.title)).toEqual(['Animals', 'The Wall'])
  })

  it('sorts matched albums by last.fm popularity and leaves unmatched albums last', () => {
    const popularity: ReadonlyArray<ArtistAlbumPopularity> = [
      { title: 'Kid A', artist: 'Radiohead', playcount: 1000, rank: 1 },
      { title: 'OK Computer', artist: 'Radiohead', playcount: 900, rank: 2 },
    ]

    const result = sortArtistAlbums(
      [makeAlbum('Unmatched', 2020), makeAlbum('OK Computer', 1997), makeAlbum('Kid A', 2000)],
      'popularity',
      popularity,
    )

    expect(result.map((album) => album.title)).toEqual(['Kid A', 'OK Computer', 'Unmatched'])
  })
})
