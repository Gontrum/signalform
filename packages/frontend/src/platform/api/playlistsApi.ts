import { z } from 'zod'
import { getApiUrl } from '@/utils/runtimeUrls'
import { withUserHeader } from '@/platform/api/userHeader'

export type SavedPlaylist = {
  readonly id: string
  readonly name: string
}

const SavedPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const ListPlaylistsResponseSchema = z.object({
  playlists: z.array(SavedPlaylistSchema),
})

export const savePlaylist = async (name: string): Promise<boolean> => {
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
  return response.ok
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
