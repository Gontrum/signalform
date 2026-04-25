import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import type {
  TidalAlbum,
  TidalAlbumResolveResponse,
  TidalAlbumTracksResponse,
  TidalAlbumsApiError,
  TidalAlbumsResponse,
  TidalTrack,
} from '@/domains/enrichment/core/types'

const TidalAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  coverArtUrl: z.string(),
})

const TidalAlbumsResponseSchema = z.object({
  albums: z.array(TidalAlbumSchema),
  totalCount: z.number(),
})

const TidalTrackSchema = z.object({
  id: z.string(),
  trackNumber: z.number(),
  title: z.string(),
  url: z.string(),
  duration: z.number(),
})

const TidalAlbumTracksResponseSchema = z.object({
  tracks: z.array(TidalTrackSchema),
  totalCount: z.number(),
})

const ResolveResponseSchema = z.object({ albumId: z.string().nullable() })

export type {
  TidalAlbum,
  TidalAlbumResolveResponse,
  TidalAlbumTracksResponse,
  TidalAlbumsApiError,
  TidalAlbumsResponse,
  TidalTrack,
}

const mapTidalAlbumsParseError = (message: string): TidalAlbumsApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapTidalAlbumsThrownError = (error: unknown): TidalAlbumsApiError => mapApiThrownError(error)

const mapTidalAlbumsHttpError =
  (fallbackMessage: string) =>
  async (response: Response): Promise<TidalAlbumsApiError> => {
    const message =
      (await parseErrorBody(response)) ?? `${fallbackMessage}: HTTP ${response.status}`
    return { type: 'SERVER_ERROR', status: response.status, message }
  }

export const resolveAlbum = async (
  title: string,
  artist: string,
): Promise<Result<TidalAlbumResolveResponse, TidalAlbumsApiError>> => {
  return await fetchJsonResult(
    getApiUrl(
      `/api/tidal/albums/resolve?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
    ),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: ResolveResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal album resolve failed'),
      mapThrownError: mapTidalAlbumsThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalAlbumTracks = async (
  albumId: string,
): Promise<Result<TidalAlbumTracksResponse, TidalAlbumsApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/albums/${encodeURIComponent(albumId)}/tracks`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: TidalAlbumTracksResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal album tracks fetch failed'),
      mapThrownError: mapTidalAlbumsThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalFeaturedAlbums = async (
  limit = 50,
  offset = 0,
): Promise<Result<TidalAlbumsResponse, TidalAlbumsApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/featured-albums?limit=${limit}&offset=${offset}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: TidalAlbumsResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal featured albums fetch failed'),
      mapThrownError: mapTidalAlbumsThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalAlbums = async (
  limit = 250,
  offset = 0,
): Promise<Result<TidalAlbumsResponse, TidalAlbumsApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/albums?limit=${limit}&offset=${offset}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: TidalAlbumsResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal albums fetch failed'),
      mapThrownError: mapTidalAlbumsThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}
