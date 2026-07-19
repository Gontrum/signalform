import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'

const HealthResponseSchema = z.object({
  dependencies: z.object({
    lms: z.string(),
  }),
})

/**
 * Probe the backend `/health` endpoint to learn whether the LMS server is
 * reachable. The backend answers 200 when healthy and 503 when the LMS probe
 * fails, but always sends a parseable JSON body with `dependencies.lms` set to
 * `"connected"` or `"disconnected"` — so we read the body regardless of status.
 *
 * Returns `{ lmsConnected }` when a body could be parsed, or `null` on a
 * network error or an unparseable body (treated as a failed probe by callers).
 */
export const fetchLmsHealth = async (): Promise<{ readonly lmsConnected: boolean } | null> => {
  try {
    const response = await fetch(getApiUrl('/health'), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    const raw: unknown = await response.json()
    const parsed = HealthResponseSchema.safeParse(raw)
    return { lmsConnected: parsed.success ? parsed.data.dependencies.lms === 'connected' : false }
  } catch {
    // Network failure or unparseable body: caller treats this as a failed probe.
    return null
  }
}
