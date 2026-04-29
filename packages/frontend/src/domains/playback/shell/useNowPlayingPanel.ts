import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { SOURCE_TOOLTIP_TEXT } from '@/utils/sourceInfo'
import { createAlsoAvailableText, createTrackAnnouncement } from '@/domains/playback/core/service'
import { usePlaybackStore } from './usePlaybackStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'

const ERROR_DISMISS_TIMEOUT_MS = 5000

type UseNowPlayingPanelResult = {
  readonly playbackStore: ReturnType<typeof usePlaybackStore>
  readonly queuedTracks: ComputedRef<
    readonly { readonly id: string; readonly title: string; readonly artist: string }[]
  >
  readonly sourceTooltip: ComputedRef<string>
  readonly trackAnnouncement: ComputedRef<string>
  readonly alsoAvailableText: ComputedRef<string>
  readonly shouldShowInlineQueueAction: ComputedRef<boolean>
  readonly navigateToArtist: () => void
  readonly navigateToAlbum: () => void
  readonly navigateToQueue: () => void
}

export const useNowPlayingPanel = (): UseNowPlayingPanelResult => {
  const router = useRouter()
  const playbackStore = usePlaybackStore()
  const { isPhone } = useResponsiveLayout()

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

  const queuedTracks = computed(() =>
    playbackStore.queuePreview.slice(0, 3).map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
    })),
  )

  const trackAnnouncement = computed((): string =>
    createTrackAnnouncement(playbackStore.currentTrack),
  )
  const alsoAvailableText = computed((): string =>
    createAlsoAvailableText(playbackStore.currentTrack),
  )
  const shouldShowInlineQueueAction = computed((): boolean => !isPhone.value)

  return {
    playbackStore,
    queuedTracks,
    sourceTooltip,
    trackAnnouncement,
    alsoAvailableText,
    shouldShowInlineQueueAction,
    navigateToArtist,
    navigateToAlbum,
    navigateToQueue,
  }
}
