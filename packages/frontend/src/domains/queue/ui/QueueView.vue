<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { formatSeconds } from '@signalform/shared'
import MainNavBar from '@/app/MainNavBar.vue'
import QualityBadge from '@/ui/QualityBadge.vue'
import { useI18nStore } from '@/app/i18nStore'
import { getQueueEntryKey, isRadioTrack as isQueueRadioTrack } from '../core/service'
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
  isRadioMode,
  isRadioModeUpdating,
  radioModeError,
  radioBoundaryIndex,
  radioUnavailableMessage,
} = storeToRefs(queueStore)

const {
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

const handleRadioModeToggle = (): void => {
  void queueStore.setRadioMode(!isRadioMode.value)
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

const isRadioTrack = (track: (typeof tracks.value)[number], index: number): boolean =>
  isQueueRadioTrack(track, index, radioBoundaryIndex.value)

const getTrackKey = (track: (typeof tracks.value)[number]): string => getQueueEntryKey(track)

const draggedTrack = computed(
  () => tracks.value.find((track) => getTrackKey(track) === dragTrackId.value) ?? null,
)
</script>

<template>
  <div data-testid="queue-view" class="flex h-full min-h-0 flex-col p-6">
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
    <div class="mb-4 flex items-center justify-between gap-4">
      <p class="text-sm text-neutral-500">
        {{ isRadioMode ? t('queue.radioModeOn') : t('queue.radioModeOff') }}
      </p>
      <button
        type="button"
        role="switch"
        data-testid="radio-mode-toggle"
        class="inline-flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        :aria-checked="isRadioMode ? 'true' : 'false'"
        :aria-label="t('queue.radioModeToggle')"
        :disabled="isLoading || isJumping || isMutatingQueue || isRadioModeUpdating"
        @click="handleRadioModeToggle"
      >
        <span>{{ t('queue.radioModeToggle') }}</span>
        <span
          :class="[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            isRadioMode ? 'bg-sky-500' : 'bg-neutral-300',
          ]"
        >
          <span
            :class="[
              'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
              isRadioMode ? 'translate-x-5' : 'translate-x-1',
            ]"
          />
        </span>
      </button>
    </div>

    <div
      v-if="radioUnavailableMessage"
      role="alert"
      data-testid="radio-unavailable-banner"
      class="mx-4 mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700"
    >
      {{ radioUnavailableMessage }}
    </div>

    <div
      v-if="radioModeError"
      role="alert"
      data-testid="radio-mode-error"
      class="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
    >
      {{ radioModeError }}
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
      :ref="setScrollContainer"
      :class="[
        'min-h-0 flex-1 overflow-y-auto divide-y divide-neutral-100 overscroll-contain pr-1 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-4',
        isJumping ? 'pointer-events-none opacity-60' : '',
      ]"
      aria-label="Queue tracks"
    >
      <template v-for="(track, index) in tracks" :key="getTrackKey(track)">
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
          :data-track-key="getTrackKey(track)"
          :data-dragging="dragTrackId === getTrackKey(track) ? 'true' : 'false'"
          :data-drop-target="isDropTarget(index) ? 'true' : 'false'"
          :data-busy="isRowBusy(getTrackKey(track)) ? 'true' : 'false'"
          :class="[
            'relative scroll-mt-24 px-4 py-3 transition-colors',
            track.isCurrent
              ? 'border-l-4 border-blue-500 bg-blue-50 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]'
              : '',
            isRadioTrack(track, index) && !track.isCurrent ? 'bg-sky-100/60' : '',
            isDropTarget(index) ? 'bg-sky-50' : '',
            dragTrackId === getTrackKey(track) ? 'scale-[0.985] opacity-35' : '',
            isRowBusy(getTrackKey(track)) ? 'opacity-60' : '',
          ]"
        >
          <div
            v-if="getDropPosition(index) === 'before'"
            data-testid="queue-drop-line-before"
            class="absolute inset-x-3 top-0 z-10 h-1 rounded-full bg-sky-500 shadow-[0_0_0_2px_rgba(224,242,254,0.95)]"
          />
          <div
            v-if="getDropPosition(index) === 'after'"
            data-testid="queue-drop-line-after"
            class="absolute inset-x-3 bottom-0 z-10 h-1 rounded-full bg-sky-500 shadow-[0_0_0_2px_rgba(224,242,254,0.95)]"
          />

          <div
            v-if="isDropTarget(index)"
            data-testid="queue-drop-indicator"
            class="mb-3 rounded-md border border-sky-300 bg-sky-100 px-3 py-2 text-xs font-medium text-sky-800 shadow-sm"
          >
            {{ getDropIndicatorLabel(index) }}
          </div>

          <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
            <span
              :class="[
                'pt-0.5 text-right text-sm',
                track.isCurrent ? 'text-neutral-600' : 'text-neutral-400',
              ]"
            >
              {{ track.position }}
            </span>

            <button
              type="button"
              data-testid="queue-track-jump"
              :class="[
                'min-h-10 min-w-0 rounded-lg px-2 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500',
                isRowBusy(getTrackKey(track)) || isMutatingQueue
                  ? 'cursor-not-allowed opacity-70'
                  : 'hover:bg-neutral-50',
              ]"
              :aria-label="`${track.title} by ${track.artist}${track.isCurrent ? ' — currently playing' : ''}`"
              :aria-current="track.isCurrent ? 'true' : undefined"
              :disabled="isRowBusy(getTrackKey(track)) || isMutatingQueue"
              @click="handleJumpToTrack(track.position - 1)"
              @keydown="handleQueueItemKeydown"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p
                    class="truncate text-sm font-medium text-neutral-900"
                    :class="{ 'text-blue-700': track.isCurrent }"
                  >
                    {{ track.title }}
                  </p>
                  <span
                    v-if="track.isCurrent"
                    data-testid="queue-current-badge"
                    class="inline-flex flex-shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                  >
                    {{ t('queue.nowPlayingLabel') }}
                  </span>
                </div>

                <p
                  :class="[
                    'mt-0.5 truncate text-xs',
                    track.isCurrent ? 'text-neutral-600' : 'text-neutral-500',
                  ]"
                >
                  {{ track.artist }}<span v-if="track.album"> · {{ track.album }}</span>
                </p>

                <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <QualityBadge
                    v-if="track.source || track.audioQuality"
                    :source="track.source ?? 'unknown'"
                    :quality="track.audioQuality"
                  />
                  <span
                    :class="['text-xs', track.isCurrent ? 'text-neutral-600' : 'text-neutral-500']"
                  >
                    {{ formatSeconds(track.duration) }}
                  </span>
                </div>
              </div>
            </button>

            <div class="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="queue-track-reorder"
                class="min-h-9 min-w-9 touch-none select-none rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isMutatingQueue || isJumping"
                :aria-label="`Reorder ${track.title}`"
                @mousedown="startMouseDrag($event, getTrackKey(track), index)"
                @touchstart="startTouchDrag($event, getTrackKey(track), index)"
              >
                <span aria-hidden="true">↕</span>
              </button>
              <button
                type="button"
                data-testid="queue-track-remove"
                class="min-h-9 min-w-9 rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isMutatingQueue || isJumping"
                :aria-label="`Remove ${track.title}`"
                @click="handleRemoveTrack(getTrackKey(track), track.position - 1)"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>

          <div
            v-if="isRowBusy(getTrackKey(track))"
            data-testid="queue-track-busy"
            class="mt-2 text-xs text-neutral-500"
          >
            {{ t('queue.updating') }}
          </div>
          <div
            v-else-if="
              dragTrackId === getTrackKey(track) || (isTouchDragging && isDropTarget(index))
            "
            data-testid="queue-track-drag-status"
            class="mt-2 text-xs text-sky-700"
          >
            {{
              dragTrackId === getTrackKey(track)
                ? t('queue.dragging')
                : getDropIndicatorLabel(index)
            }}
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

    <div
      v-if="dragOverlayStyle && draggedTrack"
      data-testid="queue-drag-overlay"
      class="pointer-events-none fixed z-50 hidden max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-sky-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur sm:block"
      :style="dragOverlayStyle"
    >
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">
        {{ t('queue.dragOverlay') }}
      </p>
      <p class="truncate text-sm font-semibold text-neutral-900">
        {{ draggedTrack.title }}
      </p>
      <p class="truncate text-xs text-neutral-500">{{ draggedTrack.artist }}</p>
    </div>
  </div>
</template>
