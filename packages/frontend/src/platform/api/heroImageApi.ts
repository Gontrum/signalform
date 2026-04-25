import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { mapApiThrownError } from '@/platform/api/apiHelpers'
import type { HeroImageApiError } from '@/domains/enrichment/core/types'

const HeroImageSchema = z.object({ imageUrl: z.string().nullable() })

export type { HeroImageApiError }

const mapHeroImageParseError = (message: string): HeroImageApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapHeroImageThrownError = (error: unknown): HeroImageApiError => mapApiThrownError(error)

export const getArtistHeroImage = async (
  name: string,
): Promise<Result<string | null, HeroImageApiError>> => {
  return await fetchJsonResult(
    getApiUrl(`/api/enrichment/artist/images?name=${encodeURIComponent(name)}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    },
    {
      schema: HeroImageSchema,
      mapHttpError: (response) => {
        const message = `Hero image fetch failed: HTTP ${response.status}`
        return response.status === 404
          ? { type: 'NOT_FOUND', message }
          : { type: 'SERVER_ERROR', status: response.status, message }
      },
      mapThrownError: mapHeroImageThrownError,
      mapParseError: mapHeroImageParseError,
      mapValue: (value: z.infer<typeof HeroImageSchema>) => value.imageUrl,
    },
  )
}
