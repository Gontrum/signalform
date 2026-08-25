import { z } from 'zod'
import type { Result } from '@signalform/shared'
import { getApiUrl } from '@/utils/runtimeUrls'
import { fetchJsonResult } from '@/platform/api/requestResult'
import { mapApiThrownError } from '@/platform/api/apiHelpers'
import { proxyCoverArtUrl } from '@/platform/api/coverArtProxy'

export type TagAlbumSource = 'local' | 'tidal'

export type TagAlbum = {
  readonly artist: string
  readonly title: string
  readonly year?: number
  readonly coverArtUrl: string
  readonly source: TagAlbumSource
  readonly albumId?: string
}

export type TagAlbumsPage = {
  readonly albums: readonly TagAlbum[]
  readonly hasMore: boolean
  readonly totalCandidates: number
}

const TagAlbumSchema = z.object({
  artist: z.string(),
  title: z.string(),
  year: z.number().optional(),
  coverArtUrl: z.string(),
  source: z.enum(['local', 'tidal']),
  albumId: z.string().optional(),
})

const TagAlbumsPageSchema = z.object({
  albums: z.array(TagAlbumSchema),
  hasMore: z.boolean(),
  totalCandidates: z.number(),
})

export type TagsApiError =
  | { readonly type: 'NETWORK_ERROR'; readonly message: string }
  | { readonly type: 'TIMEOUT_ERROR'; readonly message: string }
  | { readonly type: 'ABORT_ERROR'; readonly message: string }
  | {
      readonly type: 'SERVER_ERROR'
      readonly status: number
      readonly message: string
      readonly code?: string
    }
  | { readonly type: 'PARSE_ERROR'; readonly message: string }

const mapTagsParseError = (message: string): TagsApiError => ({
  type: 'PARSE_ERROR',
  message,
})

const mapTagsThrownError = (error: unknown): TagsApiError => mapApiThrownError(error)

/** Local to this file: reads `message` and `code` from an error body in a single pass. */
const TagsErrorBodySchema = z
  .object({ message: z.string().optional(), code: z.string().optional() })
  .nullable()

const parseTagsErrorBody = async (
  response: Response,
): Promise<{ readonly message?: string; readonly code?: string }> => {
  const parsed = TagsErrorBodySchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? (parsed.data ?? {}) : {}
}

const mapTagsHttpError =
  (fallback: string) =>
  async (response: Response): Promise<TagsApiError> => {
    const body = await parseTagsErrorBody(response)
    return {
      type: 'SERVER_ERROR',
      status: response.status,
      message: body.message ?? `${fallback}: HTTP ${response.status}`,
      ...(body.code === undefined ? {} : { code: body.code }),
    }
  }

const proxyTagAlbumsCoverArt = (page: TagAlbumsPage): TagAlbumsPage => ({
  ...page,
  albums: page.albums.map((album) => ({
    ...album,
    coverArtUrl: proxyCoverArtUrl(album.coverArtUrl),
  })),
})

/**
 * One page of the Discogs-backed, cross-source album list for a vocabulary
 * tag, optionally narrowed by free text. `offset`/`limit` page a candidate
 * list the server already resolved and cached for `tagId` — see the tag
 * vocabulary in `@signalform/shared`. The server drops candidates it cannot
 * play, so one page of candidates may yield fewer albums than `limit` while
 * `hasMore` still holds.
 */
export const getTagAlbumsPage = async (
  tagId: string,
  text: string,
  offset: number,
  limit: number,
): Promise<Result<TagAlbumsPage, TagsApiError>> => {
  const params = new URLSearchParams({
    tag: tagId,
    ...(text === '' ? {} : { q: text }),
    offset: String(offset),
    limit: String(limit),
  })

  return await fetchJsonResult(
    getApiUrl(`/api/tags/discogs/albums?${params.toString()}`),
    {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    },
    {
      schema: TagAlbumsPageSchema,
      mapValue: proxyTagAlbumsCoverArt,
      mapHttpError: mapTagsHttpError('Tag albums fetch failed'),
      mapThrownError: mapTagsThrownError,
      mapParseError: mapTagsParseError,
    },
  )
}
