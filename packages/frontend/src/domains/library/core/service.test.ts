import { describe, expect, it } from 'vitest'
import {
  DECADE_KEY,
  GENRE_KEY,
  SORT_KEY,
  VIEW_MODE_KEY,
  adaptTidalAlbumsForDisplay,
  buildRescanProgressMessage,
  decadeOptions,
  getAvailableGenres,
  getDisplayedAlbums,
  parseStoredDecade,
  parseStoredSort,
  parseStoredViewMode,
  sortOptions,
} from './service'
import type { DecadeFilter, LibraryAlbum, SortOption, TidalAlbumForDisplay } from './types'

const album = (
  id: string,
  title: string,
  artist: string,
  releaseYear: number | null,
  genre: string | null,
): LibraryAlbum => ({
  id,
  title,
  artist,
  releaseYear,
  coverArtUrl: `https://covers.test/${id}.jpg`,
  genre,
})

const titlesOf = (albums: readonly LibraryAlbum[]): readonly string[] =>
  albums.map((entry) => entry.title)

const artistsOf = (albums: readonly LibraryAlbum[]): readonly string[] =>
  albums.map((entry) => entry.artist)

const yearsOf = (albums: readonly LibraryAlbum[]): ReadonlyArray<number | null> =>
  albums.map((entry) => entry.releaseYear)

const sortedTitlesOf = (albums: readonly LibraryAlbum[]): readonly string[] =>
  [...titlesOf(albums)].sort()

// Insertion order is deliberately wrong for artist-az, title-az and year-newest alike:
// a missing sort must not accidentally produce the expected sequence.
const catalogue: readonly LibraryAlbum[] = [
  album('1', 'Discovery', 'Daft Punk', 2001, 'Electronic'),
  album('2', 'Zenith', 'Radiohead', 1997, 'Rock'),
  album('3', 'Mirage', 'Zola Jesus', 2014, 'Rock'),
  album('4', 'Unknown Sessions', 'Wolf Parade', null, 'Folk'),
  album('5', 'Amnesiac', 'Radiohead', 2001, 'Rock'),
  album('6', 'Mirage', 'Adele', 2016, 'Pop'),
  album('7', 'Kid A', 'Radiohead', 2000, 'Rock'),
  album('8', 'Bäst Of', 'Ärzte', 1993, 'Punk'),
  album('9', 'Basement Tapes', 'Beatles', null, 'Rock'),
  album('10', 'Turn On The Bright Lights', 'Interpol', 2002, 'Rock'),
]

const decadeCatalogue: readonly LibraryAlbum[] = [
  album('d1', 'Y1989', 'Boundary', 1989, 'Rock'),
  album('d2', 'Y2010', 'Boundary', 2010, 'Rock'),
  album('d3', 'Ynull', 'Boundary', null, 'Rock'),
  album('d4', 'Y1999', 'Boundary', 1999, 'Rock'),
  album('d5', 'Y2020', 'Boundary', 2020, 'Rock'),
  album('d6', 'Y2000', 'Boundary', 2000, 'Rock'),
  album('d7', 'Y2024', 'Boundary', 2024, 'Rock'),
  album('d8', 'Y1990', 'Boundary', 1990, 'Rock'),
  album('d9', 'Y2009', 'Boundary', 2009, 'Rock'),
  album('d10', 'Y2019', 'Boundary', 2019, 'Rock'),
]

describe('getDisplayedAlbums sorting', () => {
  // Ärzte is excluded here: localeCompare reads the process locale, and sv_SE sorts ä behind z.
  it('sorts by artist and breaks ties on title', () => {
    const result = getDisplayedAlbums(catalogue, 'artist-az', null, 'all')

    expect(artistsOf(result).filter((artist) => artist !== 'Ärzte')).toEqual([
      'Adele',
      'Beatles',
      'Daft Punk',
      'Interpol',
      'Radiohead',
      'Radiohead',
      'Radiohead',
      'Wolf Parade',
      'Zola Jesus',
    ])
  })

  it('orders the albums of one artist alphabetically by title', () => {
    const result = getDisplayedAlbums(catalogue, 'artist-az', null, 'all')
    const radioheadTitles = titlesOf(result.filter((entry) => entry.artist === 'Radiohead'))

    expect(radioheadTitles).toEqual(['Amnesiac', 'Kid A', 'Zenith'])
  })

  it('sorts by title and breaks ties on artist', () => {
    const result = getDisplayedAlbums(catalogue, 'title-az', null, 'all')

    expect(titlesOf(result)).toEqual([
      'Amnesiac',
      'Basement Tapes',
      'Bäst Of',
      'Discovery',
      'Kid A',
      'Mirage',
      'Mirage',
      'Turn On The Bright Lights',
      'Unknown Sessions',
      'Zenith',
    ])
  })

  it('resolves two albums of the same title by artist', () => {
    const result = getDisplayedAlbums(catalogue, 'title-az', null, 'all')

    expect(artistsOf(result.filter((entry) => entry.title === 'Mirage'))).toEqual([
      'Adele',
      'Zola Jesus',
    ])
  })

  it('sorts by year descending and pushes albums without a year to the end', () => {
    const result = getDisplayedAlbums(catalogue, 'year-newest', null, 'all')

    expect(yearsOf(result)).toEqual([2016, 2014, 2002, 2001, 2001, 2000, 1997, 1993, null, null])
  })

  it('breaks an equal year on title', () => {
    const result = getDisplayedAlbums(catalogue, 'year-newest', null, 'all')

    expect(titlesOf(result.filter((entry) => entry.releaseYear === 2001))).toEqual([
      'Amnesiac',
      'Discovery',
    ])
  })

  it('breaks two missing years on title', () => {
    const result = getDisplayedAlbums(catalogue, 'year-newest', null, 'all')

    expect(titlesOf(result.filter((entry) => entry.releaseYear === null))).toEqual([
      'Basement Tapes',
      'Unknown Sessions',
    ])
  })

  // LibraryAlbum carries no added-at date, so recency is unsortable here until LMS sort:new lands.
  it('returns the filtered albums in input order for recently-added', () => {
    const result = getDisplayedAlbums(catalogue, 'recently-added', null, 'all')

    expect(titlesOf(result)).toEqual([
      'Discovery',
      'Zenith',
      'Mirage',
      'Unknown Sessions',
      'Amnesiac',
      'Mirage',
      'Kid A',
      'Bäst Of',
      'Basement Tapes',
      'Turn On The Bright Lights',
    ])
  })

  it('keeps input order for recently-added even after filtering', () => {
    const result = getDisplayedAlbums(catalogue, 'recently-added', 'Rock', 'all')

    expect(titlesOf(result)).toEqual([
      'Zenith',
      'Mirage',
      'Amnesiac',
      'Kid A',
      'Basement Tapes',
      'Turn On The Bright Lights',
    ])
  })
})

describe('getDisplayedAlbums genre filter', () => {
  const genreCatalogue: readonly LibraryAlbum[] = [
    album('g1', 'Rock One', 'Rock Band', 2005, 'Rock'),
    album('g2', 'Pop Two', 'Pop Duo', 2005, 'Pop'),
    album('g3', 'No Genre', 'Mystery', 2005, null),
    album('g4', 'Pop One', 'Pop Trio', 2005, 'Pop'),
  ]

  it('keeps only exact genre matches', () => {
    const result = getDisplayedAlbums(genreCatalogue, 'title-az', 'Pop', 'all')

    expect(titlesOf(result)).toEqual(['Pop One', 'Pop Two'])
  })

  it('drops albums without a genre when a genre filter is set', () => {
    const result = getDisplayedAlbums(genreCatalogue, 'title-az', 'Rock', 'all')

    expect(titlesOf(result)).toEqual(['Rock One'])
  })

  it('keeps albums without a genre when no genre filter is set', () => {
    const result = getDisplayedAlbums(genreCatalogue, 'title-az', null, 'all')

    expect(titlesOf(result)).toEqual(['No Genre', 'Pop One', 'Pop Two', 'Rock One'])
  })

  it('treats an empty genre filter as no filter', () => {
    const result = getDisplayedAlbums(genreCatalogue, 'title-az', '', 'all')

    expect(titlesOf(result)).toEqual(['No Genre', 'Pop One', 'Pop Two', 'Rock One'])
  })

  it('returns nothing for a genre no album carries', () => {
    const result = getDisplayedAlbums(genreCatalogue, 'title-az', 'Jazz', 'all')

    expect(titlesOf(result)).toEqual([])
  })
})

describe('getDisplayedAlbums decade filter', () => {
  it('includes 2020 and everything above it for 2020s', () => {
    const result = getDisplayedAlbums(decadeCatalogue, 'artist-az', null, '2020s')

    expect(sortedTitlesOf(result)).toEqual(['Y2020', 'Y2024'])
  })

  it('includes 2010 but excludes 2020 for 2010s', () => {
    const result = getDisplayedAlbums(decadeCatalogue, 'artist-az', null, '2010s')

    expect(sortedTitlesOf(result)).toEqual(['Y2010', 'Y2019'])
  })

  it('includes 2000 but excludes 2010 for 2000s', () => {
    const result = getDisplayedAlbums(decadeCatalogue, 'artist-az', null, '2000s')

    expect(sortedTitlesOf(result)).toEqual(['Y2000', 'Y2009'])
  })

  it('includes 1990 but excludes 2000 for 1990s', () => {
    const result = getDisplayedAlbums(decadeCatalogue, 'artist-az', null, '1990s')

    expect(sortedTitlesOf(result)).toEqual(['Y1990', 'Y1999'])
  })

  it('includes 1989 but excludes 1990 for older', () => {
    const result = getDisplayedAlbums(decadeCatalogue, 'artist-az', null, 'older')

    expect(sortedTitlesOf(result)).toEqual(['Y1989'])
  })

  it('keeps albums without a year for all', () => {
    const result = getDisplayedAlbums(decadeCatalogue, 'artist-az', null, 'all')

    expect(titlesOf(result)).toContain('Ynull')
    expect(result).toHaveLength(decadeCatalogue.length)
  })
})

describe('getDisplayedAlbums combined filtering and sorting', () => {
  it('applies genre, decade and sort together', () => {
    const result = getDisplayedAlbums(catalogue, 'artist-az', 'Rock', '2000s')

    expect(titlesOf(result)).toEqual(['Turn On The Bright Lights', 'Amnesiac', 'Kid A'])
    expect(artistsOf(result)).toEqual(['Interpol', 'Radiohead', 'Radiohead'])
  })

  it('excludes an album that matches the decade but not the genre', () => {
    const result = getDisplayedAlbums(catalogue, 'year-newest', 'Rock', '2000s')

    expect(titlesOf(result)).not.toContain('Discovery')
    expect(titlesOf(result)).toEqual(['Turn On The Bright Lights', 'Amnesiac', 'Kid A'])
  })

  it('returns an empty list for an empty input', () => {
    const result = getDisplayedAlbums([], 'artist-az', 'Rock', '2010s')

    expect(result).toEqual([])
  })

  it('returns an empty list when genre and decade have no overlap', () => {
    const result = getDisplayedAlbums(catalogue, 'artist-az', 'Punk', '2020s')

    expect(result).toEqual([])
  })
})

describe('getDisplayedAlbums immutability', () => {
  it.each<SortOption>(['artist-az', 'title-az', 'year-newest'])(
    'sorts into a new array and leaves the input untouched for %s',
    (sortBy) => {
      const input = Object.freeze([...catalogue])

      const result = getDisplayedAlbums(input, sortBy, null, 'all')

      expect(titlesOf(input)).toEqual(titlesOf(catalogue))
      expect(result).not.toBe(input)
    },
  )

  // Unsorted and unfiltered, the input array is handed straight back instead of being copied.
  it('returns the very same instance for unfiltered recently-added', () => {
    const input = Object.freeze([...catalogue])

    expect(getDisplayedAlbums(input, 'recently-added', null, 'all')).toBe(input)
  })
})

describe('getAvailableGenres', () => {
  it('deduplicates, sorts alphabetically and drops missing genres', () => {
    const albums: readonly LibraryAlbum[] = [
      album('1', 'A', 'A', 2000, 'Rock'),
      album('2', 'B', 'B', 2000, null),
      album('3', 'C', 'C', 2000, 'Ambient'),
      album('4', 'D', 'D', 2000, 'Rock'),
      album('5', 'E', 'E', 2000, 'Jazz'),
      album('6', 'F', 'F', 2000, null),
      album('7', 'G', 'G', 2000, 'Ambient'),
    ]

    expect(getAvailableGenres(albums)).toEqual(['Ambient', 'Jazz', 'Rock'])
  })

  it('returns an empty list when no album carries a genre', () => {
    const albums: readonly LibraryAlbum[] = [
      album('1', 'A', 'A', 2000, null),
      album('2', 'B', 'B', 2000, null),
    ]

    expect(getAvailableGenres(albums)).toEqual([])
  })

  it('returns an empty list for an empty input', () => {
    expect(getAvailableGenres([])).toEqual([])
  })
})

describe('parseStoredSort', () => {
  it.each<SortOption>(['artist-az', 'title-az', 'year-newest', 'recently-added'])(
    'passes through the stored value %s',
    (stored) => {
      expect(parseStoredSort(stored)).toBe(stored)
    },
  )

  it('falls back to artist-az for a missing value', () => {
    expect(parseStoredSort(null)).toBe('artist-az')
  })

  it('falls back to artist-az for an unknown value', () => {
    expect(parseStoredSort('year-oldest')).toBe('artist-az')
  })
})

describe('parseStoredDecade', () => {
  it.each<DecadeFilter>(['all', '2020s', '2010s', '2000s', '1990s', 'older'])(
    'passes through the stored value %s',
    (stored) => {
      expect(parseStoredDecade(stored)).toBe(stored)
    },
  )

  it('falls back to all for a missing value', () => {
    expect(parseStoredDecade(null)).toBe('all')
  })

  it('falls back to all for an unknown value', () => {
    expect(parseStoredDecade('1980s')).toBe('all')
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
        genre: null,
      },
      {
        id: 't2',
        title: 'In Rainbows',
        artist: 'Radiohead',
        coverArtUrl: 'https://covers.test/t2.jpg',
        releaseYear: null,
        genre: null,
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
})
