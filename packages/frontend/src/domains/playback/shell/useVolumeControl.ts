import { computed, onMounted, onUnmounted } from 'vue'
import type { ComputedRef } from 'vue'
import { debounce } from 'lodash-es'
import { usePlaybackStore } from './usePlaybackStore'

const VOLUME_DEBOUNCE_MS = 300

type UseVolumeControlResult = {
  readonly isLoading: ComputedRef<boolean>
  readonly currentVolume: ComputedRef<number | null>
  readonly isMuted: ComputedRef<boolean>
  readonly handleVolumeChange: (event: Event) => void
  readonly handleToggleMute: () => Promise<void>
}

export const useVolumeControl = (): UseVolumeControlResult => {
  const playbackStore = usePlaybackStore()
  const isLoading = computed(() => playbackStore.isLoading)
  const currentVolume = computed(() => playbackStore.currentVolume)
  const isMuted = computed(() => playbackStore.isMuted)

  const debouncedSetVolume = debounce(async (level: number) => {
    await playbackStore.setVolume(level)
  }, VOLUME_DEBOUNCE_MS)

  const handleVolumeChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement)) {
      return
    }

    const level = Number(event.target.value)
    playbackStore.setVolumeOptimistic(level)
    void debouncedSetVolume(level)
  }

  const handleToggleMute = async (): Promise<void> => {
    await playbackStore.toggleMute()
  }

  onMounted(async () => {
    await playbackStore.fetchCurrentVolume()
  })

  onUnmounted(() => {
    debouncedSetVolume.cancel()
  })

  return {
    isLoading,
    currentVolume,
    isMuted,
    handleVolumeChange,
    handleToggleMute,
  }
}
