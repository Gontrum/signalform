import { z } from 'zod'
import type { Result } from '@signalform/shared'
import type { QueueTrack } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult, fetchVoidResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import { AudioQualitySchema } from '@/platform/api/commonSchemas'
import type { QueueMutationError } from '@/domains/queue/core/types'

const QueueTrackSchema = z.object({
  id: z.string(),
  position: z.number(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number(),
  isCurrent: z.boolean(),
  addedBy: z.enum(['user', 'radio']).optional(),
  source: z.enum(['local', 'qobuz', 'tidal']).optional(),
  audioQuality: AudioQualitySchema.optional(),
})

const QueueResponseSchema = z.object({
  tracks: z.array(QueueTrackSchema),
  radioModeActive: z.boolean(),
  radioBoundaryIndex: z.number().nullable(),
})

export type QueueApiError = QueueMutationError

const mapMutationError = async (
  response: Response,
  fallbackMessage: string,
): Promise<QueueApiError> => {
  const errorMessage =
    (await parseErrorBody(response)) ?? `${fallbackMessage}: HTTP ${response.status}`

  if (response.status === 400) {
    return {
      type: 'VALIDATION_ERROR',
      status: response.status,
      message: errorMessage,
    }
  }

  return {
    type: 'SERVER_ERROR',
    status: response.status,
    message: errorMessage,
  }
}

const mapThrownError = (error: unknown, fallbackMessage: string): QueueApiError =>
  mapApiThrownError(error, {
    abort: `${fallbackMessage} was aborted`,
    timeout: `${fallbackMessage} timed out`,
  })

export const addToQueue = async (trackUrl: string): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/add'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackUrl }),
      signal: AbortSignal.timeout(5000),
    },
    {
      mapHttpError: async (response) => await mapMutationError(response, 'Failed to add to queue'),
      mapThrownError: (error) => mapThrownError(error, 'Add to queue request'),
    },
  )
}

export const addAlbumToQueue = async (albumId: string): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/add-album'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumId }),
      signal: AbortSignal.timeout(5000),
    },
    {
      mapHttpError: async (response) =>
        await mapMutationError(response, 'Failed to add album to queue'),
      mapThrownError: (error) => mapThrownError(error, 'Add album to queue request'),
    },
  )
}

export const addTidalSearchAlbumToQueue = async (
  albumTitle: string,
  artist: string,
  trackUrls: ReadonlyArray<string>,
): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/add-tidal-search-album'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumTitle, artist, trackUrls }),
      signal: AbortSignal.timeout(15000),
    },
    {
      mapHttpError: async (response) =>
        await mapMutationError(response, 'Failed to add Tidal album to queue'),
      mapThrownError: (error) => mapThrownError(error, 'Add Tidal album to queue request'),
    },
  )
}

export const addTrackListToQueue = async (
  urls: ReadonlyArray<string>,
): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/add-track-list'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(5000),
    },
    {
      mapHttpError: async (response) =>
        await mapMutationError(response, 'Failed to add track list to queue'),
      mapThrownError: (error) => mapThrownError(error, 'Add track list to queue request'),
    },
  )
}

export const jumpToTrack = async (trackIndex: number): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/jump'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIndex }),
      signal: AbortSignal.timeout(2000),
    },
    {
      mapHttpError: async (response) => await mapMutationError(response, 'Failed to jump to track'),
      mapThrownError: (error) => mapThrownError(error, 'Jump to track request'),
    },
  )
}

export const removeFromQueue = async (trackIndex: number): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/remove'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIndex }),
      signal: AbortSignal.timeout(15000),
    },
    {
      mapHttpError: async (response) =>
        await mapMutationError(response, 'Failed to remove track from queue'),
      mapThrownError: (error) => mapThrownError(error, 'Remove track request'),
    },
  )
}

export const reorderQueue = async (
  fromIndex: number,
  toIndex: number,
): Promise<Result<void, QueueApiError>> => {
  return await fetchVoidResult(
    getApiUrl('/api/queue/reorder'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromIndex, toIndex }),
      signal: AbortSignal.timeout(15000),
    },
    {
      mapHttpError: async (response) => await mapMutationError(response, 'Failed to reorder queue'),
      mapThrownError: (error) => mapThrownError(error, 'Reorder queue request'),
    },
  )
}

export const setRadioMode = async (
  enabled: boolean,
): Promise<
  Result<
    {
      readonly tracks: readonly QueueTrack[]
      readonly radioModeActive: boolean
      readonly radioBoundaryIndex: number | null
    },
    QueueApiError
  >
> => {
  return await fetchJsonResult(
    getApiUrl('/api/queue/radio-mode'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
      signal: AbortSignal.timeout(15000),
    },
    {
      schema: QueueResponseSchema,
      mapHttpError: async (response) =>
        await mapMutationError(response, 'Failed to update radio mode'),
      mapThrownError: (error) => mapThrownError(error, 'Radio mode request'),
      mapParseError: (message) => ({ type: 'PARSE_ERROR', message }),
    },
  )
}

export const getQueue = async (): Promise<
  Result<
    {
      readonly tracks: readonly QueueTrack[]
      readonly radioModeActive: boolean
      readonly radioBoundaryIndex: number | null
    },
    QueueApiError
  >
> => {
  return await fetchJsonResult(
    getApiUrl('/api/queue'),
    {
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: QueueResponseSchema,
      mapHttpError: async (response) => ({
        type: 'SERVER_ERROR',
        status: response.status,
        message: (await parseErrorBody(response)) ?? 'Failed to fetch queue',
      }),
      mapThrownError: (error) => mapThrownError(error, 'Queue fetch request'),
      mapParseError: (message) => ({ type: 'PARSE_ERROR', message }),
    },
  )
}
