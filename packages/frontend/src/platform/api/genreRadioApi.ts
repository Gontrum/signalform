import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'

const GenreRadioResultSchema = z.object({
  genreName: z.string(),
  tracksAdded: z.number(),
})

const TagSchema = z.object({
  name: z.string(),
  count: z.number(),
  url: z.string(),
})

const TagsResponseSchema = z.object({
  tags: z.array(TagSchema),
})

export const startGenreRadio = async (
  genreName: string,
): Promise<{ readonly genreName: string; readonly tracksAdded: number } | null> => {
  const response = await fetch(getApiUrl('/api/genre-radio/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genreName }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    return null
  }
  const raw: unknown = await response.json()
  const parsed = GenreRadioResultSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export const searchTags = async (
  query: string,
): Promise<readonly { readonly name: string; readonly count: number; readonly url: string }[]> => {
  try {
    const response = await fetch(getApiUrl(`/api/tags/search?q=${encodeURIComponent(query)}`), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      return []
    }
    const raw: unknown = await response.json()
    const parsed = TagsResponseSchema.safeParse(raw)
    return parsed.success ? parsed.data.tags : []
  } catch {
    return []
  }
}
