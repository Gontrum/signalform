import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult, fetchVoidResult } from '@/platform/api/requestResult'
import {
  mapValidatableThrownError,
  mapValidatableHttpError,
  type ValidatableApiError,
  type ValidatableRequestConfig,
} from '@/platform/api/apiHelpers'

const SleepTimerResponseSchema = z.object({ remainingSeconds: z.number() })

export type SleepTimerApiError = ValidatableApiError

type JsonRequestConfig<TParsed, TResult> = ValidatableRequestConfig & {
  readonly schema: z.ZodType<TParsed>
  readonly mapValue: (value: TParsed) => TResult
}

// Thin same-signature wrappers with an explicit `SleepTimerApiError` return
// type, widening the shared helpers' narrower unions (see apiHelpers.ts).
const mapSleepTimerThrownError = (
  abortMessage: string,
  timeoutMessage: string,
): ((error: unknown) => SleepTimerApiError) =>
  mapValidatableThrownError(abortMessage, timeoutMessage)

const mapSleepTimerHttpError = (
  fallbackMessage: string,
  validationStatuses?: ReadonlyArray<number>,
): ((response: Response) => Promise<SleepTimerApiError>) =>
  mapValidatableHttpError(fallbackMessage, validationStatuses)

const runVoidSleepTimerRequest = async (
  config: ValidatableRequestConfig,
): Promise<Result<void, SleepTimerApiError>> => {
  return await fetchVoidResult(config.url, config.init, {
    mapHttpError: mapSleepTimerHttpError(config.fallbackMessage, config.validationStatuses),
    mapThrownError: mapSleepTimerThrownError(config.abortMessage, config.timeoutMessage),
  })
}

const runMappedJsonSleepTimerRequest = async <TParsed, TResult>(
  config: JsonRequestConfig<TParsed, TResult>,
): Promise<Result<TResult, SleepTimerApiError>> => {
  return await fetchJsonResult(config.url, config.init, {
    schema: config.schema,
    mapHttpError: mapSleepTimerHttpError(config.fallbackMessage, config.validationStatuses),
    mapThrownError: mapSleepTimerThrownError(config.abortMessage, config.timeoutMessage),
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
