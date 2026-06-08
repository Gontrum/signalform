import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import { proxyCoverArtUrl } from '@/platform/api/coverArtProxy'
import type {
  ArtistAlbum,
  ArtistApiError,
  ArtistTopAlbumsResponse,
  ArtistTopTracksResponse,
  ArtistByNameAlbum,
  ArtistByNameResponse,
} from '@/domains/artist/core/types'

const ArtistByNameAlbumSchema = z.object({
  id: z.string(),
  albumId: z.string().optional(),
  title: z.string(),
  artist: z.string(),
  source: z.string().optional(),
  trackUrls: z.array(z.string()).optional(),
  trackTitles: z.array(z.string()).optional(),
  coverArtUrl: z.string().optional(),
})

const ArtistByNameResponseSchema = z.object({
  localAlbums: z.array(ArtistByNameAlbumSchema),
  tidalAlbums: z.array(ArtistByNameAlbumSchema),
})

const ArtistTopTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  url: z.string(),
  source: z.enum(['local', 'qobuz', 'tidal', 'unknown']),
  playcount: z.number(),
  listeners: z.number(),
  rank: z.number(),
  coverArtUrl: z.string().optional(),
})

const ArtistTopTracksResponseSchema = z.object({
  artist: z.string(),
  tracks: z.array(ArtistTopTrackSchema),
})

const ArtistAlbumPopularitySchema = z.object({
  title: z.string(),
  artist: z.string(),
  playcount: z.number(),
  rank: z.number(),
})

const ArtistTopAlbumsResponseSchema = z.object({
  artist: z.string(),
  albums: z.array(ArtistAlbumPopularitySchema),
})

const mapArtistParseError = (message: string): ArtistApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapArtistThrownError = (error: unknown): ArtistApiError => mapApiThrownError(error)

export const getArtistByName = async (
  name: string,
): Promise<Result<ArtistByNameResponse, ArtistApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/artist/by-name?name=${encodeURIComponent(name)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: ArtistByNameResponseSchema,
      mapValue: (value: ArtistByNameResponse): ArtistByNameResponse => ({
        ...value,
        localAlbums: value.localAlbums.map((album) => ({
          ...album,
          coverArtUrl: proxyCoverArtUrl(album.coverArtUrl),
        })),
        tidalAlbums: value.tidalAlbums.map((album) => ({
          ...album,
          coverArtUrl: proxyCoverArtUrl(album.coverArtUrl),
        })),
      }),
      mapHttpError: async (response) => {
        const message =
          (await parseErrorBody(response)) ?? `Artist by-name fetch failed: HTTP ${response.status}`
        return { type: 'SERVER_ERROR', status: response.status, message }
      },
      mapThrownError: mapArtistThrownError,
      mapParseError: mapArtistParseError,
    },
  )
}

export const getArtistTopTracks = async (
  name: string,
): Promise<Result<ArtistTopTracksResponse, ArtistApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/artist/top-tracks?name=${encodeURIComponent(name)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    },
    {
      schema: ArtistTopTracksResponseSchema,
      mapValue: (value: ArtistTopTracksResponse): ArtistTopTracksResponse => ({
        ...value,
        tracks: value.tracks.map((track) => ({
          ...track,
          coverArtUrl: proxyCoverArtUrl(track.coverArtUrl),
        })),
      }),
      mapHttpError: async (response) => {
        const message =
          (await parseErrorBody(response)) ??
          `Artist top tracks fetch failed: HTTP ${response.status}`

        return response.status === 404
          ? { type: 'NOT_FOUND', message }
          : { type: 'SERVER_ERROR', status: response.status, message }
      },
      mapThrownError: mapArtistThrownError,
      mapParseError: mapArtistParseError,
    },
  )
}

export const getArtistTopAlbums = async (
  name: string,
): Promise<Result<ArtistTopAlbumsResponse, ArtistApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/artist/top-albums?name=${encodeURIComponent(name)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: ArtistTopAlbumsResponseSchema,
      mapHttpError: async (response) => {
        const message =
          (await parseErrorBody(response)) ??
          `Artist top albums fetch failed: HTTP ${response.status}`

        return response.status === 404
          ? { type: 'NOT_FOUND', message }
          : { type: 'SERVER_ERROR', status: response.status, message }
      },
      mapThrownError: mapArtistThrownError,
      mapParseError: mapArtistParseError,
    },
  )
}

export type {
  ArtistAlbum,
  ArtistApiError,
  ArtistTopAlbumsResponse,
  ArtistTopTracksResponse,
  ArtistByNameAlbum,
  ArtistByNameResponse,
}
