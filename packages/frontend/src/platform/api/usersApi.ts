import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult, fetchVoidResult } from '@/platform/api/requestResult'

const ApiUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastFmUsername: z.string().optional(),
  hasLastFmSession: z.boolean(),
})

const UsersResponseSchema = z.object({
  users: z.array(ApiUserSchema),
  activeListenerId: z.string().optional(),
})

const CreatedUserSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export type ApiUser = z.infer<typeof ApiUserSchema>
export type UsersResponse = z.infer<typeof UsersResponseSchema>
export type CreatedUser = z.infer<typeof CreatedUserSchema>

export type UsersApiError =
  | { readonly type: 'NETWORK_ERROR'; readonly message: string }
  | { readonly type: 'SERVER_ERROR'; readonly status: number; readonly message: string }
  | { readonly type: 'PARSE_ERROR'; readonly message: string }

const mapUsersParseError = (message: string): UsersApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapUsersThrownError = (error: unknown): UsersApiError => ({
  type: 'NETWORK_ERROR',
  message: error instanceof Error ? error.message : 'Network error',
})

const mapUsersHttpError = (response: Response): UsersApiError => ({
  type: 'SERVER_ERROR',
  status: response.status,
  message: `HTTP ${response.status}`,
})

export const getUsers = async (): Promise<Result<UsersResponse, UsersApiError>> => {
  return await fetchJsonResult(
    getApiUrl('/api/users'),
    {
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: UsersResponseSchema,
      mapHttpError: mapUsersHttpError,
      mapThrownError: mapUsersThrownError,
      mapParseError: mapUsersParseError,
    },
  )
}

export const createUser = async (name: string): Promise<Result<CreatedUser, UsersApiError>> => {
  return await fetchJsonResult(
    getApiUrl('/api/users'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: CreatedUserSchema,
      mapHttpError: mapUsersHttpError,
      mapThrownError: mapUsersThrownError,
      mapParseError: mapUsersParseError,
    },
  )
}

export const renameUser = async (
  id: string,
  name: string,
): Promise<Result<void, UsersApiError>> => {
  return await fetchVoidResult(
    getApiUrl(`/api/users/${encodeURIComponent(id)}`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(5000),
    },
    {
      mapHttpError: mapUsersHttpError,
      mapThrownError: mapUsersThrownError,
    },
  )
}

export const deleteUser = async (id: string): Promise<Result<void, UsersApiError>> => {
  return await fetchVoidResult(
    getApiUrl(`/api/users/${encodeURIComponent(id)}`),
    {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    },
    {
      mapHttpError: mapUsersHttpError,
      mapThrownError: mapUsersThrownError,
    },
  )
}
