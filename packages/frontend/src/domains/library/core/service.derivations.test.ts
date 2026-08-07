import { describe, expect, it } from 'vitest'
import {
  buildAlbumRows,
  buildDecadeScopeMessage,
  findGenreName,
  findOptionLabel,
  libraryControlVisibility,
  nextGenreFilter,
  resolveLocalStatus,
  showsDecadeScopeNotice,
  showsEmptyLibrary,
  showsGenreChips,
  showsLoadMore,
  showsRecentlyAddedCapNotice,
  showsYearHeadings,
} from './service'
import type {
  BrowseMode,
  DecadeFilter,
  LibraryAlbum,
  LoadingStatus,
  SortOption,
  Source,
} from './types'

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

describe('showsRecentlyAddedCapNotice', () => {
  // The shared RECENTLY_ADDED_ALBUM_LIMIT, spelled out on purpose: importing it
  // here would only restate the implementation, while the literal fails loudly
  // if the client stops agreeing with the cap the server applies.
  const CAP = 100

  const notice = (input: {
    readonly albumControls?: boolean
    readonly status?: LoadingStatus
    readonly sort?: SortOption
    readonly albumCount?: number
  }): boolean =>
    showsRecentlyAddedCapNotice({
      albumControls: input.albumControls ?? true,
      status: input.status ?? 'success',
      sort: input.sort ?? 'recently-added',
      albumCount: input.albumCount ?? CAP,
    })

  it('explains the list once it filled the cap exactly', () => {
    expect(notice({ albumCount: CAP })).toBe(true)
  })

  it('stays quiet one album short of the cap', () => {
    expect(notice({ albumCount: CAP - 1 })).toBe(false)
  })

  it('stays quiet for a short list', () => {
    expect(notice({ albumCount: 12 })).toBe(false)
    expect(notice({ albumCount: 0 })).toBe(false)
  })

  it('still explains a list that somehow grew past the cap', () => {
    expect(notice({ albumCount: CAP + 60 })).toBe(true)
  })

  it('never explains a cap the other sorts do not have', () => {
    const capReachingSorts: readonly SortOption[] = ['artist-az', 'title-az', 'year-newest']

    expect(capReachingSorts.filter((sort) => notice({ sort, albumCount: CAP }))).toEqual([])
  })

  it('stays quiet while the albums are still loading', () => {
    expect(notice({ status: 'loading' })).toBe(false)
  })

  it('stays quiet after a failed request', () => {
    expect(notice({ status: 'error' })).toBe(false)
  })

  it('stays quiet where the album controls are hidden, as in artist mode or Tidal', () => {
    expect(notice({ albumControls: false })).toBe(false)
  })
})

describe('showsDecadeScopeNotice', () => {
  const notice = (input: {
    readonly albumControls?: boolean
    readonly status?: LoadingStatus
    readonly decade?: DecadeFilter
    readonly albumCount?: number
  }): boolean =>
    showsDecadeScopeNotice({
      albumControls: input.albumControls ?? true,
      status: input.status ?? 'success',
      decade: input.decade ?? '1990s',
      albumCount: input.albumCount ?? 24,
    })

  it('explains the scope for every decade that narrows the list', () => {
    const decades: readonly DecadeFilter[] = ['2020s', '2010s', '2000s', '1990s', 'older']

    expect(decades.filter((decade) => !notice({ decade }))).toEqual([])
  })

  it('has nothing to explain without a decade filter', () => {
    expect(notice({ decade: 'all' })).toBe(false)
  })

  it('stays quiet while the albums are still loading', () => {
    expect(notice({ status: 'loading' })).toBe(false)
  })

  it('stays quiet after a failed request', () => {
    expect(notice({ status: 'error' })).toBe(false)
  })

  it('stays quiet when the decade returned nothing at all', () => {
    expect(notice({ albumCount: 0 })).toBe(false)
  })

  it('stays quiet where the album controls are hidden, as in artist mode or Tidal', () => {
    expect(notice({ albumControls: false })).toBe(false)
  })
})

describe('buildDecadeScopeMessage', () => {
  it('puts the sort label where the placeholder stands', () => {
    expect(buildDecadeScopeMessage('Only 1990s albums, sorted by {sort}.', 'Year, newest')).toBe(
      'Only 1990s albums, sorted by Year, newest.',
    )
  })

  it('leaves a template without a placeholder exactly as it is', () => {
    expect(buildDecadeScopeMessage('Only 1990s albums.', 'Year, newest')).toBe('Only 1990s albums.')
  })

  it('keeps a label that carries braces from breaking the template apart', () => {
    expect(buildDecadeScopeMessage('Sorted by {sort} for now.', '{sort}')).toBe(
      'Sorted by {sort} for now.',
    )
    expect(buildDecadeScopeMessage('Sorted by {sort} for now.', 'a {b} c')).toBe(
      'Sorted by a {b} c for now.',
    )
  })

  it('inserts a label with a dollar pattern literally', () => {
    expect(buildDecadeScopeMessage('Sorted by {sort}.', 'Rock $& $1 Roll')).toBe(
      'Sorted by Rock $& $1 Roll.',
    )
  })

  it('fills a placeholder that a translation repeats', () => {
    expect(buildDecadeScopeMessage('{sort}: 1990s albums by {sort}.', 'Title')).toBe(
      'Title: 1990s albums by Title.',
    )
  })
})

describe('findOptionLabel', () => {
  const sortOptionList: ReadonlyArray<{ readonly value: SortOption; readonly label: string }> = [
    { value: 'artist-az', label: 'Artist A–Z' },
    { value: 'title-az', label: 'Title A–Z' },
    { value: 'year-newest', label: 'Year, newest' },
    { value: 'recently-added', label: 'Recently added' },
  ]

  const decadeOptionList: ReadonlyArray<{ readonly value: DecadeFilter; readonly label: string }> =
    [
      { value: 'all', label: 'All years' },
      { value: '2020s', label: '2020er' },
      { value: '1990s', label: '90er' },
      { value: 'older', label: 'Älter' },
    ]

  it('labels a sort from the middle of the list', () => {
    expect(findOptionLabel(sortOptionList, 'year-newest')).toBe('Year, newest')
  })

  it('labels the first and the last option by their own value', () => {
    expect(findOptionLabel(sortOptionList, 'artist-az')).toBe('Artist A–Z')
    expect(findOptionLabel(sortOptionList, 'recently-added')).toBe('Recently added')
  })

  it('labels a decade from the same list shape', () => {
    expect(findOptionLabel(decadeOptionList, '1990s')).toBe('90er')
    expect(findOptionLabel(decadeOptionList, 'older')).toBe('Älter')
  })

  it('falls back to the value when the options do not carry it', () => {
    expect(findOptionLabel([{ value: 'title-az', label: 'Title A–Z' }], 'recently-added')).toBe(
      'recently-added',
    )
    expect(findOptionLabel([{ value: 'all', label: 'All years' }], '2010s')).toBe('2010s')
  })

  it('falls back to the value for an empty option list', () => {
    expect(findOptionLabel<SortOption>([], 'title-az')).toBe('title-az')
    expect(findOptionLabel<DecadeFilter>([], 'older')).toBe('older')
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
