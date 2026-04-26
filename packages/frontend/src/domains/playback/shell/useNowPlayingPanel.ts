import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { SOURCE_TOOLTIP_TEXT } from '@/utils/sourceInfo'
import { createAlsoAvailableText, createTrackAnnouncement } from '@/domains/playback/core/service'
import { usePlaybackStore } from './usePlaybackStore'

const ERROR_DISMISS_TIMEOUT_MS = 5000

type UseNowPlayingPanelResult = {
  readonly playbackStore: ReturnType<typeof usePlaybackStore>
  readonly sourceTooltip: ComputedRef<string>
  readonly trackAnnouncement: ComputedRef<string>
  readonly alsoAvailableText: ComputedRef<string>
  readonly navigateToArtist: () => void
  readonly navigateToAlbum: () => void
  readonly navigateToQueue: () => void
}

export const useNowPlayingPanel = (): UseNowPlayingPanelResult => {
  const router = useRouter()
  const playbackStore = usePlaybackStore()

  watch(
    () => playbackStore.error,
    (error, _oldValue, onCleanup) => {
      if (error) {
        const timeoutId = setTimeout(() => {
          playbackStore.clearError()
        }, ERROR_DISMISS_TIMEOUT_MS)

        onCleanup(() => clearTimeout(timeoutId))
      }
    },
  )

  const navigateToArtist = (): void => {
    const artist = playbackStore.currentTrack?.artist
    if (artist) {
      void router.push({ name: 'unified-artist', query: { name: artist } })
    }
  }

  const navigateToAlbum = (): void => {
    const albumId = playbackStore.currentTrack?.albumId
    if (albumId) {
      void router.push({ name: 'album-detail', params: { albumId } })
    }
  }

  const navigateToQueue = (): void => {
    void router.push({ name: 'queue' })
  }

  const sourceTooltip = computed((): string => {
    const source = playbackStore.currentTrack?.source
    return source ? (SOURCE_TOOLTIP_TEXT[source] ?? 'Source unknown') : ''
  })

  const trackAnnouncement = computed((): string =>
    createTrackAnnouncement(playbackStore.currentTrack),
  )
  const alsoAvailableText = computed((): string =>
    createAlsoAvailableText(playbackStore.currentTrack),
  )

  return {
    playbackStore,
    sourceTooltip,
    trackAnnouncement,
    alsoAvailableText,
    navigateToArtist,
    navigateToAlbum,
    navigateToQueue,
  }
}
