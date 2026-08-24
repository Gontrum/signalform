import { z } from 'zod'
import type { DecadeFilter, Result, SortOption } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult, fetchVoidResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import { proxyCoverArtUrl } from '@/platform/api/coverArtProxy'
import type { LibraryAlbumsResponse, RescanStatus } from '@/domains/library/core/types'

export type {
  LibraryAlbum,
  LibraryAlbumsResponse,
  RescanStatus,
} from '@/domains/library/core/types'

/** `albumCount` is absent until the server's per-genre counts are warm. */
export type LibraryGenre = {
  readonly id: number
  readonly name: string
  readonly albumCount?: number
}

export type LibraryGenresResponse = {
  readonly genres: readonly LibraryGenre[]
}

/** LMS has no artist images, so the artist list is name-only by design. */
export type LibraryArtist = {
  readonly id: string
  readonly name: string
}

export type LibraryArtistsResponse = {
  readonly artists: readonly LibraryArtist[]
  readonly hasMore: boolean
}

export type LibraryArtistsQuery = {
  readonly search?: string
}

export type LibraryAlbumsQuery = {
  readonly sort?: SortOption
  readonly decade?: DecadeFilter
  readonly genreId?: number
  readonly search?: string
}

const LibraryAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string(),
})

export const LibraryAlbumsResponseSchema = z.object({
  albums: z.array(LibraryAlbumSchema),
  hasMore: z.boolean(),
})

export const proxyAlbumsCoverArt = (value: LibraryAlbumsResponse): LibraryAlbumsResponse => ({
  ...value,
  albums: value.albums.map((album) => ({
    ...album,
    coverArtUrl: proxyCoverArtUrl(album.coverArtUrl),
  })),
})

const LibraryArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const LibraryArtistsResponseSchema = z.object({
  artists: z.array(LibraryArtistSchema),
  hasMore: z.boolean(),
})

const LibraryGenreSchema = z.object({
  id: z.number(),
  name: z.string(),
  albumCount: z.number().optional(),
})

const LibraryGenresResponseSchema = z.object({
  genres: z.array(LibraryGenreSchema),
})

export type LibraryApiError =
  | { readonly type: 'NETWORK_ERROR'; readonly message: string }
  | { readonly type: 'TIMEOUT_ERROR'; readonly message: string }
  | { readonly type: 'ABORT_ERROR'; readonly message: string }
  | { readonly type: 'SERVER_ERROR'; readonly status: number; readonly message: string }
  | { readonly type: 'PARSE_ERROR'; readonly message: string }

const mapLibraryParseError = (message: string): LibraryApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapLibraryThrownError = (error: unknown): LibraryApiError => mapApiThrownError(error)

type QueryEntry = readonly [string, string | undefined]

const toQueryString = (entries: readonly QueryEntry[]): string =>
  entries
    .flatMap(([key, value]) =>
      value === undefined || value === '' ? [] : [`${key}=${encodeURIComponent(value)}`],
    )
    .join('&')

const buildAlbumsQuery = (limit: number, offset: number, query: LibraryAlbumsQuery): string =>
  toQueryString([
    ['limit', String(limit)],
    ['offset', String(offset)],
    ['sort', query.sort],
    ['decade', query.decade],
    ['genreId', query.genreId?.toString()],
    ['search', query.search?.trim()],
  ])

export const getLibraryAlbums = async (
  limit = 250,
  offset = 0,
  query: LibraryAlbumsQuery = {},
): Promise<Result<LibraryAlbumsResponse, LibraryApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/library/albums?${buildAlbumsQuery(limit, offset, query)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: LibraryAlbumsResponseSchema,
      mapValue: proxyAlbumsCoverArt,
      mapHttpError: async (response) => ({
        type: 'SERVER_ERROR',
        status: response.status,
        message:
          (await parseErrorBody(response)) ?? `Library fetch failed: HTTP ${response.status}`,
      }),
      mapThrownError: mapLibraryThrownError,
      mapParseError: mapLibraryParseError,
    },
  )
}

const buildArtistsQuery = (limit: number, offset: number, query: LibraryArtistsQuery): string =>
  toQueryString([
    ['limit', String(limit)],
    ['offset', String(offset)],
    ['search', query.search?.trim()],
  ])

/** Artists come back in the order LMS delivered them — alphabetical, no sort options. */
export const getLibraryArtists = async (
  limit = 250,
  offset = 0,
  query: LibraryArtistsQuery = {},
): Promise<Result<LibraryArtistsResponse, LibraryApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/library/artists?${buildArtistsQuery(limit, offset, query)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: LibraryArtistsResponseSchema,
      mapHttpError: async (response) => ({
        type: 'SERVER_ERROR',
        status: response.status,
        message: (await parseErrorBody(response)) ?? `Artist fetch failed: HTTP ${response.status}`,
      }),
      mapThrownError: mapLibraryThrownError,
      mapParseError: mapLibraryParseError,
    },
  )
}

/** Get the library genre list for the filter UI. */
export const getLibraryGenres = async (): Promise<
  Result<readonly LibraryGenre[], LibraryApiError>
> => {
  return await fetchJsonResult<LibraryGenresResponse, readonly LibraryGenre[], LibraryApiError>(
    getApiUrl('/api/library/genres'),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: LibraryGenresResponseSchema,
      mapValue: (value: LibraryGenresResponse): readonly LibraryGenre[] => value.genres,
      mapHttpError: async (response) => ({
        type: 'SERVER_ERROR',
        status: response.status,
        message: (await parseErrorBody(response)) ?? `Genre fetch failed: HTTP ${response.status}`,
      }),
      mapThrownError: mapLibraryThrownError,
      mapParseError: mapLibraryParseError,
    },
  )
}

const RescanStatusSchema = z.object({
  scanning: z.boolean(),
  step: z.string(),
  info: z.string(),
  totalTime: z.string(),
})

/** Trigger a full LMS library rescan. Returns ok on success (HTTP 202). */
export const triggerLibraryRescan = async (): Promise<Result<void, LibraryApiError>> => {
  return await fetchVoidResult<LibraryApiError>(
    getApiUrl('/api/library/rescan'),
    {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    },
    {
      mapHttpError: (response) => ({
        type: 'SERVER_ERROR',
        status: response.status,
        message: 'Rescan failed',
      }),
      mapThrownError: mapLibraryThrownError,
    },
  )
}

/** Get current LMS library rescan progress. */
export const getRescanStatus = async (): Promise<Result<RescanStatus, LibraryApiError>> => {
  return await fetchJsonResult<RescanStatus, LibraryApiError>(
    getApiUrl('/api/library/rescan/status'),
    {
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: RescanStatusSchema,
      mapHttpError: (response) => ({
        type: 'SERVER_ERROR',
        status: response.status,
        message: 'Status fetch failed',
      }),
      mapThrownError: mapLibraryThrownError,
      mapParseError: mapLibraryParseError,
    },
  )
}
