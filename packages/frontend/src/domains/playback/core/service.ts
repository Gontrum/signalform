import type { PlayerStatusPayload, PlayerTrackChangedPayload } from '@signalform/shared'
import { SOURCE_LABELS } from '@/utils/sourceInfo'
import type { PlaybackStatus, TrackInfo } from './types'

type PlaybackState = {
  readonly isPlaying: boolean
  readonly isPaused: boolean
}

export const getPlaybackState = (status: PlaybackStatus): PlaybackState => {
  if (status === 'playing') {
    return { isPlaying: true, isPaused: false }
  }

  if (status === 'paused') {
    return { isPlaying: false, isPaused: true }
  }

  return { isPlaying: false, isPaused: false }
}

export const normalizeCurrentTime = (status: PlaybackStatus, currentTime: number): number =>
  status === 'stopped' ? 0 : currentTime

export const mapStatusTrackToTrackInfo = (
  track: NonNullable<PlayerStatusPayload['currentTrack']>,
): TrackInfo => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  url: track.sources[0]?.url ?? '',
  duration: track.duration,
  source: track.sources[0]?.source,
  audioQuality: track.sources[0]?.quality,
  coverArtUrl: track.coverArtUrl,
  artistId: track.artistId,
  albumId: track.albumId,
})

export const mapTrackChangedToTrackInfo = (
  track: PlayerTrackChangedPayload['track'],
): TrackInfo => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  url: track.sources[0]?.url ?? '',
  duration: track.duration,
  source: track.sources[0]?.source,
  audioQuality: track.sources[0]?.quality,
  coverArtUrl: track.coverArtUrl,
  artistId: track.artistId,
  albumId: track.albumId,
})

export const calculateProgressPercent = (
  currentTime: number,
  trackDuration: number | null,
): number => {
  if (!trackDuration || trackDuration === 0) {
    return 0
  }

  return (currentTime / trackDuration) * 100
}

export const createTrackAnnouncement = (track: TrackInfo | null): string => {
  if (track === null) {
    return ''
  }

  return `Now playing: ${track.title} by ${track.artist}`
}

export const createAlsoAvailableText = (track: TrackInfo | null): string => {
  if (!track?.availableSources || track.availableSources.length <= 1) {
    return ''
  }

  const otherSources = track.availableSources
    .filter((source) => source.source !== track.source)
    .map((source) => SOURCE_LABELS[source.source] ?? 'Unknown')

  return otherSources.length > 0 ? `Also available on: ${otherSources.join(', ')}` : ''
}

export const validateVolumeLevel = (level: number): string | null => {
  if (level < 0 || level > 100) {
    return 'Volume must be between 0 and 100'
  }

  return null
}

export const validateSeekPosition = (
  seconds: number,
  trackDuration: number | null,
): string | null => {
  if (!trackDuration || trackDuration <= 0) {
    return 'Cannot seek: track duration unknown'
  }

  if (seconds < 0) {
    return 'Seek position must be >= 0'
  }

  if (seconds > trackDuration) {
    return 'Seek position exceeds track duration'
  }

  return null
}

export const calculateSeekTimeFromOffset = (
  offset: number,
  width: number,
  trackDuration: number | null,
): number => {
  const duration = trackDuration ?? 0
  const percent = Math.max(0, Math.min(1, offset / width))
  return Math.floor(percent * duration)
}
