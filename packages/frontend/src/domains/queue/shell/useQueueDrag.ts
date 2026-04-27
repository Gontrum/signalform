import { computed, onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import {
  getQueueAutoScrollDelta,
  getQueueDropIndicatorLabel,
  getQueueDropPosition,
  isQueueDropTarget,
  isQueueRowBusy,
  parseQueueTrackIndex,
} from '../core/service'
import type { QueueDropPosition } from '../core/types'

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
  readonly dragOverlayStyle: Readonly<Ref<Record<string, string> | null>>
  readonly clearDragState: () => void
  readonly startMouseDrag: (event: MouseEvent, trackId: string, trackIndex: number) => void
  readonly startTouchDrag: (event: TouchEvent, trackId: string, trackIndex: number) => void
  readonly isRowBusy: (trackId: string) => boolean
  readonly isDropTarget: (trackIndex: number) => boolean
  readonly getDropPosition: (trackIndex: number) => QueueDropPosition | null
  readonly getDropIndicatorLabel: (trackIndex: number) => string | null
  readonly setScrollContainer: (el: Element | ComponentPublicInstance | null) => void
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
  const dragPointerX = ref<number | null>(null)
  const dragPointerY = ref<number | null>(null)
  const scrollContainer = ref<HTMLElement | null>(null)
  const autoScrollIntervalId = ref<number | null>(null)

  const isDragActive = computed(() => dragFromIndex.value !== null)
  const dragOverlayStyle = computed<Record<string, string> | null>(() => {
    if (dragPointerX.value === null || dragPointerY.value === null || dragTrackId.value === null) {
      return null
    }

    return {
      left: `${dragPointerX.value + 12}px`,
      top: `${dragPointerY.value + 18}px`,
    }
  })

  const preventSelectionWhileDragging = (event: Event): void => {
    event.preventDefault()
  }

  const enableTouchDragProtections = (): void => {
    document.addEventListener('selectstart', preventSelectionWhileDragging)
    document.addEventListener('contextmenu', preventSelectionWhileDragging)
    document.addEventListener('dragstart', preventSelectionWhileDragging)

    document.body.style.setProperty('user-select', 'none')
    document.body.style.setProperty('-webkit-user-select', 'none')
    document.body.style.setProperty('-webkit-touch-callout', 'none')
  }

  const disableTouchDragProtections = (): void => {
    document.removeEventListener('selectstart', preventSelectionWhileDragging)
    document.removeEventListener('contextmenu', preventSelectionWhileDragging)
    document.removeEventListener('dragstart', preventSelectionWhileDragging)

    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('-webkit-user-select')
    document.body.style.removeProperty('-webkit-touch-callout')
  }

  const stopAutoScroll = (): void => {
    if (autoScrollIntervalId.value !== null) {
      window.clearInterval(autoScrollIntervalId.value)
      autoScrollIntervalId.value = null
    }
  }

  const clearDragState = (): void => {
    stopAutoScroll()
    dragFromIndex.value = null
    dragOverIndex.value = null
    dragTrackId.value = null
    dragPointerX.value = null
    dragPointerY.value = null
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

  const syncAutoScroll = (): void => {
    const container = scrollContainer.value
    const pointerY = dragPointerY.value
    const pointerX = dragPointerX.value

    if (container === null || pointerY === null || pointerX === null) {
      stopAutoScroll()
      return
    }

    const rect = container.getBoundingClientRect()
    const scrollDelta = getQueueAutoScrollDelta(pointerY, rect.top, rect.bottom, {
      thresholdPx: 64,
      maxStepPx: 20,
    })

    if (scrollDelta === 0) {
      stopAutoScroll()
      return
    }

    if (autoScrollIntervalId.value !== null) {
      return
    }

    autoScrollIntervalId.value = window.setInterval(() => {
      container.scrollBy({ top: scrollDelta })
      updateDragTargetFromPoint(pointerX, pointerY)
    }, 16)
  }

  const updatePointer = (clientX: number, clientY: number): void => {
    dragPointerX.value = clientX
    dragPointerY.value = clientY
    updateDragTargetFromPoint(clientX, clientY)
    syncAutoScroll()
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
    updatePointer(event.clientX, event.clientY)
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

    updatePointer(touch.clientX, touch.clientY)
  }

  const handleDocumentTouchEnd = (): void => {
    document.removeEventListener('touchmove', handleDocumentTouchMove, touchMoveListenerOptions)
    document.removeEventListener('touchend', handleDocumentTouchEnd)
    document.removeEventListener('touchcancel', handleDocumentTouchEnd)
    disableTouchDragProtections()
    commitReorder()
  }

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', handleDocumentMouseUp)
    document.removeEventListener('touchmove', handleDocumentTouchMove, touchMoveListenerOptions)
    document.removeEventListener('touchend', handleDocumentTouchEnd)
    document.removeEventListener('touchcancel', handleDocumentTouchEnd)
    stopAutoScroll()
    disableTouchDragProtections()
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
    updatePointer(event.clientX, event.clientY)

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
    updatePointer(touch.clientX, touch.clientY)
    enableTouchDragProtections()

    document.addEventListener('touchmove', handleDocumentTouchMove, touchMoveListenerOptions)
    document.addEventListener('touchend', handleDocumentTouchEnd)
    document.addEventListener('touchcancel', handleDocumentTouchEnd)
  }

  const isRowBusy = (trackId: string): boolean =>
    isQueueRowBusy(trackId, removeBusyTrackId.value, reorderBusyTrackId.value)

  const isDropTarget = (trackIndex: number): boolean =>
    isQueueDropTarget(trackIndex, dragOverIndex.value, dragFromIndex.value)

  const getDropPosition = (trackIndex: number): QueueDropPosition | null => {
    if (!isDropTarget(trackIndex)) {
      return null
    }

    return getQueueDropPosition(dragOverIndex.value, dragFromIndex.value)
  }

  const getDropIndicatorLabel = (trackIndex: number): string | null =>
    getQueueDropIndicatorLabel(trackIndex, dragOverIndex.value, dragFromIndex.value, dropMessages)

  const setScrollContainer = (el: Element | ComponentPublicInstance | null): void => {
    scrollContainer.value = el instanceof HTMLElement ? el : null
  }

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
    dragOverlayStyle,
    clearDragState,
    startMouseDrag,
    startTouchDrag,
    isRowBusy,
    isDropTarget,
    getDropPosition,
    getDropIndicatorLabel,
    setScrollContainer,
    scrollBoundaryIntoView,
  }
}
