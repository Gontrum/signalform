/**
 * Shared API error types for domain cores.
 *
 * Defines the error variants that every domain API call can produce.
 * Domain core files import from here instead of repeating the same
 * union literals.  This file is pure TypeScript — no Vue, no I/O.
 *
 * Platform API helpers (apiHelpers.ts) re-export these types so that
 * the shell layer has a single consistent vocabulary.
 */

export type NetworkError = {
  readonly type: 'NETWORK_ERROR'
  readonly message: string
}

export type TimeoutError = {
  readonly type: 'TIMEOUT_ERROR'
  readonly message: string
}

export type AbortError = {
  readonly type: 'ABORT_ERROR'
  readonly message: string
}

export type ServerError = {
  readonly type: 'SERVER_ERROR'
  readonly status: number
  readonly message: string
}

export type ParseError = {
  readonly type: 'PARSE_ERROR'
  readonly message: string
}

/** The five error variants that every domain API call can produce. */
export type BaseApiError = NetworkError | TimeoutError | AbortError | ServerError | ParseError

/** A resource could not be found (404). */
export type NotFoundError = {
  readonly type: 'NOT_FOUND'
  readonly message: string
}

/** The request body failed schema validation (422 / 400). */
export type ValidationError = {
  readonly type: 'VALIDATION_ERROR'
  readonly status: number
  readonly message: string
}
