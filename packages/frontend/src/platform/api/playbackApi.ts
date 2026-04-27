import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult, fetchVoidResult } from '@/platform/api/requestResult'
import { parseErrorBody } from '@/platform/api/apiHelpers'
import { AudioQualitySchema } from '@/platform/api/commonSchemas'

const VolumeResponseSchema = z.object({ level: z.number() })

const TimeResponseSchema = z.object({ seconds: z.number() })

const QueuePreviewItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
})

const CurrentTrackStatusSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  url: z.string(),
  duration: z.number().optional(),
  source: z.enum(['local', 'qobuz', 'tidal', 'unknown']),
  coverArtUrl: z.string().optional(),
  artistId: z.string().optional(),
  albumId: z.string().optional(),
  audioQuality: AudioQualitySchema.optional(),
})

const PlaybackStatusResponseSchema = z.object({
  status: z.enum(['playing', 'paused', 'stopped']),
  currentTime: z.number(),
  currentTrack: CurrentTrackStatusSchema.optional(),
  queuePreview: z.array(QueuePreviewItemSchema),
})

export type PlaybackStatusResponse = z.infer<typeof PlaybackStatusResponseSchema>

export type PlaybackApiError =
  | { readonly type: 'NETWORK_ERROR'; readonly message: string }
  | { readonly type: 'TIMEOUT_ERROR'; readonly message: string }
  | { readonly type: 'SERVER_ERROR'; readonly status: number; readonly message: string }
  | {
      readonly type: 'VALIDATION_ERROR'
      readonly status: number
      readonly message: string
    }
  | { readonly type: 'ABORT_ERROR'; readonly message: string }
  | { readonly type: 'PARSE_ERROR'; readonly message: string }

type VoidRequestConfig = {
  readonly url: string
  readonly init: RequestInit
  readonly fallbackMessage: string
  readonly abortMessage: string
  readonly timeoutMessage: string
  readonly validationStatuses?: ReadonlyArray<number>
}

type JsonRequestConfig<TParsed> = VoidRequestConfig & {
  readonly schema: z.ZodType<TParsed>
}

const createPlaybackThrownErrorMapper =
  (abortMessage: string, timeoutMessage: string) =>
  (error: unknown): PlaybackApiError => {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { type: 'ABORT_ERROR', message: abortMessage }
      }

      if (error.name === 'TimeoutError') {
        return { type: 'TIMEOUT_ERROR', message: timeoutMessage }
      }

      return {
        type: 'NETWORK_ERROR',
        message: error.message,
      }
    }

    return {
      type: 'NETWORK_ERROR',
      message: 'Unknown network error occurred',
    }
  }

const createPlaybackHttpErrorMapper =
  (fallbackMessage: string, validationStatuses: ReadonlyArray<number> = []) =>
  async (response: Response): Promise<PlaybackApiError> => {
    const errorMessage =
      (await parseErrorBody(response)) ?? `${fallbackMessage}: HTTP ${response.status}`

    if (validationStatuses.includes(response.status)) {
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

const runVoidPlaybackRequest = async (
  config: VoidRequestConfig,
): Promise<Result<void, PlaybackApiError>> => {
  return await fetchVoidResult(config.url, config.init, {
    mapHttpError: createPlaybackHttpErrorMapper(config.fallbackMessage, config.validationStatuses),
    mapThrownError: createPlaybackThrownErrorMapper(config.abortMessage, config.timeoutMessage),
  })
}

const runJsonPlaybackRequest = async <TParsed>(
  config: JsonRequestConfig<TParsed>,
): Promise<Result<TParsed, PlaybackApiError>> => {
  return await fetchJsonResult(config.url, config.init, {
    schema: config.schema,
    mapHttpError: createPlaybackHttpErrorMapper(config.fallbackMessage, config.validationStatuses),
    mapThrownError: createPlaybackThrownErrorMapper(config.abortMessage, config.timeoutMessage),
    mapParseError: (message) => ({ type: 'PARSE_ERROR', message }),
  })
}

const runMappedJsonPlaybackRequest = async <TParsed, TResult>(
  config: JsonRequestConfig<TParsed> & { readonly mapValue: (value: TParsed) => TResult },
): Promise<Result<TResult, PlaybackApiError>> => {
  return await fetchJsonResult(config.url, config.init, {
    schema: config.schema,
    mapHttpError: createPlaybackHttpErrorMapper(config.fallbackMessage, config.validationStatuses),
    mapThrownError: createPlaybackThrownErrorMapper(config.abortMessage, config.timeoutMessage),
    mapParseError: (message) => ({ type: 'PARSE_ERROR', message }),
    mapValue: config.mapValue,
  })
}

export const playTrack = async (trackUrl: string): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/play'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trackUrl }),
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Playback failed',
    abortMessage: 'Playback request was aborted',
    timeoutMessage: 'Playback request timed out (5s)',
    validationStatuses: [400],
  })
}

export const nextTrack = async (): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/next'),
    init: {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Skip to next failed',
    abortMessage: 'Skip request was aborted',
    timeoutMessage: 'Skip request timed out (5s)',
  })
}

export const previousTrack = async (): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/previous'),
    init: {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Skip to previous failed',
    abortMessage: 'Skip request was aborted',
    timeoutMessage: 'Skip request timed out (5s)',
  })
}

export const pausePlayback = async (): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/pause'),
    init: {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Pause failed',
    abortMessage: 'Pause request was aborted',
    timeoutMessage: 'Pause request timed out (5s)',
  })
}

export const resumePlayback = async (): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/resume'),
    init: {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Resume failed',
    abortMessage: 'Resume request was aborted',
    timeoutMessage: 'Resume request timed out (5s)',
  })
}

export const setVolume = async (level: number): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/volume'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ level }),
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Set volume failed',
    abortMessage: 'Set volume request was aborted',
    timeoutMessage: 'Set volume request timed out (5s)',
    validationStatuses: [400],
  })
}

export const getVolume = async (): Promise<Result<number, PlaybackApiError>> => {
  return await runMappedJsonPlaybackRequest({
    url: getApiUrl('/api/playback/volume'),
    init: {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    schema: VolumeResponseSchema,
    mapValue: (value) => value.level,
    fallbackMessage: 'Get volume failed',
    abortMessage: 'Get volume request was aborted',
    timeoutMessage: 'Get volume request timed out (5s)',
  })
}

export const seek = async (seconds: number): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/seek'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seconds }),
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Seek failed',
    abortMessage: 'Seek request was aborted',
    timeoutMessage: 'Seek request timed out (5s)',
    validationStatuses: [400],
  })
}

export const playAlbum = async (albumId: string): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/play-album'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ albumId }),
      signal: AbortSignal.timeout(5000),
    },
    fallbackMessage: 'Album playback failed',
    abortMessage: 'Album playback request was aborted',
    timeoutMessage: 'Album playback request timed out (5s)',
    validationStatuses: [400],
  })
}

export const playTidalSearchAlbum = async (
  albumTitle: string,
  artist: string,
  trackUrls: ReadonlyArray<string>,
): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/play-tidal-search-album'),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumTitle, artist, trackUrls }),
      signal: AbortSignal.timeout(15000),
    },
    fallbackMessage: 'Play Tidal album failed',
    abortMessage: 'Play Tidal album request was aborted',
    timeoutMessage: 'Play Tidal album request timed out',
    validationStatuses: [400],
  })
}

export const playTrackList = async (
  urls: ReadonlyArray<string>,
): Promise<Result<void, PlaybackApiError>> => {
  return await runVoidPlaybackRequest({
    url: getApiUrl('/api/playback/play-track-list'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(10000),
    },
    fallbackMessage: 'Play track list failed',
    abortMessage: 'Play track list request was aborted',
    timeoutMessage: 'Play track list request timed out (5s)',
    validationStatuses: [400],
  })
}

export const getCurrentTime = async (): Promise<Result<number, PlaybackApiError>> => {
  return await runMappedJsonPlaybackRequest({
    url: getApiUrl('/api/playback/time'),
    init: {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    schema: TimeResponseSchema,
    mapValue: (value) => value.seconds,
    fallbackMessage: 'Get current time failed',
    abortMessage: 'Get time request was aborted',
    timeoutMessage: 'Get time request timed out (5s)',
  })
}

export const getPlaybackStatus = async (): Promise<
  Result<PlaybackStatusResponse, PlaybackApiError>
> => {
  return await runJsonPlaybackRequest({
    url: getApiUrl('/api/playback/status'),
    init: {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    schema: PlaybackStatusResponseSchema,
    fallbackMessage: 'Get playback status failed',
    abortMessage: 'Get playback status request was aborted',
    timeoutMessage: 'Get playback status request timed out (5s)',
  })
}
