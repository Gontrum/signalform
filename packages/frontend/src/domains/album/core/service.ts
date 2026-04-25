import type { AlbumDetailResponse, AlbumDetailStatus, AlbumTrack } from './types'

export const getAlbumIdParam = (value: unknown): string => (typeof value === 'string' ? value : '')

export const getHistoryString = (value: unknown): string => (typeof value === 'string' ? value : '')

export const getHistoryStringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export const parseTidalAudioQuality = (url: string): AlbumTrack['audioQuality'] | undefined => {
  if (url.endsWith('.flc')) {
    return { format: 'FLAC', bitrate: 1411000, sampleRate: 44100, lossless: true }
  }
  if (url.endsWith('.m4a')) {
    return { format: 'AAC', bitrate: 320000, sampleRate: 44100, lossless: false }
  }
  return undefined
}

export const toTidalSearchFallbackAlbum = ({
  title,
  artist,
  coverArtUrl,
  trackUrls,
  trackTitles,
}: {
  readonly title: string
  readonly artist: string
  readonly coverArtUrl: string | null
  readonly trackUrls: ReadonlyArray<string>
  readonly trackTitles: ReadonlyArray<string>
}): AlbumDetailResponse => ({
  id: 'tidal-search',
  title,
  artist,
  releaseYear: null,
  coverArtUrl,
  tracks: trackUrls.map((url, index) => ({
    id: url,
    trackNumber: index + 1,
    title: trackTitles[index] || `Track ${index + 1}`,
    artist: '',
    duration: 0,
    url,
    audioQuality: parseTidalAudioQuality(url),
  })),
})

export const getAlbumErrorStatus = (
  errorType: AlbumDetailStatus | 'NOT_FOUND' | string,
): 'error-not-found' | 'error-server' =>
  errorType === 'NOT_FOUND' ? 'error-not-found' : 'error-server'

export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) {
    return '--:--'
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${String(minutes)}:${String(remainder).padStart(2, '0')}`
}

export const detectSource = (url: string): 'local' | 'qobuz' | 'tidal' | 'unknown' => {
  if (url.startsWith('file://')) {
    return 'local'
  }
  if (url.startsWith('qobuz://')) {
    return 'qobuz'
  }
  if (url.startsWith('tidal://')) {
    return 'tidal'
  }
  return 'unknown'
}
