import { ref } from 'vue'
import type { Ref } from 'vue'
import { importPlaylist, importPlaylistFromLastFm } from '@/platform/api/playlistImportApi'
import type {
  LastFmImportSource,
  PlaylistImportErr,
  PlaylistImportOutcome,
} from '@/platform/api/playlistImportApi'
import { useQueueStore } from '@/domains/queue/shell/useQueueStore'

export type PlaylistImportErrorKind = 'failed' | 'lastfm-not-configured' | 'lastfm-unavailable'

export type PlaylistImportResultState = {
  readonly imported: number
  readonly missing: readonly string[]
  readonly total: number
  readonly skippedLines: number
  readonly savedAs?: string
}

type UsePlaylistImportResult = {
  readonly isImporting: Ref<boolean>
  readonly result: Ref<PlaylistImportResultState | undefined>
  readonly errorKind: Ref<PlaylistImportErrorKind | undefined>
  readonly submitText: (text: string, name?: string) => Promise<void>
  readonly submitLastFm: (source: LastFmImportSource, limit: number, name?: string) => Promise<void>
}

const normalizeName = (name: string | undefined): string | undefined => {
  if (name === undefined) {
    return undefined
  }
  const trimmed = name.trim()
  return trimmed === '' ? undefined : trimmed
}

type ToErrorKind = (failure: PlaylistImportErr) => PlaylistImportErrorKind

// The route answers 400 for a rejected body and an unreadable config too, so
// only these two messages mean the user has a setting to add.
const NOT_CONFIGURED_MESSAGES: readonly string[] = [
  'No Last.fm username configured',
  'No Last.fm session configured for this user',
]

const toLastFmErrorKind: ToErrorKind = (failure) => {
  if (failure.status === 503) {
    return 'lastfm-unavailable'
  }
  const isNotConfigured =
    failure.status === 400 &&
    failure.message !== undefined &&
    NOT_CONFIGURED_MESSAGES.includes(failure.message)
  return isNotConfigured ? 'lastfm-not-configured' : 'failed'
}

export const usePlaylistImport = (): UsePlaylistImportResult => {
  const isImporting = ref(false)
  const result = ref<PlaylistImportResultState | undefined>(undefined)
  const errorKind = ref<PlaylistImportErrorKind | undefined>(undefined)

  const queueStore = useQueueStore()

  const apply = async (
    outcome: PlaylistImportOutcome,
    name: string | undefined,
    toErrorKind: ToErrorKind,
  ): Promise<void> => {
    if (!outcome.ok) {
      errorKind.value = toErrorKind(outcome)
      return
    }

    result.value = {
      imported: outcome.imported,
      missing: outcome.missing,
      total: outcome.total,
      skippedLines: outcome.skippedLines,
      // A save with nothing to save did not happen.
      ...(name !== undefined && outcome.imported > 0 ? { savedAs: name } : {}),
    }
    if (outcome.imported > 0) {
      await queueStore.fetchQueue()
    }
  }

  const run = async (
    call: (name: string | undefined) => Promise<PlaylistImportOutcome>,
    rawName: string | undefined,
    toErrorKind: ToErrorKind,
  ): Promise<void> => {
    if (isImporting.value) {
      return
    }

    errorKind.value = undefined
    result.value = undefined
    isImporting.value = true
    try {
      const name = normalizeName(rawName)
      await apply(await call(name), name, toErrorKind)
    } finally {
      isImporting.value = false
    }
  }

  const submitText = async (text: string, name?: string): Promise<void> => {
    await run(
      async (resolvedName) => await importPlaylist(text, resolvedName),
      name,
      () => 'failed',
    )
  }

  const submitLastFm = async (
    source: LastFmImportSource,
    limit: number,
    name?: string,
  ): Promise<void> => {
    await run(
      async (resolvedName) => await importPlaylistFromLastFm(source, limit, resolvedName),
      name,
      toLastFmErrorKind,
    )
  }

  return {
    isImporting,
    result,
    errorKind,
    submitText,
    submitLastFm,
  }
}
