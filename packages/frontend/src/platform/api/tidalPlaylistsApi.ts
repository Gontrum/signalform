import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'
import { withUserHeader } from '@/platform/api/userHeader'

export type TidalPlaylist = {
  readonly id: string
  readonly name: string
  readonly coverArtUrl: string
}

export type TidalPlaylistTrack = {
  readonly id: string
  readonly position: number
  readonly title: string
  readonly url: string
  readonly duration?: number
  readonly coverArtUrl: string
}

type TidalPlaylistTracksPage = {
  readonly tracks: readonly TidalPlaylistTrack[]
  readonly totalCount: number
  readonly hasMore: boolean
}

const TidalPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  coverArtUrl: z.string(),
})

const ListTidalPlaylistsResponseSchema = z.object({
  playlists: z.array(TidalPlaylistSchema),
})

const TidalPlaylistTrackSchema = z.object({
  id: z.string(),
  position: z.number(),
  title: z.string(),
  url: z.string(),
  duration: z.number().optional(),
  coverArtUrl: z.string(),
})

const TidalPlaylistTracksResponseSchema = z.object({
  tracks: z.array(TidalPlaylistTrackSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
})

export const listTidalPlaylists = async (): Promise<readonly TidalPlaylist[]> => {
  const response = await fetch(
    getApiUrl('/api/tidal/playlists'),
    withUserHeader({
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    }),
  )
  if (!response.ok) {
    return []
  }
  const raw: unknown = await response.json()
  const parsed = ListTidalPlaylistsResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data.playlists : []
}

/**
 * One page of a Tidal playlist's tracks, or `undefined` when the request or
 * the response shape failed — an unparsable page must not reach the caller as
 * an empty playlist with `hasMore: false`, which reads as "nothing more here".
 */
export const getTidalPlaylistTracks = async (
  id: string,
  limit = 250,
  offset = 0,
): Promise<TidalPlaylistTracksPage | undefined> => {
  const response = await fetch(
    getApiUrl(
      `/api/tidal/playlists/${encodeURIComponent(id)}/tracks?limit=${String(limit)}&offset=${String(offset)}`,
    ),
    withUserHeader({
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    }),
  )
  if (!response.ok) {
    return undefined
  }
  const raw: unknown = await response.json()
  const parsed = TidalPlaylistTracksResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

export const playTidalPlaylist = async (id: string): Promise<boolean> => {
  const response = await fetch(
    getApiUrl('/api/playback/play-tidal-playlist'),
    withUserHeader({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(15000),
    }),
  )
  return response.ok
}
