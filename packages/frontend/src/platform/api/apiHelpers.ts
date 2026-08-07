/**
 * Shared API helper utilities.
 *
 * Single source of truth for the common error-body parsing and thrown-error
 * mapping patterns that appear across every domain API file.
 *
 * Only the generic, domain-agnostic parts live here.  Domain-specific error
 * types (e.g. NOT_FOUND, VALIDATION_ERROR) stay in their respective files.
 */

import { z } from 'zod'
import type {
  AbortError,
  TimeoutError,
  NetworkError,
  ServerError,
  ValidationError,
  BaseApiError,
} from '@/domains/shared/core/api-errors'

const ErrorBodySchema = z.object({ message: z.string().optional() }).nullable()

// parseErrorBody — extracts the optional `message` field from a failed HTTP
// response, falling back gracefully when the body is absent or malformed.

export const parseErrorBody = async (response: Response): Promise<string | undefined> => {
  const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? parsed.data?.message : undefined
}

// Base API error types — re-exported from domains/shared/core/api-errors so
// that shell (API files) and core (domain types) share one definition.

export type {
  NetworkError as NetworkApiError,
  TimeoutError as TimeoutApiError,
  AbortError as AbortApiError,
  ServerError as ServerApiError,
  ParseError as ParseApiError,
  BaseApiError,
  NotFoundError,
  ValidationError,
} from '@/domains/shared/core/api-errors'

// mapApiThrownError — maps a caught JS exception to a BaseApiError-compatible
// shape.  The caller supplies a type-narrowed constructor so the return type
// stays precise (no widening to BaseApiError required at call sites).

type ThrownErrorMessages = {
  readonly abort?: string
  readonly timeout?: string
  readonly network?: string
}

/**
 * Maps a caught exception to an AbortError, TimeoutError, or NetworkError.
 *
 * Usage:
 *   mapApiThrownError(error, {
 *     abort: 'Request aborted',
 *     timeout: 'Request timed out (5s)',
 *   })
 *
 * The returned object always has the shape of one of the three base error
 * variants and is assignable to any domain error union that includes them.
 */
export const mapApiThrownError = (
  error: unknown,
  messages: ThrownErrorMessages = {},
): AbortError | TimeoutError | NetworkError => {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return { type: 'ABORT_ERROR', message: messages.abort ?? 'Request aborted' }
    }
    if (error.name === 'TimeoutError') {
      return { type: 'TIMEOUT_ERROR', message: messages.timeout ?? 'Request timed out (5s)' }
    }
    return { type: 'NETWORK_ERROR', message: messages.network ?? error.message }
  }
  return { type: 'NETWORK_ERROR', message: messages.network ?? 'Unknown network error' }
}

// Validatable request helpers — shared by API files whose error union is a
// plain `BaseApiError` plus a status-code-driven `VALIDATION_ERROR` variant
// (e.g. playbackApi, sleepTimerApi). Keeps the fixed abort/timeout messages
// (rather than the `error.message` passthrough of `mapApiThrownError`) that
// those two files rely on for their fallback wording.

/** The error union shared by every "validatable" request (play, seek, sleep timer, ...). */
export type ValidatableApiError = BaseApiError | ValidationError

/** Config accepted by `mapValidatableThrownError` / `mapValidatableHttpError` callers. */
export type ValidatableRequestConfig = {
  readonly url: string
  readonly init: RequestInit
  readonly fallbackMessage: string
  readonly abortMessage: string
  readonly timeoutMessage: string
  readonly validationStatuses?: ReadonlyArray<number>
}

/**
 * Maps a caught exception to ABORT_ERROR / TIMEOUT_ERROR / NETWORK_ERROR
 * using fixed, caller-supplied messages (no `error.message` passthrough).
 *
 * Returns the narrow `AbortError | TimeoutError | NetworkError` union, which
 * is always a subtype of a domain's `ValidatableApiError`-shaped error union
 * — callers can use the result directly, or wrap it in a same-signature
 * function with an explicit domain return type annotation for exact typing
 * (see `mapArtistThrownError` in artistApi.ts for the established pattern).
 */
export const mapValidatableThrownError =
  (abortMessage: string, timeoutMessage: string) =>
  (error: unknown): AbortError | TimeoutError | NetworkError => {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { type: 'ABORT_ERROR', message: abortMessage }
      }
      if (error.name === 'TimeoutError') {
        return { type: 'TIMEOUT_ERROR', message: timeoutMessage }
      }
      return { type: 'NETWORK_ERROR', message: error.message }
    }
    return { type: 'NETWORK_ERROR', message: 'Unknown network error occurred' }
  }

/**
 * Maps a non-2xx response to SERVER_ERROR, or VALIDATION_ERROR when the
 * response status is in `validationStatuses`. Returns the narrow
 * `ServerError | ValidationError` union — see `mapValidatableThrownError`
 * above for why that is safe for callers whose error union is wider.
 */
export const mapValidatableHttpError =
  (fallbackMessage: string, validationStatuses: ReadonlyArray<number> = []) =>
  async (response: Response): Promise<ServerError | ValidationError> => {
    const errorMessage =
      (await parseErrorBody(response)) ?? `${fallbackMessage}: HTTP ${response.status}`

    if (validationStatuses.includes(response.status)) {
      return { type: 'VALIDATION_ERROR', status: response.status, message: errorMessage }
    }

    return { type: 'SERVER_ERROR', status: response.status, message: errorMessage }
  }
