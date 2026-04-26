import { z } from 'zod'
import type { Result } from '@signalform/shared'
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

const LibraryAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string(),
  genre: z.string().nullable(),
})

const LibraryAlbumsResponseSchema = z.object({
  albums: z.array(LibraryAlbumSchema),
  totalCount: z.number(),
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

export const getLibraryAlbums = async (
  limit = 250,
  offset = 0,
): Promise<Result<LibraryAlbumsResponse, LibraryApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/library/albums?limit=${limit}&offset=${offset}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: LibraryAlbumsResponseSchema,
      mapValue: (value: LibraryAlbumsResponse): LibraryAlbumsResponse => ({
        ...value,
        albums: value.albums.map((album) => ({
          ...album,
          coverArtUrl: proxyCoverArtUrl(album.coverArtUrl),
        })),
      }),
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
