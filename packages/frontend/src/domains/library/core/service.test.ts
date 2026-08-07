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
  chipRevealScrollLeft,
  decadeFilterOptions,
  nextRovingTabIndex,
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

describe('decadeFilterOptions', () => {
  const labels: Record<DecadeFilter, string> = {
    all: 'Alle Jahre',
    '2020s': 'Zwanziger',
    '2010s': 'Zehner',
    '2000s': 'Nuller',
    '1990s': 'Neunziger',
    older: 'Älter',
  }

  it('gives every decade the label asked for, in chip order', () => {
    expect(decadeFilterOptions(labels)).toEqual([
      { value: 'all', label: 'Alle Jahre' },
      { value: '2020s', label: 'Zwanziger' },
      { value: '2010s', label: 'Zehner' },
      { value: '2000s', label: 'Nuller' },
      { value: '1990s', label: 'Neunziger' },
      { value: 'older', label: 'Älter' },
    ])
  })

  it('keeps the chips in decade order, newest first', () => {
    expect(decadeFilterOptions(labels).map((option) => option.value)).toEqual([
      'all',
      '2020s',
      '2010s',
      '2000s',
      '1990s',
      'older',
    ])
  })

  it('leaves no English decade label behind', () => {
    expect(decadeFilterOptions(labels).map((option) => option.label)).not.toContain('All years')
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

// Three tabs, so a step from the middle lands on neither end: an arithmetic that
// only ever returned 0 or the last index would pass a two-tab fixture.
describe('nextRovingTabIndex', () => {
  it('steps right through the middle of the list', () => {
    expect(nextRovingTabIndex('ArrowRight', 0, 3)).toBe(1)
    expect(nextRovingTabIndex('ArrowRight', 1, 3)).toBe(2)
  })

  it('steps left through the middle of the list', () => {
    expect(nextRovingTabIndex('ArrowLeft', 2, 3)).toBe(1)
    expect(nextRovingTabIndex('ArrowLeft', 1, 3)).toBe(0)
  })

  it('wraps from the last tab to the first', () => {
    expect(nextRovingTabIndex('ArrowRight', 2, 3)).toBe(0)
  })

  it('wraps from the first tab to the last', () => {
    expect(nextRovingTabIndex('ArrowLeft', 0, 3)).toBe(2)
  })

  it('wraps both ways over the two tabs the source selector has', () => {
    expect(nextRovingTabIndex('ArrowRight', 1, 2)).toBe(0)
    expect(nextRovingTabIndex('ArrowLeft', 0, 2)).toBe(1)
  })

  it('stays on the single tab of a one-tab list', () => {
    expect(nextRovingTabIndex('ArrowRight', 0, 1)).toBe(0)
    expect(nextRovingTabIndex('ArrowLeft', 0, 1)).toBe(0)
  })

  it.each(['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'Home', 'a'])(
    'moves nowhere for %s',
    (key) => {
      expect(nextRovingTabIndex(key, 1, 3)).toBeUndefined()
    },
  )

  it('moves nowhere without tabs to move between', () => {
    expect(nextRovingTabIndex('ArrowRight', 0, 0)).toBeUndefined()
  })

  it('moves nowhere from an index outside the list', () => {
    expect(nextRovingTabIndex('ArrowRight', -1, 3)).toBeUndefined()
    expect(nextRovingTabIndex('ArrowLeft', 3, 3)).toBeUndefined()
  })
})

describe('chipRevealScrollLeft', () => {
  it('scrolls the overshoot plus the gutter when the chip hangs over the edge', () => {
    expect(
      chipRevealScrollLeft({ scrollLeft: 40, chipRight: 520, rowRight: 500, gutterPx: 16 }),
    ).toBe(76)
  })

  it('adds the gutter it was given, not a fixed one', () => {
    expect(
      chipRevealScrollLeft({ scrollLeft: 40, chipRight: 520, rowRight: 500, gutterPx: 8 }),
    ).toBe(68)
  })

  it('keeps the position when the chip is fully in view', () => {
    expect(
      chipRevealScrollLeft({ scrollLeft: 40, chipRight: 400, rowRight: 500, gutterPx: 16 }),
    ).toBe(40)
  })

  it('keeps the position when the chip ends flush with the edge', () => {
    expect(
      chipRevealScrollLeft({ scrollLeft: 40, chipRight: 500, rowRight: 500, gutterPx: 16 }),
    ).toBe(40)
  })

  it('keeps the untouched start position of a fresh scroller in view', () => {
    expect(
      chipRevealScrollLeft({ scrollLeft: 0, chipRight: 733, rowRight: 390, gutterPx: 16 }),
    ).toBe(359)
  })

  it('carries the subpixel edges the layout actually reports', () => {
    expect(
      chipRevealScrollLeft({ scrollLeft: 12.5, chipRight: 520.75, rowRight: 500.25, gutterPx: 16 }),
    ).toBe(49)
  })
})
