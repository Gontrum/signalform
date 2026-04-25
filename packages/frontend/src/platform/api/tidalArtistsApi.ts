import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import type {
  TidalArtistAlbum,
  TidalArtistAlbumsResponse,
  TidalArtistSearchResponse,
  TidalArtistsApiError,
  TidalSearchArtist,
} from '@/domains/enrichment/core/types'

const TidalArtistAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverArtUrl: z.string(),
})

const TidalArtistAlbumsResponseSchema = z.object({
  artistId: z.string(),
  albums: z.array(TidalArtistAlbumSchema),
  totalCount: z.number(),
})

const TidalSearchArtistSchema = z.object({
  artistId: z.string(),
  name: z.string(),
  coverArtUrl: z.string(),
})

const TidalArtistSearchResponseSchema = z.object({
  artists: z.array(TidalSearchArtistSchema),
  totalCount: z.number(),
})

export type {
  TidalArtistAlbum,
  TidalArtistAlbumsResponse,
  TidalArtistSearchResponse,
  TidalArtistsApiError,
  TidalSearchArtist,
}

const mapTidalArtistsParseError = (message: string): TidalArtistsApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapTidalArtistsThrownError = (error: unknown): TidalArtistsApiError =>
  mapApiThrownError(error)

const mapTidalArtistsHttpError =
  (fallbackMessage: string) =>
  async (response: Response): Promise<TidalArtistsApiError> => {
    const message =
      (await parseErrorBody(response)) ?? `${fallbackMessage}: HTTP ${response.status}`
    return { type: 'SERVER_ERROR', status: response.status, message }
  }

export const searchTidalArtists = async (
  query: string,
): Promise<Result<TidalArtistSearchResponse, TidalArtistsApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/artists/search?q=${encodeURIComponent(query)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: TidalArtistSearchResponseSchema,
      mapHttpError: mapTidalArtistsHttpError('Tidal artist search failed'),
      mapThrownError: mapTidalArtistsThrownError,
      mapParseError: mapTidalArtistsParseError,
    },
  )
}

export const getTidalArtistAlbums = async (
  artistId: string,
): Promise<Result<TidalArtistAlbumsResponse, TidalArtistsApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/tidal/artists/${encodeURIComponent(artistId)}/albums`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: TidalArtistAlbumsResponseSchema,
      mapHttpError: mapTidalArtistsHttpError('Tidal artist albums fetch failed'),
      mapThrownError: mapTidalArtistsThrownError,
      mapParseError: mapTidalArtistsParseError,
    },
  )
}
