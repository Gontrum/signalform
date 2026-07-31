import type { DecadeFilter, SortOption } from '@signalform/shared'

export type { DecadeFilter, SortOption }

export type LoadingStatus = 'loading' | 'success' | 'error'
export type Source = 'local' | 'tidal'
export type ViewMode = 'grid' | 'list'

export type LibraryAlbum = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: number | null
  readonly coverArtUrl: string
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

export type FilterField = 'sort' | 'decade'

export type ReconciledFilters = {
  readonly sort: SortOption
  readonly decade: DecadeFilter
  // Names the field that had to give way, so the UI can say why a control moved.
  readonly adjusted?: FilterField
}

export type GenreSplit<Genre> = {
  readonly chips: readonly Genre[]
  readonly rest: readonly Genre[]
}
