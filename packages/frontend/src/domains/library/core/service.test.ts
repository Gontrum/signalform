import { describe, expect, it } from 'vitest'
import {
  DECADE_KEY,
  GENRE_CHIP_COUNT,
  GENRE_KEY,
  PAGE_SIZE,
  SORT_KEY,
  VIEW_MODE_KEY,
  adaptTidalAlbumsForDisplay,
  buildRescanProgressMessage,
  decadeOptions,
  parseStoredDecade,
  parseStoredSort,
  parseStoredViewMode,
  reconcileFilters,
  sortOptions,
  splitGenres,
} from './service'
import type { DecadeFilter, SortOption, TidalAlbumForDisplay } from './types'

// Compiler-checked against the unions: a value added to SortOption or
// DecadeFilter fails here first, and the tests below then check it parses.
const ALL_SORT_OPTIONS: Record<SortOption, true> = {
  'artist-az': true,
  'title-az': true,
  'year-newest': true,
  'recently-added': true,
}

const ALL_DECADE_FILTERS: Record<DecadeFilter, true> = {
  all: true,
  '2020s': true,
  '2010s': true,
  '2000s': true,
  '1990s': true,
  older: true,
}

describe('parseStoredSort', () => {
  it.each<SortOption>(['artist-az', 'title-az', 'year-newest', 'recently-added'])(
    'passes through the stored value %s',
    (stored) => {
      expect(parseStoredSort(stored)).toBe(stored)
    },
  )

  it('passes through every member of the SortOption union', () => {
    const values = Object.keys(ALL_SORT_OPTIONS)

    expect(values.map((value) => parseStoredSort(value))).toEqual(values)
  })

  it('falls back to artist-az for a missing value', () => {
    expect(parseStoredSort(null)).toBe('artist-az')
  })

  it('falls back to artist-az for an unknown value', () => {
    expect(parseStoredSort('year-oldest')).toBe('artist-az')
  })

  it('falls back to artist-az for an inherited object property', () => {
    expect(parseStoredSort('toString')).toBe('artist-az')
  })
})

describe('parseStoredDecade', () => {
  it.each<DecadeFilter>(['all', '2020s', '2010s', '2000s', '1990s', 'older'])(
    'passes through the stored value %s',
    (stored) => {
      expect(parseStoredDecade(stored)).toBe(stored)
    },
  )

  it('passes through every member of the DecadeFilter union', () => {
    const values = Object.keys(ALL_DECADE_FILTERS)

    expect(values.map((value) => parseStoredDecade(value))).toEqual(values)
  })

  it('falls back to all for a missing value', () => {
    expect(parseStoredDecade(null)).toBe('all')
  })

  it('falls back to all for an unknown value', () => {
    expect(parseStoredDecade('1980s')).toBe('all')
  })

  it('falls back to all for an inherited object property', () => {
    expect(parseStoredDecade('constructor')).toBe('all')
  })
})

describe('parseStoredViewMode', () => {
  it('passes through the stored value list', () => {
    expect(parseStoredViewMode('list')).toBe('list')
  })

  it('passes through the stored value grid', () => {
    expect(parseStoredViewMode('grid')).toBe('grid')
  })

  it('falls back to grid for a missing value', () => {
    expect(parseStoredViewMode(null)).toBe('grid')
  })

  it('falls back to grid for an unknown value', () => {
    expect(parseStoredViewMode('table')).toBe('grid')
  })
})

describe('reconcileFilters', () => {
  it('drops the decade when the user picks recently-added', () => {
    expect(reconcileFilters('recently-added', '1990s', 'sort')).toEqual({
      sort: 'recently-added',
      decade: 'all',
      adjusted: 'decade',
    })
  })

  it('resets the sort when the user picks a decade while recently-added is active', () => {
    expect(reconcileFilters('recently-added', '2010s', 'decade')).toEqual({
      sort: 'artist-az',
      decade: '2010s',
      adjusted: 'sort',
    })
  })

  it('keeps recently-added when no decade is active', () => {
    expect(reconcileFilters('recently-added', 'all', 'sort')).toEqual({
      sort: 'recently-added',
      decade: 'all',
    })
  })

  it('keeps the decade when the sort is not recently-added', () => {
    expect(reconcileFilters('year-newest', '2000s', 'decade')).toEqual({
      sort: 'year-newest',
      decade: '2000s',
    })
  })

  it('reports no adjustment for a valid combination', () => {
    expect(reconcileFilters('title-az', 'older', 'sort').adjusted).toBeUndefined()
  })

  it.each<readonly [SortOption, DecadeFilter]>([
    ['artist-az', 'all'],
    ['artist-az', '2020s'],
    ['title-az', '1990s'],
    ['year-newest', 'older'],
    ['recently-added', 'all'],
  ])('leaves %s combined with %s untouched regardless of the changed field', (sort, decade) => {
    expect(reconcileFilters(sort, decade, 'sort')).toEqual({ sort, decade })
    expect(reconcileFilters(sort, decade, 'decade')).toEqual({ sort, decade })
  })
})

describe('splitGenres', () => {
  // Neither alphabetical nor by album count: an accidental sort cannot pass.
  const genres: ReadonlyArray<{ readonly name: string; readonly albumCount: number }> = [
    { name: 'Rock', albumCount: 120 },
    { name: 'Ambient', albumCount: 7 },
    { name: 'Jazz', albumCount: 44 },
    { name: 'Punk', albumCount: 3 },
  ]

  const namesOf = (entries: ReadonlyArray<{ readonly name: string }>): ReadonlyArray<string> =>
    entries.map((entry) => entry.name)

  it('keeps the server order in both parts', () => {
    const { chips, rest } = splitGenres(genres, 2)

    expect(namesOf(chips)).toEqual(['Rock', 'Ambient'])
    expect(namesOf(rest)).toEqual(['Jazz', 'Punk'])
  })

  it('leaves the rest empty when there are fewer genres than chips', () => {
    const { chips, rest } = splitGenres(genres, 10)

    expect(namesOf(chips)).toEqual(['Rock', 'Ambient', 'Jazz', 'Punk'])
    expect(rest).toEqual([])
  })

  it('leaves the rest empty when the count matches exactly', () => {
    const { chips, rest } = splitGenres(genres, genres.length)

    expect(namesOf(chips)).toEqual(['Rock', 'Ambient', 'Jazz', 'Punk'])
    expect(rest).toEqual([])
  })

  it('returns two empty parts for an empty list', () => {
    expect(splitGenres([], GENRE_CHIP_COUNT)).toEqual({ chips: [], rest: [] })
  })

  it('sends everything to the rest for a chip count of zero', () => {
    const { chips, rest } = splitGenres(genres, 0)

    expect(chips).toEqual([])
    expect(namesOf(rest)).toEqual(['Rock', 'Ambient', 'Jazz', 'Punk'])
  })

  it('splits a long list at the chip count', () => {
    const many = Array.from({ length: 25 }, (_, index) => `genre-${25 - index}`)

    const { chips, rest } = splitGenres(many, GENRE_CHIP_COUNT)

    expect(chips[0]).toBe('genre-25')
    expect(chips[GENRE_CHIP_COUNT - 1]).toBe('genre-6')
    expect(rest).toEqual(['genre-5', 'genre-4', 'genre-3', 'genre-2', 'genre-1'])
  })

  it('does not touch the input list', () => {
    const input = Object.freeze([...genres])

    splitGenres(input, 2)

    expect(namesOf(input)).toEqual(['Rock', 'Ambient', 'Jazz', 'Punk'])
  })
})

describe('adaptTidalAlbumsForDisplay', () => {
  const tidalAlbums: readonly TidalAlbumForDisplay[] = [
    {
      id: 't1',
      title: 'Random Access Memories',
      artist: 'Daft Punk',
      coverArtUrl: 'https://covers.test/t1.jpg',
    },
    {
      id: 't2',
      title: 'In Rainbows',
      artist: 'Radiohead',
      coverArtUrl: 'https://covers.test/t2.jpg',
    },
  ]

  it('carries over id, title, artist and cover art in input order', () => {
    expect(adaptTidalAlbumsForDisplay(tidalAlbums)).toEqual([
      {
        id: 't1',
        title: 'Random Access Memories',
        artist: 'Daft Punk',
        coverArtUrl: 'https://covers.test/t1.jpg',
        releaseYear: null,
      },
      {
        id: 't2',
        title: 'In Rainbows',
        artist: 'Radiohead',
        coverArtUrl: 'https://covers.test/t2.jpg',
        releaseYear: null,
      },
    ])
  })

  it('returns an empty list for an empty input', () => {
    expect(adaptTidalAlbumsForDisplay([])).toEqual([])
  })
})

describe('buildRescanProgressMessage', () => {
  it('brackets the step behind the label', () => {
    expect(buildRescanProgressMessage('Scanning', 'discovery')).toBe('Scanning (discovery)')
  })

  it('replaces every underscore with a space', () => {
    expect(buildRescanProgressMessage('Scanning', 'discovering_new_files')).toBe(
      'Scanning (discovering new files)',
    )
  })
})

describe('sortOptions', () => {
  it('returns the four options in order with the given labels', () => {
    const labels: Record<SortOption, string> = {
      'artist-az': 'Künstler A-Z',
      'title-az': 'Titel A-Z',
      'year-newest': 'Jahr, neueste zuerst',
      'recently-added': 'Zuletzt hinzugefügt',
    }

    expect(sortOptions(labels)).toEqual([
      { value: 'artist-az', label: 'Künstler A-Z' },
      { value: 'title-az', label: 'Titel A-Z' },
      { value: 'year-newest', label: 'Jahr, neueste zuerst' },
      { value: 'recently-added', label: 'Zuletzt hinzugefügt' },
    ])
  })
})

describe('decadeOptions', () => {
  it('offers all six decade values in order', () => {
    expect(decadeOptions.map((option) => option.value)).toEqual([
      'all',
      '2020s',
      '2010s',
      '2000s',
      '1990s',
      'older',
    ])
  })

  it('labels the 1990s option as 90s', () => {
    expect(decadeOptions.find((option) => option.value === '1990s')?.label).toBe('90s')
  })
})

describe('constants', () => {
  it('exposes the storage keys', () => {
    expect([SORT_KEY, GENRE_KEY, DECADE_KEY, VIEW_MODE_KEY]).toEqual([
      'library-sort-by',
      'library-genre-filter',
      'library-decade-filter',
      'library-view-mode',
    ])
  })

  it('pages the album list in steps of 60', () => {
    expect(PAGE_SIZE).toBe(60)
  })

  it('shows 20 genres as chips', () => {
    expect(GENRE_CHIP_COUNT).toBe(20)
  })
})
