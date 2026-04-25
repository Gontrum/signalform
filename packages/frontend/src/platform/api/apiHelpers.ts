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
import type { AbortError, TimeoutError, NetworkError } from '@/domains/shared/core/api-errors'

// ---------------------------------------------------------------------------
// Error-body schema — used by every API file that reads a JSON error payload
// ---------------------------------------------------------------------------

export const ErrorBodySchema = z.object({ message: z.string().optional() }).nullable()

// ---------------------------------------------------------------------------
// parseErrorBody — extracts the optional `message` field from a failed HTTP
// response, falling back gracefully when the body is absent or malformed.
// ---------------------------------------------------------------------------

export const parseErrorBody = async (response: Response): Promise<string | undefined> => {
  const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? parsed.data?.message : undefined
}

// ---------------------------------------------------------------------------
// Base API error types — re-exported from domains/shared/core/api-errors so
// that shell (API files) and core (domain types) share one definition.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// mapApiThrownError — maps a caught JS exception to a BaseApiError-compatible
// shape.  The caller supplies a type-narrowed constructor so the return type
// stays precise (no widening to BaseApiError required at call sites).
// ---------------------------------------------------------------------------

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
