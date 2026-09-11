import { z } from 'zod'
import type { LastFmImportSource } from '@/domains/playlists/core/import-form'
import { getApiUrl } from '@/utils/runtimeUrls'
import { withUserHeader } from '@/platform/api/userHeader'

export type { LastFmImportSource } from '@/domains/playlists/core/import-form'

export type PlaylistImportOk = {
  readonly ok: true
  readonly imported: number
  readonly missing: readonly string[]
  readonly total: number
  readonly skippedLines: number
}

/**
 * `status` is absent when the request never produced a response (network
 * failure, timeout abort) or the body was unparsable — the caller must not
 * read that as a specific server verdict. `message` is the route's own `error`
 * string, which distinguishes the several causes that share one status.
 */
export type PlaylistImportErr = {
  readonly ok: false
  readonly status?: number
  readonly message?: string
}

export type PlaylistImportOutcome = PlaylistImportOk | PlaylistImportErr

const PlaylistImportResponseSchema = z.object({
  imported: z.number(),
  missing: z.array(z.string()),
  skippedLines: z.number(),
})

const LastFmImportResponseSchema = z.object({
  imported: z.number(),
  missing: z.array(z.string()),
  totalCandidates: z.number(),
})

const ErrorBodySchema = z.object({ error: z.string() })

const readErrorMessage = async (response: Response): Promise<string | undefined> => {
  try {
    const raw: unknown = await response.json()
    const parsed = ErrorBodySchema.safeParse(raw)
    return parsed.success ? parsed.data.error : undefined
  } catch {
    return undefined
  }
}

// Resolution is a sequential LMS search per track (~200-500ms each); with the
// backend's default limit of 100 tracks that is up to ~50s worst case, far
// past this codebase's usual 15-30s API timeout.
const IMPORT_TIMEOUT_MS = 120000

type FromLastFmBody = {
  readonly source: LastFmImportSource['kind']
  readonly limit: number
  readonly name?: string
  readonly period?: string
  readonly tag?: string
  readonly artist?: string
}

// The route's body schema is a discriminatedUnion of `.strict()` members, so
// any key that does not belong to the chosen source is a 400.
const toFromLastFmBody = (
  source: LastFmImportSource,
  limit: number,
  name?: string,
): FromLastFmBody => {
  const base = { limit, ...(name === undefined ? {} : { name }) }
  if (source.kind === 'top-tracks') {
    return { source: 'top-tracks', period: source.period, ...base }
  }
  if (source.kind === 'tag') {
    return { source: 'tag', tag: source.tag, ...base }
  }
  if (source.kind === 'artist') {
    return { source: 'artist', artist: source.artist, ...base }
  }
  return { source: source.kind, ...base }
}

export const importPlaylist = async (
  text: string,
  name?: string,
): Promise<PlaylistImportOutcome> => {
  try {
    const response = await fetch(
      getApiUrl('/api/playlists/import'),
      withUserHeader({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(name === undefined ? { text } : { text, name }),
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      }),
    )
    if (!response.ok) {
      return { ok: false, status: response.status }
    }
    const raw: unknown = await response.json()
    const parsed = PlaylistImportResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false }
    }
    const { imported, missing, skippedLines } = parsed.data
    return {
      ok: true,
      imported,
      missing,
      total: imported + missing.length,
      skippedLines,
    }
  } catch {
    return { ok: false }
  }
}

export const importPlaylistFromLastFm = async (
  source: LastFmImportSource,
  limit: number,
  name?: string,
): Promise<PlaylistImportOutcome> => {
  try {
    const response = await fetch(
      getApiUrl('/api/playlists/from-lastfm'),
      withUserHeader({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toFromLastFmBody(source, limit, name)),
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      }),
    )
    if (!response.ok) {
      const message = await readErrorMessage(response)
      return {
        ok: false,
        status: response.status,
        ...(message === undefined ? {} : { message }),
      }
    }
    const raw: unknown = await response.json()
    const parsed = LastFmImportResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false }
    }
    const { imported, missing, totalCandidates } = parsed.data
    return {
      ok: true,
      imported,
      missing,
      total: totalCandidates,
      skippedLines: 0,
    }
  } catch {
    return { ok: false }
  }
}
