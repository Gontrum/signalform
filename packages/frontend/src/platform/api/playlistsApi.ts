import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'
import { withUserHeader } from '@/platform/api/userHeader'

export type SavedPlaylist = {
  readonly id: string
  readonly name: string
}

/**
 * `index` is the track's position in the whole playlist, not in the page it
 * arrived in. It shifts as soon as an earlier track is removed, so it is a
 * handle for exactly one request and never an identifier.
 */
export type PlaylistTrack = {
  readonly index: number
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly duration?: number
}

type PlaylistTracksPage = {
  readonly tracks: readonly PlaylistTrack[]
  readonly hasMore: boolean
}

/**
 * Outcome of a playlist write. `no-playlist-dir` is its own case because LMS
 * refuses every write when its playlist folder is unset — nothing a retry can
 * fix, and the user has to be pointed at the LMS settings rather than at a
 * server that is running fine.
 */
export type PlaylistWriteResult = 'ok' | 'no-playlist-dir' | 'failed'

const PLAYLIST_DIR_ERROR_CODE = 'PLAYLIST_DIR_NOT_CONFIGURED'

const ErrorCodeSchema = z.object({ error: z.string().optional() })

// try/catch, not .catch(): an error response may carry no body at all, and
// then `json()` throws before it ever returns a promise.
const readErrorCode = async (response: Response): Promise<string | undefined> => {
  try {
    const parsed = ErrorCodeSchema.safeParse(await response.json())
    return parsed.success ? parsed.data.error : undefined
  } catch {
    return undefined
  }
}

const toWriteResult = async (response: Response): Promise<PlaylistWriteResult> => {
  if (response.ok) {
    return 'ok'
  }

  return (await readErrorCode(response)) === PLAYLIST_DIR_ERROR_CODE ? 'no-playlist-dir' : 'failed'
}

const SavedPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const ListPlaylistsResponseSchema = z.object({
  playlists: z.array(SavedPlaylistSchema),
})

const PlaylistTrackSchema = z.object({
  index: z.number(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number().optional(),
})

const PlaylistTracksResponseSchema = z.object({
  tracks: z.array(PlaylistTrackSchema),
  hasMore: z.boolean(),
})

export const savePlaylist = async (name: string): Promise<PlaylistWriteResult> => {
  const response = await fetch(
    getApiUrl('/api/playlists'),
    withUserHeader({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(15000),
    }),
  )
  return await toWriteResult(response)
}

export const listPlaylists = async (): Promise<readonly SavedPlaylist[]> => {
  const response = await fetch(
    getApiUrl('/api/playlists'),
    withUserHeader({
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    }),
  )
  if (!response.ok) {
    return []
  }
  const raw: unknown = await response.json()
  const parsed = ListPlaylistsResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data.playlists : []
}

export const deletePlaylist = async (id: string): Promise<PlaylistWriteResult> => {
  const response = await fetch(
    getApiUrl(`/api/playlists/${encodeURIComponent(id)}`),
    withUserHeader({
      method: 'DELETE',
      signal: AbortSignal.timeout(15000),
    }),
  )
  return await toWriteResult(response)
}

export const renamePlaylist = async (id: string, name: string): Promise<PlaylistWriteResult> => {
  const response = await fetch(
    getApiUrl(`/api/playlists/${encodeURIComponent(id)}`),
    withUserHeader({
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(15000),
    }),
  )
  return await toWriteResult(response)
}

/**
 * One page of a saved playlist's tracks, or `undefined` when the request or
 * the response shape failed — an unparsable page must not reach the caller as
 * an empty playlist with `hasMore: false`, which reads as "nothing more here".
 */
export const getPlaylistTracks = async (
  id: string,
  limit = 250,
  offset = 0,
): Promise<PlaylistTracksPage | undefined> => {
  const response = await fetch(
    getApiUrl(
      `/api/playlists/${encodeURIComponent(id)}/tracks?limit=${String(limit)}&offset=${String(offset)}`,
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
  const parsed = PlaylistTracksResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

/**
 * Remove one track by its position. The caller must reload the page
 * afterwards: every later index has shifted down by one.
 */
export const removePlaylistTrack = async (
  id: string,
  index: number,
): Promise<PlaylistWriteResult> => {
  const response = await fetch(
    getApiUrl(`/api/playlists/${encodeURIComponent(id)}/tracks/${String(index)}`),
    withUserHeader({
      method: 'DELETE',
      signal: AbortSignal.timeout(15000),
    }),
  )
  return await toWriteResult(response)
}

export const loadPlaylist = async (id: string): Promise<boolean> => {
  const response = await fetch(
    getApiUrl('/api/playlists/load'),
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
