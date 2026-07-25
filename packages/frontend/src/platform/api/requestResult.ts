import { err, ok, type Result } from '@signalform/shared'
import type { ZodType } from 'zod'
import { parseResponse } from '@/utils/parseResponse'
import { withUserHeader } from '@/platform/api/userHeader'

type HttpErrorMapper<E> = (response: Response) => Promise<E> | E
type ThrownErrorMapper<E> = (error: unknown) => E

type JsonResultConfig<TParsed, E> = {
  readonly schema: ZodType<TParsed>
  readonly mapHttpError: HttpErrorMapper<E>
  readonly mapThrownError: ThrownErrorMapper<E>
  readonly mapParseError: (message: string) => E
}

type JsonMappedResultConfig<TParsed, TResult, E> = JsonResultConfig<TParsed, E> & {
  readonly mapValue: (value: TParsed) => TResult
}

type VoidResultConfig<E> = {
  readonly mapHttpError: HttpErrorMapper<E>
  readonly mapThrownError: ThrownErrorMapper<E>
}

const fetchResponse = async <E>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  mapThrownError: ThrownErrorMapper<E>,
): Promise<Result<Response, E>> => {
  return await fetch(input, withUserHeader(init))
    .then<Result<Response, E>>((response) => ok(response))
    .catch<Result<Response, E>>((error: unknown) => err(mapThrownError(error)))
}

/**
 * Resolves a fetch call down to an "ok" `Response`, mapping both thrown
 * errors and non-2xx HTTP responses to `E`. Shared by `fetchJsonResult` and
 * `fetchVoidResult` so the request/error-handling prelude lives in one place.
 */
const resolveOkResponse = async <E>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  mapThrownError: ThrownErrorMapper<E>,
  mapHttpError: HttpErrorMapper<E>,
): Promise<Result<Response, E>> => {
  const responseResult = await fetchResponse(input, init, mapThrownError)
  if (!responseResult.ok) {
    return responseResult
  }

  const response = responseResult.value
  if (!response.ok) {
    return err(await mapHttpError(response))
  }

  return ok(response)
}

const parseJsonBody = async <E>(
  response: Response,
  mapParseError: (message: string) => E,
): Promise<Result<unknown, E>> => {
  return await response
    .json()
    .then<Result<unknown, E>>((value) => ok(value))
    .catch<Result<unknown, E>>(() => err(mapParseError('Invalid JSON response body')))
}

export async function fetchJsonResult<TParsed, E = never>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  config: JsonResultConfig<TParsed, E>,
): Promise<Result<TParsed, E>>

export async function fetchJsonResult<TParsed, TResult, E = never>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  config: JsonMappedResultConfig<TParsed, TResult, E>,
): Promise<Result<TResult, E>>

export async function fetchJsonResult<TParsed, TResult, E = never>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  config: JsonResultConfig<TParsed, E> | JsonMappedResultConfig<TParsed, TResult, E>,
): Promise<Result<TParsed | TResult, E>> {
  const okResponseResult = await resolveOkResponse(
    input,
    init,
    config.mapThrownError,
    config.mapHttpError,
  )
  if (!okResponseResult.ok) {
    return okResponseResult
  }

  const jsonResult = await parseJsonBody(okResponseResult.value, config.mapParseError)
  if (!jsonResult.ok) {
    return jsonResult
  }

  const parsedResult = parseResponse(config.schema, jsonResult.value)
  if (!parsedResult.ok) {
    return err(config.mapParseError(parsedResult.error.message))
  }

  if ('mapValue' in config) {
    return ok(config.mapValue(parsedResult.value))
  }

  return ok(parsedResult.value)
}

export const fetchVoidResult = async <E>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  config: VoidResultConfig<E>,
): Promise<Result<void, E>> => {
  const okResponseResult = await resolveOkResponse(
    input,
    init,
    config.mapThrownError,
    config.mapHttpError,
  )
  if (!okResponseResult.ok) {
    return okResponseResult
  }

  return ok(undefined)
}
