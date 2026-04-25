import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { mapApiThrownError } from '@/platform/api/apiHelpers'
import { mapEnrichmentError, stripHtml } from '@/domains/enrichment/core/service'
import type {
  AlbumEnrichment,
  ArtistEnrichment,
  EnrichmentApiError,
  EnrichmentErrorState,
  SimilarArtist,
} from '@/domains/enrichment/core/types'

const SimilarArtistSchema = z.object({
  name: z.string(),
  mbid: z.string().optional(),
  match: z.number(),
  url: z.string(),
})

const ArtistEnrichmentSchema = z.object({
  name: z.string(),
  mbid: z.string().optional(),
  listeners: z.number(),
  playcount: z.number(),
  tags: z.array(z.string()),
  bio: z.string(),
})

const AlbumEnrichmentSchema = z.object({
  name: z.string(),
  mbid: z.string().optional(),
  listeners: z.number(),
  playcount: z.number(),
  tags: z.array(z.string()),
  wiki: z.string(),
})

export type {
  AlbumEnrichment,
  ArtistEnrichment,
  EnrichmentApiError,
  EnrichmentErrorState,
  SimilarArtist,
}
export { mapEnrichmentError }

const mapEnrichmentParseError = (message: string): EnrichmentApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapEnrichmentThrownError = (error: unknown): EnrichmentApiError => mapApiThrownError(error)

const mapEnrichmentHttpError =
  (fallbackMessage: string) =>
  (response: Response): EnrichmentApiError => {
    const message = `${fallbackMessage}: HTTP ${response.status}`
    return response.status === 404
      ? { type: 'NOT_FOUND', message }
      : { type: 'SERVER_ERROR', status: response.status, message }
  }

export const getArtistEnrichment = async (
  name: string,
): Promise<Result<ArtistEnrichment, EnrichmentApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/enrichment/artist?name=${encodeURIComponent(name)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: ArtistEnrichmentSchema,
      mapHttpError: mapEnrichmentHttpError('Enrichment fetch failed'),
      mapThrownError: mapEnrichmentThrownError,
      mapParseError: mapEnrichmentParseError,
      mapValue: (value: ArtistEnrichment) => ({ ...value, bio: stripHtml(value.bio) }),
    },
  )
}

export const getAlbumEnrichment = async (
  artist: string,
  album: string,
): Promise<Result<AlbumEnrichment, EnrichmentApiError>> => {
  return await fetchJsonResult(
    getApiUrl(
      `/api/enrichment/album?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`,
    ),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: AlbumEnrichmentSchema,
      mapHttpError: mapEnrichmentHttpError('Enrichment fetch failed'),
      mapThrownError: mapEnrichmentThrownError,
      mapParseError: mapEnrichmentParseError,
      mapValue: (value: AlbumEnrichment) => ({ ...value, wiki: stripHtml(value.wiki) }),
    },
  )
}

export const getSimilarArtists = async (
  name: string,
): Promise<Result<ReadonlyArray<SimilarArtist>, EnrichmentApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/enrichment/artist/similar?name=${encodeURIComponent(name)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: z.array(SimilarArtistSchema),
      mapHttpError: mapEnrichmentHttpError('Similar artists fetch failed'),
      mapThrownError: mapEnrichmentThrownError,
      mapParseError: mapEnrichmentParseError,
    },
  )
}
