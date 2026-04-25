import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { formatProgress } from '@signalform/shared'
import {
  calculateProgressPercent,
  calculateSeekTimeFromOffset,
} from '@/domains/playback/core/service'
import { usePlaybackStore } from './usePlaybackStore'

type UseProgressBarResult = {
  readonly currentTime: Ref<number>
  readonly trackDuration: Ref<number | null>
  readonly isLoading: Ref<boolean>
  readonly progressPercent: ComputedRef<number>
  readonly formattedTime: ComputedRef<string>
  readonly handleMouseDown: (event: MouseEvent) => void
  readonly handleTouchStart: (event: TouchEvent) => void
  readonly handleKeyDown: (event: KeyboardEvent) => void
}

export const useProgressBar = (): UseProgressBarResult => {
  const playbackStore = usePlaybackStore()
  const { currentTime, trackDuration, isLoading } = storeToRefs(playbackStore)
  const isThrottling = ref(false)

  const progressPercent = computed(() =>
    calculateProgressPercent(currentTime.value, trackDuration.value),
  )
  const formattedTime = computed(() => formatProgress(currentTime.value, trackDuration.value ?? 0))

  const handleSeek = async (seconds: number): Promise<void> => {
    if (isThrottling.value) {
      return
    }

    isThrottling.value = true
    await playbackStore.seekToPosition(seconds)

    setTimeout(() => {
      isThrottling.value = false
    }, 100)
  }

  const handleMouseDown = (event: MouseEvent): void => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return
    }

    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    void handleSeek(
      calculateSeekTimeFromOffset(event.clientX - rect.left, rect.width, trackDuration.value),
    )

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      void handleSeek(
        calculateSeekTimeFromOffset(moveEvent.clientX - rect.left, rect.width, trackDuration.value),
      )
    }

    const handleMouseUp = (): void => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleTouchStart = (event: TouchEvent): void => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return
    }

    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const calculateTouchSeekTime = (touchEvent: TouchEvent): number =>
      calculateSeekTimeFromOffset(
        touchEvent.touches[0]!.clientX - rect.left,
        rect.width,
        trackDuration.value,
      )

    void handleSeek(calculateTouchSeekTime(event))

    const handleTouchMove = (moveEvent: TouchEvent): void => {
      void handleSeek(calculateTouchSeekTime(moveEvent))
    }

    const handleTouchEnd = (): void => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }

    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleTouchEnd)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    const seekStep = 5

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        void handleSeek(Math.max(0, currentTime.value - seekStep))
        break
      case 'ArrowRight':
        event.preventDefault()
        void handleSeek(Math.min(trackDuration.value ?? 0, currentTime.value + seekStep))
        break
      case 'Home':
        event.preventDefault()
        void handleSeek(0)
        break
      case 'End':
        event.preventDefault()
        void handleSeek(trackDuration.value ?? 0)
        break
    }
  }

  return {
    currentTime,
    trackDuration,
    isLoading,
    progressPercent,
    formattedTime,
    handleMouseDown,
    handleTouchStart,
    handleKeyDown,
  }
}
