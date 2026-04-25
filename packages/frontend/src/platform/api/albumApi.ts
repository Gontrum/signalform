import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { parseErrorBody, mapApiThrownError } from '@/platform/api/apiHelpers'
import { AudioQualitySchema } from '@/platform/api/commonSchemas'
import type { AlbumApiError, AlbumDetailResponse, AlbumTrack } from '@/domains/album/core/types'

const AlbumTrackSchema = z.object({
  id: z.string(),
  trackNumber: z.number(),
  title: z.string(),
  artist: z.string(),
  duration: z.number(),
  url: z.string(),
  audioQuality: AudioQualitySchema.optional(),
})

const AlbumDetailResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  tracks: z.array(AlbumTrackSchema),
})

const mapAlbumParseError = (message: string): AlbumApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapAlbumThrownError = (error: unknown): AlbumApiError => mapApiThrownError(error)

export const getAlbumDetail = async (
  albumId: string,
): Promise<Result<AlbumDetailResponse, AlbumApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/album/${encodeURIComponent(albumId)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: AlbumDetailResponseSchema,
      mapHttpError: async (response) => {
        const message =
          (await parseErrorBody(response)) ?? `Album fetch failed: HTTP ${response.status}`

        return response.status === 404
          ? { type: 'NOT_FOUND', message }
          : { type: 'SERVER_ERROR', status: response.status, message }
      },
      mapThrownError: mapAlbumThrownError,
      mapParseError: mapAlbumParseError,
    },
  )
}

export type { AlbumApiError, AlbumDetailResponse, AlbumTrack }
