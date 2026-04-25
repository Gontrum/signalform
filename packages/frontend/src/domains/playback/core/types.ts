import type { AudioQuality } from '@signalform/shared'
import type { AvailableSource } from '@/domains/search/core/types'

export type PlaybackStatus = 'playing' | 'paused' | 'stopped'

export interface TrackInfo {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly url: string
  readonly duration?: number
  readonly source?: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly audioQuality?: AudioQuality
  readonly availableSources?: readonly AvailableSource[]
  readonly coverArtUrl?: string
  readonly artistId?: string
  readonly albumId?: string
}
