import { computed, onBeforeUnmount, ref } from 'vue'
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
  const previewTime = ref<number | null>(null)
  const activeGestureCleanup = ref<(() => void) | null>(null)

  const displayedTime = computed(() => previewTime.value ?? currentTime.value)

  const progressPercent = computed(() =>
    calculateProgressPercent(displayedTime.value, trackDuration.value),
  )
  const formattedTime = computed(() =>
    formatProgress(displayedTime.value, trackDuration.value ?? 0),
  )

  const clearActiveGesture = (): void => {
    activeGestureCleanup.value?.()
    activeGestureCleanup.value = null
  }

  const setPreviewFromOffset = (offset: number, width: number): void => {
    previewTime.value = calculateSeekTimeFromOffset(offset, width, trackDuration.value)
  }

  const commitPreviewSeek = (): void => {
    const nextSeekTime = previewTime.value
    previewTime.value = null

    if (nextSeekTime === null) {
      return
    }

    void playbackStore.seekToPosition(nextSeekTime)
  }

  const handleMouseDown = (event: MouseEvent): void => {
    if (isLoading.value || !(event.currentTarget instanceof HTMLElement)) {
      return
    }

    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    setPreviewFromOffset(event.clientX - rect.left, rect.width)

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      setPreviewFromOffset(moveEvent.clientX - rect.left, rect.width)
    }

    const handleMouseUp = (): void => {
      clearActiveGesture()
      commitPreviewSeek()
    }

    clearActiveGesture()
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    activeGestureCleanup.value = (): void => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }

  const handleTouchStart = (event: TouchEvent): void => {
    if (isLoading.value || !(event.currentTarget instanceof HTMLElement)) {
      return
    }

    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    setPreviewFromOffset(event.touches[0]!.clientX - rect.left, rect.width)

    const handleTouchMove = (moveEvent: TouchEvent): void => {
      setPreviewFromOffset(moveEvent.touches[0]!.clientX - rect.left, rect.width)
    }

    const handleTouchEnd = (): void => {
      clearActiveGesture()
      commitPreviewSeek()
    }

    clearActiveGesture()
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleTouchEnd)
    activeGestureCleanup.value = (): void => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    const seekStep = 5

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        void playbackStore.seekToPosition(Math.max(0, currentTime.value - seekStep))
        break
      case 'ArrowRight':
        event.preventDefault()
        void playbackStore.seekToPosition(
          Math.min(trackDuration.value ?? 0, currentTime.value + seekStep),
        )
        break
      case 'Home':
        event.preventDefault()
        void playbackStore.seekToPosition(0)
        break
      case 'End':
        event.preventDefault()
        void playbackStore.seekToPosition(trackDuration.value ?? 0)
        break
    }
  }

  onBeforeUnmount(() => {
    clearActiveGesture()
  })

  return {
    currentTime: displayedTime,
    trackDuration,
    isLoading,
    progressPercent,
    formattedTime,
    handleMouseDown,
    handleTouchStart,
    handleKeyDown,
  }
}
