import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import type {
  ArtistAlbum,
  ArtistApiError,
  ArtistByNameAlbum,
  ArtistByNameResponse,
  ArtistDetailResponse,
} from '@/domains/artist/core/types'

const ArtistAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string(),
})

const ArtistDetailResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  albums: z.array(ArtistAlbumSchema),
})

const ArtistByNameAlbumSchema = z.object({
  id: z.string(),
  albumId: z.string().optional(),
  title: z.string(),
  artist: z.string(),
  source: z.string().optional(),
  trackUrls: z.array(z.string()).optional(),
  coverArtUrl: z.string().optional(),
})

const ArtistByNameResponseSchema = z.object({
  localAlbums: z.array(ArtistByNameAlbumSchema),
  tidalAlbums: z.array(ArtistByNameAlbumSchema),
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

export const getArtistDetail = async (
  artistId: string,
): Promise<Result<ArtistDetailResponse, ArtistApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/artist/${encodeURIComponent(artistId)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: ArtistDetailResponseSchema,
      mapHttpError: async (response) => {
        const message =
          (await parseErrorBody(response)) ?? `Artist fetch failed: HTTP ${response.status}`

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
  ArtistByNameAlbum,
  ArtistByNameResponse,
  ArtistDetailResponse,
}
