export type SimilarArtist = {
  readonly name: string
  readonly mbid?: string
  readonly match: number
  readonly url: string
}

export type ArtistEnrichment = {
  readonly name: string
  readonly mbid?: string
  readonly listeners: number
  readonly playcount: number
  readonly tags: readonly string[]
  readonly bio: string
}

export type AlbumEnrichment = {
  readonly name: string
  readonly mbid?: string
  readonly listeners: number
  readonly playcount: number
  readonly tags: readonly string[]
  readonly wiki: string
}

import type { BaseApiError, NotFoundError } from '@/domains/shared/core/api-errors'

export type EnrichmentApiError = BaseApiError | NotFoundError

export type EnrichmentErrorState =
  | { readonly kind: 'none' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' }

export type HeroImageApiError = BaseApiError | NotFoundError

export type TidalArtistAlbum = {
  readonly id: string
  readonly title: string
  readonly coverArtUrl: string
}

export type TidalArtistAlbumsResponse = {
  readonly artistId: string
  readonly albums: ReadonlyArray<TidalArtistAlbum>
  readonly totalCount: number
}

export type TidalSearchArtist = {
  readonly artistId: string
  readonly name: string
  readonly coverArtUrl: string
}

export type TidalArtistSearchResponse = {
  readonly artists: ReadonlyArray<TidalSearchArtist>
  readonly totalCount: number
}

export type TidalArtistsApiError = BaseApiError

export type TidalAlbum = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly coverArtUrl: string
}

export type TidalAlbumsResponse = {
  readonly albums: ReadonlyArray<TidalAlbum>
  readonly totalCount: number
}

export type TidalTrack = {
  readonly id: string
  readonly trackNumber: number
  readonly title: string
  readonly url: string
  readonly duration: number
}

export type TidalAlbumTracksResponse = {
  readonly tracks: ReadonlyArray<TidalTrack>
  readonly totalCount: number
}

export type TidalAlbumResolveResponse = {
  readonly albumId: string | null
}

export type TidalAlbumsApiError = BaseApiError
