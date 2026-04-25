import { computed, onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import {
  getQueueDropIndicatorLabel,
  isQueueDropTarget,
  isQueueRowBusy,
  parseQueueTrackIndex,
} from '../core/service'

type UseQueueDragArgs = {
  readonly isJumping: Ref<boolean>
  readonly isMutatingQueue: Ref<boolean>
  readonly removeBusyTrackId: Ref<string | null>
  readonly reorderBusyTrackId: Ref<string | null>
  readonly reorderTrack: (trackId: string, fromIndex: number, toIndex: number) => Promise<void>
  readonly dropMessages: {
    readonly before: string
    readonly after: string
  }
}

type UseQueueDragResult = {
  readonly dragFromIndex: Ref<number | null>
  readonly dragOverIndex: Ref<number | null>
  readonly dragTrackId: Ref<string | null>
  readonly isTouchDragging: Ref<boolean>
  readonly isDragActive: Readonly<Ref<boolean>>
  readonly clearDragState: () => void
  readonly startMouseDrag: (event: MouseEvent, trackId: string, trackIndex: number) => void
  readonly startTouchDrag: (event: TouchEvent, trackId: string, trackIndex: number) => void
  readonly isRowBusy: (trackId: string) => boolean
  readonly isDropTarget: (trackIndex: number) => boolean
  readonly getDropIndicatorLabel: (trackIndex: number) => string | null
  readonly scrollBoundaryIntoView: (el: Element | ComponentPublicInstance | null) => void
}

export const useQueueDrag = ({
  isJumping,
  isMutatingQueue,
  removeBusyTrackId,
  reorderBusyTrackId,
  reorderTrack,
  dropMessages,
}: UseQueueDragArgs): UseQueueDragResult => {
  const touchMoveListenerOptions: AddEventListenerOptions = { passive: false }
  const dragFromIndex = ref<number | null>(null)
  const dragOverIndex = ref<number | null>(null)
  const dragTrackId = ref<string | null>(null)
  const isTouchDragging = ref(false)

  const isDragActive = computed(() => dragFromIndex.value !== null)

  const clearDragState = (): void => {
    dragFromIndex.value = null
    dragOverIndex.value = null
    dragTrackId.value = null
    isTouchDragging.value = false
  }

  const getTrackIndexFromElement = (element: Element | null): number | null => {
    if (!(element instanceof HTMLElement)) {
      return null
    }

    return parseQueueTrackIndex(element.dataset.trackIndex)
  }

  const getTrackElementFromPoint = (clientX: number, clientY: number): HTMLElement | null => {
    const element = document.elementFromPoint(clientX, clientY)
    if (!(element instanceof HTMLElement)) {
      return null
    }

    return element.closest<HTMLElement>('[data-testid="queue-track"]')
  }

  const updateDragTargetFromPoint = (clientX: number, clientY: number): void => {
    const target = getTrackElementFromPoint(clientX, clientY)
    const targetIndex = getTrackIndexFromElement(target)

    if (targetIndex !== null) {
      dragOverIndex.value = targetIndex
    }
  }

  const commitReorder = (): void => {
    const fromIndex = dragFromIndex.value
    const toIndex = dragOverIndex.value
    const trackId = dragTrackId.value

    if (fromIndex === null || toIndex === null || trackId === null || fromIndex === toIndex) {
      clearDragState()
      return
    }

    clearDragState()
    void reorderTrack(trackId, fromIndex, toIndex)
  }

  const handleDocumentMouseMove = (event: MouseEvent): void => {
    updateDragTargetFromPoint(event.clientX, event.clientY)
  }

  const handleDocumentMouseUp = (): void => {
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', handleDocumentMouseUp)
    commitReorder()
  }

  const handleDocumentTouchMove = (event: TouchEvent): void => {
    event.preventDefault()

    const touch = event.touches[0]
    if (touch === undefined) {
      return
    }

    updateDragTargetFromPoint(touch.clientX, touch.clientY)
  }

  const handleDocumentTouchEnd = (): void => {
    document.removeEventListener('touchmove', handleDocumentTouchMove, touchMoveListenerOptions)
    document.removeEventListener('touchend', handleDocumentTouchEnd)
    document.removeEventListener('touchcancel', handleDocumentTouchEnd)
    commitReorder()
  }

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', handleDocumentMouseUp)
    document.removeEventListener('touchmove', handleDocumentTouchMove, touchMoveListenerOptions)
    document.removeEventListener('touchend', handleDocumentTouchEnd)
    document.removeEventListener('touchcancel', handleDocumentTouchEnd)
  })

  const startMouseDrag = (event: MouseEvent, trackId: string, trackIndex: number): void => {
    if (isMutatingQueue.value || isJumping.value) {
      return
    }

    event.preventDefault()
    dragFromIndex.value = trackIndex
    dragOverIndex.value = trackIndex
    dragTrackId.value = trackId
    isTouchDragging.value = false

    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)
  }

  const startTouchDrag = (event: TouchEvent, trackId: string, trackIndex: number): void => {
    if (isMutatingQueue.value || isJumping.value) {
      return
    }

    event.preventDefault()

    const touch = event.touches[0]
    if (touch === undefined) {
      return
    }

    dragFromIndex.value = trackIndex
    dragOverIndex.value = trackIndex
    dragTrackId.value = trackId
    isTouchDragging.value = true
    updateDragTargetFromPoint(touch.clientX, touch.clientY)

    document.addEventListener('touchmove', handleDocumentTouchMove, touchMoveListenerOptions)
    document.addEventListener('touchend', handleDocumentTouchEnd)
    document.addEventListener('touchcancel', handleDocumentTouchEnd)
  }

  const isRowBusy = (trackId: string): boolean =>
    isQueueRowBusy(trackId, removeBusyTrackId.value, reorderBusyTrackId.value)

  const isDropTarget = (trackIndex: number): boolean =>
    isQueueDropTarget(trackIndex, dragOverIndex.value, dragFromIndex.value)

  const getDropIndicatorLabel = (trackIndex: number): string | null =>
    getQueueDropIndicatorLabel(trackIndex, dragOverIndex.value, dragFromIndex.value, dropMessages)

  const scrollBoundaryIntoView = (el: Element | ComponentPublicInstance | null): void => {
    if (el instanceof HTMLElement) {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }
  }

  return {
    dragFromIndex,
    dragOverIndex,
    dragTrackId,
    isTouchDragging,
    isDragActive,
    clearDragState,
    startMouseDrag,
    startTouchDrag,
    isRowBusy,
    isDropTarget,
    getDropIndicatorLabel,
    scrollBoundaryIntoView,
  }
}
