import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ComputedRef } from 'vue'
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

  const volumeTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  const cancelPendingVolume = (): void => {
    if (volumeTimer.value !== null) {
      clearTimeout(volumeTimer.value)
      volumeTimer.value = null
    }
  }

  const handleVolumeChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement)) {
      return
    }

    const level = Number(event.target.value)
    playbackStore.setVolumeOptimistic(level)

    cancelPendingVolume()
    volumeTimer.value = setTimeout(() => {
      volumeTimer.value = null
      void playbackStore.setVolume(level)
    }, VOLUME_DEBOUNCE_MS)
  }

  const handleToggleMute = async (): Promise<void> => {
    await playbackStore.toggleMute()
  }

  onMounted(async () => {
    await playbackStore.fetchCurrentVolume()
  })

  onUnmounted(() => {
    cancelPendingVolume()
  })

  return {
    isLoading,
    currentVolume,
    isMuted,
    handleVolumeChange,
    handleToggleMute,
  }
}
