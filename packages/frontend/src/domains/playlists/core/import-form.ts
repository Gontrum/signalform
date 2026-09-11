import { parseTrackList } from '@signalform/shared'

export type LastFmPeriod = '7day' | '1month' | '12month' | 'overall'

export type LastFmImportSource =
  | { readonly kind: 'top-tracks'; readonly period: LastFmPeriod }
  | { readonly kind: 'loved' }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'artist'; readonly artist: string }
  | { readonly kind: 'recommended' }

export type LastFmKind = LastFmImportSource['kind']

export type ImportFormState = {
  readonly sourceMode: 'paste' | 'lastfm'
  readonly text: string
  readonly lastFmKind: LastFmKind
  readonly period: LastFmPeriod
  readonly tag: string
  readonly artist: string
  readonly limit: number
  readonly saveEnabled: boolean
  readonly saveName: string
}

/** Tracks the backend will actually attempt, and whether it silently dropped any. */
export type ImportPlan = {
  readonly candidateCount: number
  readonly truncated: boolean
  readonly estimatedSeconds: number
}

// The paste route caps the parsed list at this many tracks and drops the rest
// without reporting it.
export const PASTE_IMPORT_LIMIT = 100

// Resolution is a sequential LMS search per track, roughly half a second each.
const estimateSeconds = (candidateCount: number): number =>
  Math.max(5, Math.ceil(candidateCount * 0.5))

const toPlan = (candidateCount: number, truncated: boolean): ImportPlan => ({
  candidateCount,
  truncated,
  estimatedSeconds: estimateSeconds(candidateCount),
})

const planPaste = (text: string): ImportPlan => {
  const parsed = parseTrackList(text).tracks.length
  return toPlan(Math.min(parsed, PASTE_IMPORT_LIMIT), parsed > PASTE_IMPORT_LIMIT)
}

export const planImport = (state: ImportFormState): ImportPlan =>
  state.sourceMode === 'paste' ? planPaste(state.text) : toPlan(state.limit, false)

const isBlank = (value: string): boolean => value.trim() === ''

const hasLastFmInput = (state: ImportFormState): boolean => {
  if (state.lastFmKind === 'tag') {
    return !isBlank(state.tag)
  }
  return state.lastFmKind !== 'artist' || !isBlank(state.artist)
}

const hasSourceInput = (state: ImportFormState): boolean =>
  state.sourceMode === 'paste' ? planImport(state).candidateCount > 0 : hasLastFmInput(state)

const hasSaveName = (state: ImportFormState): boolean =>
  !state.saveEnabled || !isBlank(state.saveName)

export const isImportSubmittable = (state: ImportFormState): boolean =>
  hasSourceInput(state) && hasSaveName(state)

// The route's body schema is a discriminatedUnion of `.strict()` members, so any
// key that does not belong to the chosen kind is a 400.
export const toLastFmSource = (state: ImportFormState): LastFmImportSource => {
  const kind = state.lastFmKind
  if (kind === 'top-tracks') {
    return { kind, period: state.period }
  }
  if (kind === 'tag') {
    return { kind, tag: state.tag.trim() }
  }
  if (kind === 'artist') {
    return { kind, artist: state.artist.trim() }
  }
  return { kind }
}

export const importName = (state: ImportFormState): string | undefined => {
  const trimmed = state.saveName.trim()
  return state.saveEnabled && trimmed !== '' ? trimmed : undefined
}
