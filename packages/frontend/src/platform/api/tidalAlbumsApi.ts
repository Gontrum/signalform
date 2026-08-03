import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import type {
  TidalAlbum,
  TidalAlbumDetailResponse,
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

const TidalAlbumDetailResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  coverArtUrl: z.string(),
  tracks: z.array(TidalTrackSchema),
  totalCount: z.number(),
})

export type {
  TidalAlbum,
  TidalAlbumDetailResponse,
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

type TimeoutRequest = {
  readonly signal: AbortSignal
  readonly mapThrownError: (error: unknown) => TidalAlbumsApiError
}

// Deadline and reported figure are derived from the same number: the album
// detail call ran on a 10s deadline while still reporting "(5s)" because the
// wording lived in an unrelated default.
const timeoutRequest = (ms: number): TimeoutRequest => ({
  signal: AbortSignal.timeout(ms),
  mapThrownError: (error: unknown): TidalAlbumsApiError =>
    mapApiThrownError(error, { timeout: `Request timed out (${ms / 1000}s)` }),
})

const mapTidalAlbumsHttpError =
  (fallbackMessage: string) =>
  async (response: Response): Promise<TidalAlbumsApiError> => {
    const message =
      (await parseErrorBody(response)) ?? `${fallbackMessage}: HTTP ${response.status}`
    return response.status === 404
      ? { type: 'NOT_FOUND', message }
      : { type: 'SERVER_ERROR', status: response.status, message }
  }

export const resolveAlbum = async (
  title: string,
  artist: string,
): Promise<Result<TidalAlbumResolveResponse, TidalAlbumsApiError>> => {
  const request = timeoutRequest(5000)
  return await fetchJsonResult(
    getApiUrl(
      `/api/tidal/albums/resolve?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
    ),
    {
      method: 'GET',
      signal: request.signal,
    },
    {
      schema: ResolveResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal album resolve failed'),
      mapThrownError: request.mapThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalAlbumDetail = async (
  albumId: string,
): Promise<Result<TidalAlbumDetailResponse, TidalAlbumsApiError>> => {
  // Two LMS round-trips behind one request (parent item plus the full track
  // list), so this one keeps a longer deadline than its siblings.
  const request = timeoutRequest(10000)
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/albums/${encodeURIComponent(albumId)}`),
    {
      method: 'GET',
      signal: request.signal,
    },
    {
      schema: TidalAlbumDetailResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal album detail fetch failed'),
      mapThrownError: request.mapThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalAlbumTracks = async (
  albumId: string,
): Promise<Result<TidalAlbumTracksResponse, TidalAlbumsApiError>> => {
  const request = timeoutRequest(5000)
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/albums/${encodeURIComponent(albumId)}/tracks`),
    {
      method: 'GET',
      signal: request.signal,
    },
    {
      schema: TidalAlbumTracksResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal album tracks fetch failed'),
      mapThrownError: request.mapThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalFeaturedAlbums = async (
  limit = 50,
  offset = 0,
): Promise<Result<TidalAlbumsResponse, TidalAlbumsApiError>> => {
  const request = timeoutRequest(5000)
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/featured-albums?limit=${limit}&offset=${offset}`),
    {
      method: 'GET',
      signal: request.signal,
    },
    {
      schema: TidalAlbumsResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal featured albums fetch failed'),
      mapThrownError: request.mapThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}

export const getTidalAlbums = async (
  limit = 250,
  offset = 0,
): Promise<Result<TidalAlbumsResponse, TidalAlbumsApiError>> => {
  const request = timeoutRequest(5000)
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/albums?limit=${limit}&offset=${offset}`),
    {
      method: 'GET',
      signal: request.signal,
    },
    {
      schema: TidalAlbumsResponseSchema,
      mapHttpError: mapTidalAlbumsHttpError('Tidal albums fetch failed'),
      mapThrownError: request.mapThrownError,
      mapParseError: mapTidalAlbumsParseError,
    },
  )
}
