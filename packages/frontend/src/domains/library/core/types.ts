export type LoadingStatus = 'loading' | 'success' | 'error'
export type Source = 'local' | 'tidal'
export type ViewMode = 'grid' | 'list'
export type SortOption = 'artist-az' | 'title-az' | 'year-newest' | 'recently-added'
export type DecadeFilter = 'all' | '2020s' | '2010s' | '2000s' | '1990s' | 'older'

export type LibraryAlbum = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: number | null
  readonly coverArtUrl: string
  readonly genre: string | null
}

export type LibraryAlbumsResponse = {
  readonly albums: ReadonlyArray<LibraryAlbum>
  readonly totalCount: number
}

export type RescanStatus = {
  readonly scanning: boolean
  readonly step: string
  readonly info: string
  readonly totalTime: string
}

export type TidalAlbumForDisplay = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly coverArtUrl: string
}
