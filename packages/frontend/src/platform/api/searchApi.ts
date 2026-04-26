import { z } from 'zod'
import type { Result, AudioQuality } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { AudioQualitySchema } from '@/platform/api/commonSchemas'
import { proxyCoverArtUrl } from '@/platform/api/coverArtProxy'
import type {
  AlbumResult,
  ArtistResult,
  AutocompleteResponse,
  AutocompleteSuggestion,
  AvailableSource,
  SearchApiError,
  SearchError,
  SearchResponse,
  SearchResult,
  SearchResultsResponse,
  TrackResult,
} from '@/domains/search/core/types'

const SearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number().optional(),
  source: z.enum(['local', 'qobuz', 'tidal', 'unknown']),
  url: z.string(),
})

const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  query: z.string(),
  totalCount: z.number(),
})

const AutocompleteSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum(['artist', 'album']),
  artist: z.string(),
  album: z.string().optional(),
  albumCover: z.string().optional(),
  quality: AudioQualitySchema.optional(),
  artistId: z.string().optional(),
  albumId: z.string().optional(),
})

const AutocompleteResponseSchema = z.object({
  suggestions: z.array(AutocompleteSuggestionSchema),
  query: z.string(),
})

const AvailableSourceSchema = z.object({
  source: z.enum(['local', 'qobuz', 'tidal', 'unknown']),
  url: z.string(),
})

const TrackResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number().optional(),
  url: z.string(),
  source: z.enum(['local', 'qobuz', 'tidal', 'unknown']),
  availableSources: z.array(AvailableSourceSchema).optional(),
  artistId: z.string().optional(),
  audioQuality: AudioQualitySchema.optional(),
})

const AlbumResultSchema = z.object({
  id: z.string(),
  albumId: z.string().optional(),
  artistId: z.string().nullable().optional(),
  source: z.enum(['local', 'qobuz', 'tidal', 'unknown']).optional(),
  title: z.string(),
  artist: z.string(),
  trackCount: z.number(),
  trackUrls: z.array(z.string()).optional(),
  trackTitles: z.array(z.string()).optional(),
  coverArtUrl: z.string().optional(),
})

const ArtistResultSchema = z.object({
  name: z.string(),
  artistId: z.string().nullable(),
  coverArtUrl: z.string().optional(),
})

const SearchResultsResponseSchema = z.object({
  tracks: z.array(TrackResultSchema),
  albums: z.array(AlbumResultSchema),
  artists: z.array(ArtistResultSchema),
  query: z.string(),
  totalResults: z.number(),
})

const SearchErrorSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
})

export type { AudioQuality }

const mapSearchParseError = (message: string): SearchApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapSearchThrownError = (error: unknown): SearchApiError => {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return {
      type: 'TIMEOUT_ERROR',
      message: 'Request timed out - music server may be slow',
    }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'ABORT_ERROR',
      message: 'Request was cancelled',
    }
  }

  return {
    type: 'NETWORK_ERROR',
    message: error instanceof Error ? error.message : 'Network request failed',
  }
}

const mapSearchHttpError =
  (fallbackMessage: string) =>
  async (response: Response): Promise<SearchApiError> => {
    const errorBody = SearchErrorSchema.safeParse(await response.json().catch(() => null))
    const errorMessage =
      (errorBody.success ? errorBody.data?.message : undefined) ??
      `${fallbackMessage}: ${response.status}`

    return {
      type: 'SERVER_ERROR',
      status: response.status,
      message: errorMessage,
    }
  }

export const searchTracks = async (
  query: string,
): Promise<Result<SearchResponse, SearchApiError>> => {
  return await fetchJsonResult(
    getApiUrl('/api/search'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: SearchResponseSchema,
      mapHttpError: mapSearchHttpError('Search failed'),
      mapThrownError: mapSearchThrownError,
      mapParseError: mapSearchParseError,
    },
  )
}

export const fetchAutocomplete = async (
  query: string,
  options?: { readonly signal?: AbortSignal },
): Promise<Result<AutocompleteResponse, SearchApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/search/autocomplete?q=${encodeURIComponent(query)}`),
    {
      method: 'GET',
      signal: options?.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    },
    {
      schema: AutocompleteResponseSchema,
      mapValue: (value: AutocompleteResponse): AutocompleteResponse => ({
        ...value,
        suggestions: value.suggestions.map((suggestion) => ({
          ...suggestion,
          albumCover: proxyCoverArtUrl(suggestion.albumCover),
        })),
      }),
      mapHttpError: mapSearchHttpError('Autocomplete failed'),
      mapThrownError: mapSearchThrownError,
      mapParseError: mapSearchParseError,
    },
  )
}

export const fetchFullResults = async (
  query: string,
): Promise<Result<SearchResultsResponse, SearchApiError>> => {
  return await fetchJsonResult(
    getApiUrl('/api/search'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, full: true }),
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: SearchResultsResponseSchema,
      mapValue: (value: SearchResultsResponse): SearchResultsResponse => ({
        ...value,
        albums: value.albums.map((album) => ({
          ...album,
          coverArtUrl: proxyCoverArtUrl(album.coverArtUrl),
        })),
        artists: value.artists.map((artist) => ({
          ...artist,
          coverArtUrl: proxyCoverArtUrl(artist.coverArtUrl),
        })),
      }),
      mapHttpError: mapSearchHttpError('Search failed'),
      mapThrownError: mapSearchThrownError,
      mapParseError: mapSearchParseError,
    },
  )
}

export type {
  AlbumResult,
  ArtistResult,
  AutocompleteResponse,
  AutocompleteSuggestion,
  AvailableSource,
  SearchApiError,
  SearchError,
  SearchResponse,
  SearchResult,
  SearchResultsResponse,
  TrackResult,
}
