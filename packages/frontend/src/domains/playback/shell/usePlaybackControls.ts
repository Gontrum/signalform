import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { MessageKey } from '@/i18n'
import { usePlaybackStore } from './usePlaybackStore'

type UsePlaybackControlsResult = {
  readonly playbackStore: ReturnType<typeof usePlaybackStore>
  readonly canSkipPrevious: ComputedRef<boolean>
  readonly canSkipNext: ComputedRef<boolean>
  readonly isShuffleActive: ComputedRef<boolean>
  readonly isRepeatActive: ComputedRef<boolean>
  readonly shuffleLabelKey: ComputedRef<MessageKey>
  readonly repeatLabelKey: ComputedRef<MessageKey>
  readonly handlePlayPause: () => Promise<void>
  readonly handlePrevious: () => Promise<void>
  readonly handleNext: () => Promise<void>
  readonly handleShuffle: () => Promise<void>
  readonly handleRepeat: () => Promise<void>
}

export const usePlaybackControls = (): UsePlaybackControlsResult => {
  const playbackStore = usePlaybackStore()

  const canSkipPrevious = computed(() => playbackStore.hasCurrentTrack && !playbackStore.isLoading)
  const canSkipNext = computed(() => playbackStore.hasCurrentTrack && !playbackStore.isLoading)

  const isShuffleActive = computed(() => playbackStore.shuffleMode !== 'off')
  const isRepeatActive = computed(() => playbackStore.repeatMode !== 'off')

  const shuffleLabelKey = computed<MessageKey>(
    () => `nowPlaying.shuffle.${playbackStore.shuffleMode}`,
  )
  const repeatLabelKey = computed<MessageKey>(() => `nowPlaying.repeat.${playbackStore.repeatMode}`)

  const handlePlayPause = async (): Promise<void> => {
    if (playbackStore.isPaused) {
      await playbackStore.resume()
      return
    }

    if (playbackStore.isPlaying) {
      await playbackStore.pause()
      return
    }

    if (playbackStore.hasCurrentTrack) {
      await playbackStore.resume()
    }
  }

  const handlePrevious = async (): Promise<void> => {
    await playbackStore.skipToPrevious()
  }

  const handleNext = async (): Promise<void> => {
    await playbackStore.skipToNext()
  }

  const handleShuffle = async (): Promise<void> => {
    await playbackStore.cycleShuffleMode()
  }

  const handleRepeat = async (): Promise<void> => {
    await playbackStore.cycleRepeatMode()
  }

  return {
    playbackStore,
    canSkipPrevious,
    canSkipNext,
    isShuffleActive,
    isRepeatActive,
    shuffleLabelKey,
    repeatLabelKey,
    handlePlayPause,
    handlePrevious,
    handleNext,
    handleShuffle,
    handleRepeat,
  }
}
