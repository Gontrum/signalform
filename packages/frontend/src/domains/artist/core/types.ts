export type ArtistAlbum = {
  readonly id: string
  readonly title: string
  readonly releaseYear: number | null
  readonly coverArtUrl: string
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

export type ArtistDetailStatus = 'loading' | 'success' | 'error-not-found' | 'error-server'

export type UnifiedArtistStatus = 'loading' | 'success' | 'error'

export type SimilarArtistMatch = {
  readonly name: string
  readonly match: number
  readonly inLibrary: boolean
}
