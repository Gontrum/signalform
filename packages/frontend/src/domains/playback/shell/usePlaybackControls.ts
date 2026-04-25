import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { usePlaybackStore } from './usePlaybackStore'

type UsePlaybackControlsResult = {
  readonly playbackStore: ReturnType<typeof usePlaybackStore>
  readonly canSkipPrevious: ComputedRef<boolean>
  readonly canSkipNext: ComputedRef<boolean>
  readonly handlePlayPause: () => Promise<void>
  readonly handlePrevious: () => Promise<void>
  readonly handleNext: () => Promise<void>
}

export const usePlaybackControls = (): UsePlaybackControlsResult => {
  const playbackStore = usePlaybackStore()

  const canSkipPrevious = computed(() => playbackStore.hasCurrentTrack && !playbackStore.isLoading)
  const canSkipNext = computed(() => playbackStore.hasCurrentTrack && !playbackStore.isLoading)

  const handlePlayPause = async (): Promise<void> => {
    if (playbackStore.isPaused) {
      await playbackStore.resume()
      return
    }

    if (playbackStore.isPlaying) {
      await playbackStore.pause()
    }
  }

  const handlePrevious = async (): Promise<void> => {
    await playbackStore.skipToPrevious()
  }

  const handleNext = async (): Promise<void> => {
    await playbackStore.skipToNext()
  }

  return {
    playbackStore,
    canSkipPrevious,
    canSkipNext,
    handlePlayPause,
    handlePrevious,
    handleNext,
  }
}
