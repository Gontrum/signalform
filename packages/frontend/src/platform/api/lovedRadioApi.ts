import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'
import { withUserHeader } from '@/platform/api/userHeader'

const LovedRadioResultSchema = z.object({
  tracksAdded: z.number(),
})

export const startLovedRadio = async (): Promise<{
  readonly tracksAdded: number
} | null> => {
  const response = await fetch(
    getApiUrl('/api/loved-radio/start'),
    withUserHeader({
      method: 'POST',
      signal: AbortSignal.timeout(30000),
    }),
  )
  if (!response.ok) {
    return null
  }
  const raw: unknown = await response.json()
  const parsed = LovedRadioResultSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
