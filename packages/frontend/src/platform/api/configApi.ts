import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'

const MaskedConfigSchema = z.object({
  lmsHost: z.string(),
  lmsPort: z.number(),
  playerId: z.string(),
  hasLastFmKey: z.boolean(),
  hasFanartKey: z.boolean(),
  isConfigured: z.boolean(),
  configuredAt: z.string().optional(),
  language: z.enum(['en', 'de']),
})

export type MaskedConfig = z.infer<typeof MaskedConfigSchema>

export type ConfigApiError =
  | { readonly type: 'NETWORK_ERROR'; readonly message: string }
  | { readonly type: 'SERVER_ERROR'; readonly status: number; readonly message: string }
  | { readonly type: 'PARSE_ERROR'; readonly message: string }

import type { ConfigUpdate } from '@/domains/settings/core/types'
export type { ConfigUpdate }

const mapConfigParseError = (message: string): ConfigApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapConfigThrownError = (error: unknown): ConfigApiError => ({
  type: 'NETWORK_ERROR',
  message: error instanceof Error ? error.message : 'Network error',
})

const mapConfigHttpError = (response: Response): ConfigApiError => ({
  type: 'SERVER_ERROR',
  status: response.status,
  message: `HTTP ${response.status}`,
})

export const getConfig = async (): Promise<Result<MaskedConfig, ConfigApiError>> => {
  return await fetchJsonResult(
    getApiUrl('/api/config'),
    {
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: MaskedConfigSchema,
      mapHttpError: mapConfigHttpError,
      mapThrownError: mapConfigThrownError,
      mapParseError: mapConfigParseError,
    },
  )
}

export const updateConfig = async (
  updates: ConfigUpdate,
): Promise<Result<MaskedConfig, ConfigApiError>> => {
  return await fetchJsonResult(
    getApiUrl('/api/config'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: MaskedConfigSchema,
      mapHttpError: mapConfigHttpError,
      mapThrownError: mapConfigThrownError,
      mapParseError: mapConfigParseError,
    },
  )
}
