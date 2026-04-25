<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { formatSeconds } from '@signalform/shared'
import MainNavBar from '@/app/MainNavBar.vue'
import QualityBadge from '@/ui/QualityBadge.vue'
import { useI18nStore } from '@/app/i18nStore'
import { isRadioTrack as isQueueRadioTrack } from '../core/service'
import { useQueueDrag } from '../shell/useQueueDrag'
import { useQueueStore } from '../shell/useQueueStore'

const router = useRouter()
const goBack = (): void => {
  void router.back()
}

const i18nStore = useI18nStore()
const t = i18nStore.t

const queueStore = useQueueStore()
const {
  tracks,
  isLoading,
  error,
  jumpError,
  isJumping,
  removeBusyTrackId,
  reorderBusyTrackId,
  lastMutationError,
  isMutatingQueue,
  radioBoundaryIndex,
  radioUnavailableMessage,
} = storeToRefs(queueStore)

const {
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
} = useQueueDrag({
  isJumping,
  isMutatingQueue,
  removeBusyTrackId,
  reorderBusyTrackId,
  reorderTrack: queueStore.reorderTrack,
  dropMessages: {
    before: t('queue.dropBefore'),
    after: t('queue.dropAfter'),
  },
})

onMounted(async () => {
  await queueStore.fetchQueue()
})

const handleJumpToTrack = (trackIndex: number): void => {
  if (isMutatingQueue.value) {
    return
  }

  void queueStore.jumpToTrack(trackIndex)
}

const handleRemoveTrack = (trackId: string, trackIndex: number): void => {
  if (isMutatingQueue.value || isJumping.value) {
    return
  }

  clearDragState()
  void queueStore.removeTrack(trackId, trackIndex)
}

const handleQueueItemKeydown = (event: KeyboardEvent): void => {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return
  }

  const currentTarget = event.currentTarget
  const list = currentTarget.closest('[aria-label="Queue tracks"]')
  const items = list
    ? Array.from(list.querySelectorAll<HTMLElement>('[data-testid="queue-track-jump"]'))
    : []
  const currentIndex = items.indexOf(currentTarget)

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    items[currentIndex + 1]?.focus()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    items[currentIndex - 1]?.focus()
  }
}

const isRadioTrack = (index: number): boolean => isQueueRadioTrack(index, radioBoundaryIndex.value)
</script>

<template>
  <div data-testid="queue-view" class="p-6">
    <MainNavBar />
    <button
      type="button"
      data-testid="back-button"
      class="mb-6 flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
      @click="goBack"
    >
      ← {{ t('queue.backToNowPlaying') }}
    </button>
    <h1 class="mb-4 text-2xl font-semibold text-neutral-900">
      {{ t('queue.title') }}
    </h1>

    <div
      v-if="radioUnavailableMessage"
      role="alert"
      data-testid="radio-unavailable-banner"
      class="mx-4 mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700"
    >
      {{ radioUnavailableMessage }}
    </div>

    <div
      v-if="jumpError"
      data-testid="queue-jump-error"
      class="mb-3 rounded bg-red-50 px-4 py-2 text-center text-sm text-red-600"
    >
      {{ jumpError }}
    </div>

    <div
      v-if="lastMutationError"
      role="alert"
      data-testid="queue-mutation-error"
      class="mb-3 rounded bg-red-50 px-4 py-2 text-center text-sm text-red-600"
    >
      {{ lastMutationError }}
    </div>

    <div
      v-if="isDragActive"
      data-testid="queue-drag-state"
      class="mb-3 rounded border border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-700"
    >
      {{ t('queue.dragHint') }}
    </div>

    <div
      v-if="isLoading"
      data-testid="queue-loading"
      class="flex items-center justify-center py-12 text-neutral-500"
    >
      {{ t('queue.loading') }}
    </div>

    <div v-else-if="error" data-testid="queue-error" class="py-12 text-center text-red-500">
      {{ error }}
    </div>

    <div
      v-else-if="tracks.length === 0"
      data-testid="queue-empty"
      class="flex items-center justify-center py-12 text-neutral-500"
    >
      {{ t('queue.empty') }}
    </div>

    <ul
      v-else
      :class="[
        'max-h-[calc(100vh-8rem)] overflow-y-auto divide-y divide-neutral-100',
        isJumping ? 'pointer-events-none opacity-60' : '',
      ]"
      aria-label="Queue tracks"
    >
      <template v-for="(track, index) in tracks" :key="track.id">
        <li
          v-if="radioBoundaryIndex !== null && index === radioBoundaryIndex"
          :ref="scrollBoundaryIntoView"
          role="separator"
          aria-label="Radio mode starts here"
          data-testid="radio-boundary"
          class="flex select-none items-center gap-3 border-t-2 border-dashed border-sky-300 bg-sky-50/20 px-4 py-2"
        >
          <span class="text-xs font-medium tracking-wide text-sky-500">{{
            t('queue.radioModeSeparator')
          }}</span>
        </li>

        <li
          data-testid="queue-track"
          :data-track-index="index"
          :data-track-id="track.id"
          :data-dragging="dragTrackId === track.id ? 'true' : 'false'"
          :data-drop-target="isDropTarget(index) ? 'true' : 'false'"
          :data-busy="isRowBusy(track.id) ? 'true' : 'false'"
          :class="[
            'relative px-4 py-3 transition-colors',
            track.isCurrent ? 'border-l-4 border-blue-500 bg-blue-50' : '',
            isRadioTrack(index) && !track.isCurrent ? 'bg-sky-100/60' : '',
            isDropTarget(index) ? 'bg-sky-50 ring-2 ring-inset ring-sky-400' : '',
            dragTrackId === track.id ? 'opacity-70' : '',
            isRowBusy(track.id) ? 'opacity-60' : '',
          ]"
        >
          <div
            v-if="isDropTarget(index)"
            data-testid="queue-drop-indicator"
            class="mb-3 rounded-md border border-sky-300 bg-sky-100 px-3 py-2 text-xs font-medium text-sky-800 shadow-sm"
          >
            {{ getDropIndicatorLabel(index) }}
          </div>

          <div class="flex items-start gap-3 sm:items-center">
            <button
              type="button"
              data-testid="queue-track-jump"
              :class="[
                'min-h-11 min-w-0 flex-1 rounded-md px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500',
                isRowBusy(track.id) || isMutatingQueue
                  ? 'cursor-not-allowed opacity-70'
                  : 'hover:bg-neutral-50',
              ]"
              :aria-label="`${track.title} by ${track.artist}${track.isCurrent ? ' — currently playing' : ''}`"
              :aria-current="track.isCurrent ? 'true' : undefined"
              :disabled="isRowBusy(track.id) || isMutatingQueue"
              @click="handleJumpToTrack(track.position - 1)"
              @keydown="handleQueueItemKeydown"
            >
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'w-8 flex-shrink-0 text-right text-sm',
                    track.isCurrent ? 'text-neutral-600' : 'text-neutral-400',
                  ]"
                >
                  {{ track.position }}
                </span>
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-sm font-medium text-neutral-900"
                    :class="{ 'text-blue-700': track.isCurrent }"
                  >
                    {{ track.title }}
                  </p>
                  <p
                    :class="[
                      'truncate text-xs',
                      track.isCurrent ? 'text-neutral-600' : 'text-neutral-500',
                    ]"
                  >
                    {{ track.artist }}<span v-if="track.album"> · {{ track.album }}</span>
                  </p>
                </div>
              </div>
            </button>

            <div
              class="ml-auto flex flex-shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center"
            >
              <div class="flex items-center gap-2">
                <QualityBadge
                  v-if="track.source || track.audioQuality"
                  :source="track.source ?? 'unknown'"
                  :quality="track.audioQuality"
                />
                <span
                  :class="['text-sm', track.isCurrent ? 'text-neutral-600' : 'text-neutral-500']"
                >
                  {{ formatSeconds(track.duration) }}
                </span>
              </div>

              <div class="flex items-center gap-2 self-stretch sm:self-auto">
                <button
                  type="button"
                  data-testid="queue-track-reorder"
                  class="min-h-11 min-w-11 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="isMutatingQueue || isJumping"
                  :aria-label="`Reorder ${track.title}`"
                  @mousedown="startMouseDrag($event, track.id, index)"
                  @touchstart.passive="startTouchDrag($event, track.id, index)"
                >
                  <span aria-hidden="true">↕</span>
                </button>
                <button
                  type="button"
                  data-testid="queue-track-remove"
                  class="min-h-11 min-w-11 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="isMutatingQueue || isJumping"
                  :aria-label="`Remove ${track.title}`"
                  @click="handleRemoveTrack(track.id, track.position - 1)"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="isRowBusy(track.id)"
            data-testid="queue-track-busy"
            class="mt-2 text-xs text-neutral-500"
          >
            {{ t('queue.updating') }}
          </div>
          <div
            v-else-if="dragTrackId === track.id || (isTouchDragging && isDropTarget(index))"
            data-testid="queue-track-drag-status"
            class="mt-2 text-xs text-sky-700"
          >
            {{ dragTrackId === track.id ? t('queue.dragging') : getDropIndicatorLabel(index) }}
          </div>

          <span
            v-if="track.isCurrent"
            data-testid="current-track"
            class="sr-only"
            aria-hidden="true"
          />
        </li>
      </template>
    </ul>
  </div>
</template>
