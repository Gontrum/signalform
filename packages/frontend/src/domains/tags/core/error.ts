import type {
  AbortError,
  NetworkError,
  ParseError,
  TimeoutError,
} from '@/domains/shared/core/api-errors'

// tags API's SERVER_ERROR carries an optional `code`, which the shared
// ServerError variant does not — mirrored locally instead of importing the
// platform type, so this stays structurally compatible without a core ->
// platform/api dependency.
type TagAlbumsServerError = {
  readonly type: 'SERVER_ERROR'
  readonly status: number
  readonly message: string
  readonly code?: string
}

export type TagAlbumsApiError =
  NetworkError | TimeoutError | AbortError | TagAlbumsServerError | ParseError

export type TagAlbumsErrorKind = 'discogs' | 'other'

// Discogs unreachable gets its own copy; every other failure (LMS, network,
// parse) shares one generic message — the user cannot act differently on them.
export const classifyError = (error: TagAlbumsApiError): TagAlbumsErrorKind =>
  error.type === 'SERVER_ERROR' && error.code === 'DISCOGS_UNREACHABLE' ? 'discogs' : 'other'
