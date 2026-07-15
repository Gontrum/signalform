import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'
import { withUserHeader } from '@/platform/api/userHeader'

const PersonalRadioResultSchema = z.object({
  tracksAdded: z.number(),
  seedArtists: z.array(z.string()),
})

export const startPersonalRadio = async (): Promise<{
  readonly tracksAdded: number
  readonly seedArtists: readonly string[]
} | null> => {
  const response = await fetch(
    getApiUrl('/api/personal-radio/start'),
    withUserHeader({
      method: 'POST',
      signal: AbortSignal.timeout(30000),
    }),
  )
  if (!response.ok) {
    return null
  }
  const raw: unknown = await response.json()
  const parsed = PersonalRadioResultSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
