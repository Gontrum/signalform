import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult, fetchVoidResult } from '@/platform/api/requestResult'
import { parseErrorBody } from '@/platform/api/apiHelpers'

const SleepTimerResponseSchema = z.object({ remainingSeconds: z.number() })

export type SleepTimerApiError =
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

type JsonRequestConfig<TParsed, TResult> = VoidRequestConfig & {
  readonly schema: z.ZodType<TParsed>
  readonly mapValue: (value: TParsed) => TResult
}

const createSleepTimerThrownErrorMapper =
  (abortMessage: string, timeoutMessage: string) =>
  (error: unknown): SleepTimerApiError => {
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

const createSleepTimerHttpErrorMapper =
  (fallbackMessage: string, validationStatuses: ReadonlyArray<number> = []) =>
  async (response: Response): Promise<SleepTimerApiError> => {
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

const runVoidSleepTimerRequest = async (
  config: VoidRequestConfig,
): Promise<Result<void, SleepTimerApiError>> => {
  return await fetchVoidResult(config.url, config.init, {
    mapHttpError: createSleepTimerHttpErrorMapper(
      config.fallbackMessage,
      config.validationStatuses,
    ),
    mapThrownError: createSleepTimerThrownErrorMapper(config.abortMessage, config.timeoutMessage),
  })
}

const runMappedJsonSleepTimerRequest = async <TParsed, TResult>(
  config: JsonRequestConfig<TParsed, TResult>,
): Promise<Result<TResult, SleepTimerApiError>> => {
  return await fetchJsonResult(config.url, config.init, {
    schema: config.schema,
    mapHttpError: createSleepTimerHttpErrorMapper(
      config.fallbackMessage,
      config.validationStatuses,
    ),
    mapThrownError: createSleepTimerThrownErrorMapper(config.abortMessage, config.timeoutMessage),
    mapParseError: (message) => ({ type: 'PARSE_ERROR', message }),
    mapValue: config.mapValue,
  })
}

export const setSleepTimer = async (seconds: number): Promise<Result<void, SleepTimerApiError>> => {
  return await runVoidSleepTimerRequest({
    url: getApiUrl('/api/playback/sleep'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seconds }),
      signal: AbortSignal.timeout(15000),
    },
    fallbackMessage: 'Set sleep timer failed',
    abortMessage: 'Set sleep timer request was aborted',
    timeoutMessage: 'Set sleep timer request timed out (15s)',
    validationStatuses: [400],
  })
}

export const getSleepTimer = async (): Promise<Result<number, SleepTimerApiError>> => {
  return await runMappedJsonSleepTimerRequest({
    url: getApiUrl('/api/playback/sleep'),
    init: {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    schema: SleepTimerResponseSchema,
    mapValue: (value) => value.remainingSeconds,
    fallbackMessage: 'Get sleep timer failed',
    abortMessage: 'Get sleep timer request was aborted',
    timeoutMessage: 'Get sleep timer request timed out (5s)',
  })
}
