export type ArtistAlbum = {
  readonly id: string
  readonly title: string
  readonly releaseYear: number | null
  readonly coverArtUrl: string
}

export type ArtistAlbumSortOption = 'year' | 'popularity' | 'title'

export type ArtistAlbumPopularity = {
  readonly title: string
  readonly artist: string
  readonly playcount: number
  readonly rank: number
}

export type ArtistTopTrack = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly url: string
  readonly source: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly playcount: number
  readonly listeners: number
  readonly rank: number
  readonly coverArtUrl?: string
}

export type ArtistTopTracksResponse = {
  readonly artist: string
  readonly tracks: ReadonlyArray<ArtistTopTrack>
}

export type ArtistTopAlbumsResponse = {
  readonly artist: string
  readonly albums: ReadonlyArray<ArtistAlbumPopularity>
}

export type ArtistDetailResponse = {
  readonly id: string
  readonly name: string
  readonly albums: ReadonlyArray<ArtistAlbum>
}

import type { BaseApiError, NotFoundError } from '@/domains/shared/core/api-errors'

export type ArtistApiError = BaseApiError | NotFoundError

export type ArtistByNameAlbum = {
  readonly id: string
  readonly albumId?: string
  readonly title: string
  readonly artist: string
  readonly source?: string
  readonly trackUrls?: ReadonlyArray<string>
  readonly coverArtUrl?: string
}

export type ArtistByNameResponse = {
  readonly localAlbums: ReadonlyArray<ArtistByNameAlbum>
  readonly tidalAlbums: ReadonlyArray<ArtistByNameAlbum>
}

export type UnifiedArtistStatus = 'loading' | 'success' | 'error'

export type SimilarArtistMatch = {
  readonly name: string
  readonly match: number
  readonly inLibrary: boolean
}
