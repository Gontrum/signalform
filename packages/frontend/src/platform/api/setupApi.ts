import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'

const DiscoveredServerSchema = z.object({
  host: z.string(),
  port: z.number(),
  name: z.string(),
  version: z.string(),
})

const DiscoverResponseSchema = z.object({
  servers: z.array(DiscoveredServerSchema),
})

const LmsPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  connected: z.boolean(),
})

const PlayersResponseSchema = z.object({
  players: z.array(LmsPlayerSchema),
})

export type DiscoveredServer = z.infer<typeof DiscoveredServerSchema>
export type LmsPlayer = z.infer<typeof LmsPlayerSchema>

export type SetupApiError =
  | { readonly type: 'NETWORK_ERROR'; readonly message: string }
  | { readonly type: 'SERVER_ERROR'; readonly status: number; readonly message: string }
  | { readonly type: 'PARSE_ERROR'; readonly message: string }

const mapSetupParseError = (message: string): SetupApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapSetupThrownError = (error: unknown): SetupApiError => ({
  type: 'NETWORK_ERROR',
  message: error instanceof Error ? error.message : 'Network error',
})

const mapSetupHttpError = (response: Response): SetupApiError => ({
  type: 'SERVER_ERROR',
  status: response.status,
  message: `HTTP ${response.status}`,
})

export const discoverServers = async (): Promise<
  Result<readonly DiscoveredServer[], SetupApiError>
> => {
  return await fetchJsonResult(
    getApiUrl('/api/setup/discover'),
    {
      signal: AbortSignal.timeout(8000),
    },
    {
      schema: DiscoverResponseSchema,
      mapHttpError: mapSetupHttpError,
      mapThrownError: mapSetupThrownError,
      mapParseError: mapSetupParseError,
      mapValue: (value: z.infer<typeof DiscoverResponseSchema>) => value.servers,
    },
  )
}

export const getPlayers = async (
  host: string,
  port: number,
): Promise<Result<readonly LmsPlayer[], SetupApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/setup/players?host=${encodeURIComponent(host)}&port=${port}`),
    { signal: AbortSignal.timeout(5000) },
    {
      schema: PlayersResponseSchema,
      mapHttpError: mapSetupHttpError,
      mapThrownError: mapSetupThrownError,
      mapParseError: mapSetupParseError,
      mapValue: (value: z.infer<typeof PlayersResponseSchema>) => value.players,
    },
  )
}
