export type AlbumTrack = {
  readonly id: string
  readonly trackNumber: number
  readonly title: string
  readonly artist: string
  readonly duration: number
  readonly url: string
  readonly audioQuality?: {
    readonly format: 'FLAC' | 'AAC' | 'MP3' | 'ALAC' | 'OGG'
    readonly bitrate: number
    readonly sampleRate: number
    readonly bitDepth?: number
    readonly lossless: boolean
  }
}

export type AlbumDetailResponse = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: number | null
  readonly coverArtUrl: string | null
  readonly tracks: ReadonlyArray<AlbumTrack>
}

import type { BaseApiError, NotFoundError } from '@/domains/shared/core/api-errors'

export type AlbumApiError = BaseApiError | NotFoundError

export type AlbumDetailStatus = 'loading' | 'success' | 'error-not-found' | 'error-server'
