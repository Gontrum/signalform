import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { useI18nStore } from '@/app/i18nStore'
import { usePlaybackStore } from './usePlaybackStore'

type UsePhonePlaybackShortcutResult = {
  readonly playbackStore: ReturnType<typeof usePlaybackStore>
  readonly hasQueuedTracks: ComputedRef<boolean>
  readonly shouldShowPhonePlaybackShortcut: ComputedRef<boolean>
  readonly phonePlaybackShortcutLabel: ComputedRef<string>
}

export const usePhonePlaybackShortcut = (): UsePhonePlaybackShortcutResult => {
  const { isPhone } = useResponsiveLayout()
  const i18nStore = useI18nStore()
  const playbackStore = usePlaybackStore()
  const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

  const hasQueuedTracks = computed(() => playbackStore.queuePreview.length > 0)
  const shouldShowPhonePlaybackShortcut = computed(
    () => isPhone.value && (playbackStore.hasCurrentTrack || hasQueuedTracks.value),
  )
  const phonePlaybackShortcutLabel = computed(() =>
    playbackStore.hasCurrentTrack ? 'Open Now Playing' : t('nowPlaying.viewFullQueue'),
  )

  return {
    playbackStore,
    hasQueuedTracks,
    shouldShowPhonePlaybackShortcut,
    phonePlaybackShortcutLabel,
  }
}
