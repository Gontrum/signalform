import { describe, expect, it } from 'vitest'
import {
  buildAlbumRows,
  findGenreName,
  libraryControlVisibility,
  nextGenreFilter,
  resolveLocalStatus,
  showsEmptyLibrary,
  showsGenreChips,
  showsLoadMore,
  showsYearHeadings,
} from './service'
import type { BrowseMode, LibraryAlbum, LoadingStatus, Source } from './types'

const UNKNOWN_YEAR = 'Unknown year'

const album = (id: string, releaseYear: number | null): LibraryAlbum => ({
  id,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  releaseYear,
  coverArtUrl: `https://covers.test/${id}.jpg`,
})

const headingsOf = (
  rows: ReadonlyArray<{ readonly heading?: string }>,
): ReadonlyArray<string | undefined> => rows.map((row) => row.heading)

describe('buildAlbumRows', () => {
  // Deliberately not in year order: a heading per year block must follow the
  // list as it stands, not a year order the function might invent.
  const albums: readonly LibraryAlbum[] = [
    album('a', 1994),
    album('b', 1994),
    album('c', 2001),
    album('d', 1994),
    album('e', null),
    album('f', null),
    album('g', 2001),
  ]

  it('heads the first album of every year block', () => {
    expect(headingsOf(buildAlbumRows(albums, true, UNKNOWN_YEAR))).toEqual([
      '1994',
      undefined,
      '2001',
      '1994',
      UNKNOWN_YEAR,
      undefined,
      '2001',
    ])
  })

  it('repeats a year that returns after another year', () => {
    const rows = buildAlbumRows(
      [album('a', 1994), album('c', 2001), album('d', 1994)],
      true,
      UNKNOWN_YEAR,
    )

    expect(headingsOf(rows)).toEqual(['1994', '2001', '1994'])
  })

  it('leaves a continuing year without a second heading', () => {
    const rows = buildAlbumRows([album('a', 1994), album('b', 1994)], true, UNKNOWN_YEAR)

    expect(headingsOf(rows)).toEqual(['1994', undefined])
  })

  it('groups albums without a release year under the unknown label', () => {
    const rows = buildAlbumRows([album('e', null), album('f', null)], true, 'Jahr unbekannt')

    expect(headingsOf(rows)).toEqual(['Jahr unbekannt', undefined])
  })

  it('separates an unknown year from the year that follows it', () => {
    const rows = buildAlbumRows([album('e', null), album('c', 2001)], true, UNKNOWN_YEAR)

    expect(headingsOf(rows)).toEqual([UNKNOWN_YEAR, '2001'])
  })

  it('gives no row a heading when headings are off', () => {
    const rows = buildAlbumRows(albums, false, UNKNOWN_YEAR)

    expect(headingsOf(rows)).toEqual(albums.map(() => undefined))
  })

  it('carries every album through in input order', () => {
    const rows = buildAlbumRows(albums, true, UNKNOWN_YEAR)

    expect(rows.map((row) => row.album.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(rows[2]?.album).toEqual(album('c', 2001))
  })

  it('returns no rows for an empty list', () => {
    expect(buildAlbumRows([], true, UNKNOWN_YEAR)).toEqual([])
  })
})

describe('nextGenreFilter', () => {
  const genres: ReadonlyArray<{ readonly id: number; readonly name: string }> = [
    { id: 7, name: 'Rock' },
    { id: 2, name: 'Ambient' },
    { id: 5, name: 'Jazz' },
  ]

  it('sets the genre that was typed out in full', () => {
    expect(nextGenreFilter(genres, 'Ambient', null)).toEqual({ action: 'set', genreId: 2 })
  })

  it('sets a genre typed in a different casing', () => {
    expect(nextGenreFilter(genres, 'jAzZ', null)).toEqual({ action: 'set', genreId: 5 })
  })

  it('replaces the genre currently filtered on', () => {
    expect(nextGenreFilter(genres, 'Rock', 5)).toEqual({ action: 'set', genreId: 7 })
  })

  it('keeps the filter when the typed genre is the one already set', () => {
    expect(nextGenreFilter(genres, 'Jazz', 5)).toEqual({ action: 'keep' })
  })

  it('keeps the filter while the typed name matches nothing yet', () => {
    expect(nextGenreFilter(genres, 'Amb', 7)).toEqual({ action: 'keep' })
  })

  it('clears the filter for an emptied field', () => {
    expect(nextGenreFilter(genres, '', 7)).toEqual({ action: 'clear' })
  })

  it('clears the filter for a field left with whitespace only', () => {
    expect(nextGenreFilter(genres, '  \t ', 7)).toEqual({ action: 'clear' })
  })

  it('keeps quiet on an empty field when no genre is filtered', () => {
    expect(nextGenreFilter(genres, '', null)).toEqual({ action: 'keep' })
    expect(nextGenreFilter(genres, '   ', null)).toEqual({ action: 'keep' })
  })

  it('ignores whitespace around an otherwise exact name', () => {
    expect(nextGenreFilter(genres, '  Rock\n', null)).toEqual({ action: 'set', genreId: 7 })
  })

  it('keeps the filter when the padded name is the one already set', () => {
    expect(nextGenreFilter(genres, ' rock ', 7)).toEqual({ action: 'keep' })
  })

  it('keeps the filter when no genres are loaded yet', () => {
    expect(nextGenreFilter([], 'Rock', null)).toEqual({ action: 'keep' })
  })

  it('sets the first of two genres that differ only in casing', () => {
    // The earlier entry deliberately carries the higher id: "the first match
    // wins" must not be confusable with "the smallest id wins".
    const casingTwins: ReadonlyArray<{ readonly id: number; readonly name: string }> = [
      { id: 7, name: 'Rock' },
      { id: 2, name: 'Ambient' },
      { id: 5, name: 'rock' },
    ]

    expect(nextGenreFilter(casingTwins, 'ROCK', null)).toEqual({ action: 'set', genreId: 7 })
  })
})

describe('findGenreName', () => {
  const genres: ReadonlyArray<{ readonly id: number; readonly name: string }> = [
    { id: 7, name: 'Rock' },
    { id: 2, name: 'Ambient' },
    { id: 5, name: 'Jazz' },
  ]

  it('names the genre behind the id', () => {
    expect(findGenreName(genres, 5)).toBe('Jazz')
  })

  it('names the first genre of the list by its own id', () => {
    expect(findGenreName(genres, 7)).toBe('Rock')
  })

  it('answers with an empty string for an id that is not in the list', () => {
    expect(findGenreName(genres, 99)).toBe('')
  })

  it('answers with an empty string when no genre is filtered', () => {
    expect(findGenreName(genres, null)).toBe('')
  })

  it('answers with an empty string for an empty list', () => {
    expect(findGenreName([], 7)).toBe('')
  })
})

type ChipGenre = { readonly name: string; readonly albumCount?: number }

describe('showsGenreChips', () => {
  it('shows chips once any of them carries a count', () => {
    const warm: readonly ChipGenre[] = [
      { name: 'Rock' },
      { name: 'Ambient' },
      { name: 'Jazz', albumCount: 44 },
    ]

    expect(showsGenreChips(warm)).toBe(true)
  })

  it('counts a zero album count as a warm answer', () => {
    const warm: readonly ChipGenre[] = [{ name: 'Rock', albumCount: 0 }]

    expect(showsGenreChips(warm)).toBe(true)
  })

  it('hides the chips while the cold endpoint answers without counts', () => {
    const cold: readonly ChipGenre[] = [{ name: 'Rock' }, { name: 'Ambient' }]

    expect(showsGenreChips(cold)).toBe(false)
  })

  it('hides the chips when there are none', () => {
    expect(showsGenreChips([])).toBe(false)
  })
})

describe('showsEmptyLibrary', () => {
  it('reports an empty library for a loaded local source without filters', () => {
    expect(showsEmptyLibrary('local', 'success', 0, false)).toBe(true)
  })

  it('stays quiet for Tidal, which has its own empty state', () => {
    expect(showsEmptyLibrary('tidal', 'success', 0, false)).toBe(false)
  })

  it('stays quiet while the albums are still loading', () => {
    expect(showsEmptyLibrary('local', 'loading', 0, false)).toBe(false)
  })

  it('stays quiet after an error, where zero albums mean nothing', () => {
    expect(showsEmptyLibrary('local', 'error', 0, false)).toBe(false)
  })

  it('stays quiet while albums are on screen', () => {
    expect(showsEmptyLibrary('local', 'success', 1, false)).toBe(false)
  })

  it('leaves an empty filter result to the no-match message', () => {
    expect(showsEmptyLibrary('local', 'success', 0, true)).toBe(false)
  })
})

describe('libraryControlVisibility', () => {
  const visibility = (
    source: Source,
    mode: BrowseMode,
    artistStatus: LoadingStatus = 'success',
    artistCount = 12,
  ): ReturnType<typeof libraryControlVisibility> =>
    libraryControlVisibility({ source, mode, artistStatus, artistCount })

  it('shows the album controls and the toggle for the local album list', () => {
    expect(visibility('local', 'albums')).toEqual({
      albumControls: true,
      browseModeToggle: true,
      artistBrowser: false,
      emptyArtists: false,
    })
  })

  it('drops the album controls in artist mode but keeps the toggle', () => {
    expect(visibility('local', 'artists')).toEqual({
      albumControls: false,
      browseModeToggle: true,
      artistBrowser: true,
      emptyArtists: false,
    })
  })

  it('hides toggle and album controls for Tidal, whichever mode is stored', () => {
    expect(visibility('tidal', 'albums')).toEqual({
      albumControls: false,
      browseModeToggle: false,
      artistBrowser: false,
      emptyArtists: false,
    })
    expect(visibility('tidal', 'artists', 'success', 0)).toEqual({
      albumControls: false,
      browseModeToggle: false,
      artistBrowser: false,
      emptyArtists: false,
    })
  })

  it('reports no artists once the artist request answered with none', () => {
    expect(visibility('local', 'artists', 'success', 0).emptyArtists).toBe(true)
  })

  it('stays quiet about no artists while the list is still loading', () => {
    expect(visibility('local', 'artists', 'loading', 0).emptyArtists).toBe(false)
  })

  it('stays quiet about no artists after an error, where zero means nothing', () => {
    expect(visibility('local', 'artists', 'error', 0).emptyArtists).toBe(false)
  })

  it('stays quiet about no artists while artists are on screen', () => {
    expect(visibility('local', 'artists', 'success', 1).emptyArtists).toBe(false)
  })

  it('leaves the artist emptiness unmentioned while the album list is shown', () => {
    expect(visibility('local', 'albums', 'success', 0).emptyArtists).toBe(false)
  })
})

describe('resolveLocalStatus', () => {
  it('answers with the artist status in artist mode', () => {
    expect(resolveLocalStatus('artists', 'success', 'loading')).toBe('loading')
    expect(resolveLocalStatus('artists', 'loading', 'success')).toBe('success')
  })

  it('answers with the album status in album mode', () => {
    expect(resolveLocalStatus('albums', 'loading', 'success')).toBe('loading')
    expect(resolveLocalStatus('albums', 'success', 'loading')).toBe('success')
  })

  it('keeps a failed artist request out of the album list', () => {
    expect(resolveLocalStatus('albums', 'success', 'error')).toBe('success')
  })

  it('keeps a failed album request out of the artist list', () => {
    expect(resolveLocalStatus('artists', 'error', 'success')).toBe('success')
  })
})

describe('showsLoadMore', () => {
  it('offers the next page for a loaded local list that has one', () => {
    expect(showsLoadMore('local', 'success', true)).toBe(true)
  })

  it('never offers a next page for Tidal, which arrives in one request', () => {
    expect(showsLoadMore('tidal', 'success', true)).toBe(false)
  })

  it('waits for the first page before offering the next', () => {
    expect(showsLoadMore('local', 'loading', true)).toBe(false)
  })

  it('offers no next page after a failed request', () => {
    expect(showsLoadMore('local', 'error', true)).toBe(false)
  })

  it('offers no next page once the server announced the end', () => {
    expect(showsLoadMore('local', 'success', false)).toBe(false)
  })
})

describe('showsYearHeadings', () => {
  it('heads the years for the newest-first sort', () => {
    expect(showsYearHeadings('local', 'year-newest', 'all')).toBe(true)
  })

  it('heads the years under a decade filter regardless of the sort', () => {
    expect(showsYearHeadings('local', 'artist-az', '1990s')).toBe(true)
    expect(showsYearHeadings('local', 'title-az', 'older')).toBe(true)
  })

  it('leaves an alphabetical unfiltered list without year headings', () => {
    expect(showsYearHeadings('local', 'artist-az', 'all')).toBe(false)
    expect(showsYearHeadings('local', 'recently-added', 'all')).toBe(false)
  })

  it('never heads the Tidal list, whichever local filters are stored', () => {
    expect(showsYearHeadings('tidal', 'year-newest', 'all')).toBe(false)
    expect(showsYearHeadings('tidal', 'title-az', '2000s')).toBe(false)
  })
})
