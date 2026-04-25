import type { AudioQuality } from '@signalform/shared'

import type { BaseApiError } from '@/domains/shared/core/api-errors'

export type SearchApiError = BaseApiError

export type SearchError = {
  readonly message: string
  readonly code: string
}

export type SearchResult = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly duration?: number
  readonly source: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly url: string
}

export type SearchResponse = {
  readonly results: readonly SearchResult[]
  readonly query: string
  readonly totalCount: number
}

export type AvailableSource = {
  readonly source: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly url: string
}

export type AutocompleteSuggestion = {
  readonly id: string
  readonly type: 'artist' | 'album'
  readonly artist: string
  readonly album?: string
  readonly albumCover?: string
  readonly quality?: AudioQuality
  readonly artistId?: string
  readonly albumId?: string
}

export type AutocompleteResponse = {
  readonly suggestions: readonly AutocompleteSuggestion[]
  readonly query: string
}

export type TrackResult = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly duration?: number
  readonly url: string
  readonly source: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly availableSources?: readonly AvailableSource[]
  readonly artistId?: string
  readonly audioQuality?: AudioQuality
}

export type AlbumResult = {
  readonly id: string
  readonly albumId?: string
  readonly artistId?: string | null
  readonly source?: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly title: string
  readonly artist: string
  readonly trackCount: number
  readonly trackUrls?: ReadonlyArray<string>
  readonly trackTitles?: ReadonlyArray<string>
  readonly coverArtUrl?: string
}

export type ArtistResult = {
  readonly name: string
  readonly artistId: string | null
  readonly coverArtUrl?: string
}

export type SearchResultsResponse = {
  readonly tracks: readonly TrackResult[]
  readonly albums: readonly AlbumResult[]
  readonly artists: readonly ArtistResult[]
  readonly query: string
  readonly totalResults: number
}

export type { AudioQuality }
