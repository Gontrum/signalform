<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { formatSeconds } from '@signalform/shared'
import MainNavBar from '@/app/MainNavBar.vue'
import PageHeader from '@/ui/PageHeader.vue'
import QualityBadge from '@/ui/QualityBadge.vue'
import PlaylistsPanel from '@/domains/playlists/ui/PlaylistsPanel.vue'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { getQueueEntryKey, isRadioTrack as isQueueRadioTrack } from '../core/service'
import { useQueueDrag } from '../shell/useQueueDrag'
import { useQueueStore } from '../shell/useQueueStore'

const { isPhone } = useResponsiveLayout()

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
  isSelectMode,
  selectedTrackIds,
  isClearingQueue,
  isBatchRemoving,
  selectedCount,
  allTracksSelected,
  hasSelectedTracks,
} = storeToRefs(queueStore)

const {
  dragTrackId,
  dragOverIndex,
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

const clearConfirmPending = ref(false)
const clearConfirmTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const isPlaylistsOpen = ref(false)

const togglePlaylists = (): void => {
  isPlaylistsOpen.value = !isPlaylistsOpen.value
}

const isQueueMenuOpen = ref(false)

const toggleQueueMenu = (): void => {
  isQueueMenuOpen.value = !isQueueMenuOpen.value
}

const closeQueueMenu = (): void => {
  isQueueMenuOpen.value = false
}

const handleTogglePlaylistsFromMenu = (): void => {
  togglePlaylists()
  closeQueueMenu()
}

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

const handleClearQueue = (): void => {
  if (clearConfirmPending.value) {
    if (clearConfirmTimer.value !== null) {
      clearTimeout(clearConfirmTimer.value)
      clearConfirmTimer.value = null
    }
    clearConfirmPending.value = false
    void queueStore.clearQueue()
    return
  }

  clearConfirmPending.value = true
  clearConfirmTimer.value = setTimeout(() => {
    clearConfirmPending.value = false
    clearConfirmTimer.value = null
  }, 3000)
}

const handleToggleSelectMode = (): void => {
  queueStore.toggleSelectMode()
}

const handleToggleSelectModeFromMenu = (): void => {
  handleToggleSelectMode()
  closeQueueMenu()
}

const handleClearQueueFromMenu = (): void => {
  const isConfirming = clearConfirmPending.value
  handleClearQueue()
  if (isConfirming) {
    closeQueueMenu()
  }
}

const handleToggleTrackSelection = (trackId: string): void => {
  queueStore.toggleTrackSelection(trackId)
}

const handleSelectAll = (): void => {
  if (allTracksSelected.value) {
    selectedTrackIds.value = new Set()
  } else {
    queueStore.selectAllTracks()
  }
}

const handleRemoveSelected = (): void => {
  void queueStore.removeSelectedTracks()
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

const dragOverlayLabel = computed<string | null>(() =>
  dragOverIndex.value !== null ? getDropIndicatorLabel(dragOverIndex.value) : null,
)

const viewRoot = ref<HTMLElement | null>(null)
const hasScrolledToCurrentOnOpen = ref(false)

const currentTrackKey = computed(() => {
  const currentTrack = tracks.value.find((track) => track.isCurrent)
  return currentTrack !== undefined ? getTrackKey(currentTrack) : null
})

const scrollCurrentTrackIntoView = (options: ScrollIntoViewOptions): void => {
  const element = viewRoot.value?.querySelector('[data-testid="queue-track"][data-current="true"]')
  if (element instanceof HTMLElement) {
    element.scrollIntoView?.(options)
  }
}

// isLoading is part of the source: fetchQueue applies tracks before it clears
// isLoading in a later microtask, and the track list only renders once loading
// is done — the key alone would fire while the list is still hidden.
watch([currentTrackKey, isLoading], async ([key, loading], [previousKey]) => {
  if (key === null || loading) {
    return
  }

  if (!hasScrolledToCurrentOnOpen.value) {
    hasScrolledToCurrentOnOpen.value = true
    await nextTick()
    scrollCurrentTrackIntoView({ behavior: 'instant', block: 'center' })
    return
  }

  if (key === previousKey || isDragActive.value || isSelectMode.value) {
    return
  }

  await nextTick()
  scrollCurrentTrackIntoView({ behavior: 'smooth', block: 'nearest' })
})
</script>

<template>
  <div ref="viewRoot" data-testid="queue-view" class="flex h-full min-h-0 flex-col">
    <MainNavBar v-if="!isPhone" />
    <PageHeader :title="t('queue.title')" :show-back="isPhone">
      <template #trailing>
        <button
          type="button"
          role="switch"
          data-testid="radio-mode-toggle"
          class="flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          :class="
            isRadioMode
              ? 'bg-sky-100 text-sky-600 hover:bg-sky-200'
              : 'text-neutral-500 hover:bg-neutral-100'
          "
          :aria-checked="isRadioMode ? 'true' : 'false'"
          :aria-label="t('queue.radioModeToggle')"
          :disabled="isLoading || isJumping || isMutatingQueue || isRadioModeUpdating"
          @click="handleRadioModeToggle"
        >
          <svg
            class="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
            <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
          </svg>
        </button>

        <div class="relative">
          <button
            type="button"
            data-testid="queue-menu"
            class="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 active:opacity-50"
            :aria-label="t('queue.menu')"
            aria-haspopup="menu"
            :aria-expanded="isQueueMenuOpen"
            @click="toggleQueueMenu"
          >
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>

          <!-- Backdrop closes the menu on outside click -->
          <button
            v-if="isQueueMenuOpen"
            type="button"
            aria-hidden="true"
            tabindex="-1"
            class="fixed inset-0 z-10 cursor-default"
            @click="closeQueueMenu"
          />

          <div
            v-if="isQueueMenuOpen"
            data-testid="queue-menu-panel"
            role="menu"
            :aria-label="t('queue.menu')"
            class="absolute right-0 top-full z-20 mt-1 flex w-48 flex-col rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              data-testid="playlists-toggle"
              class="flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-3 text-left text-sm text-neutral-800 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
              :aria-expanded="isPlaylistsOpen ? 'true' : 'false'"
              :aria-controls="isPlaylistsOpen ? 'playlists-panel-region' : undefined"
              @click="handleTogglePlaylistsFromMenu"
            >
              <span>{{ t('playlists.title') }}</span>
            </button>

            <template v-if="tracks.length > 0 || isSelectMode">
              <button
                type="button"
                role="menuitem"
                data-testid="queue-select-mode-toggle"
                class="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm text-neutral-800 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isLoading || isMutatingQueue"
                @click="handleToggleSelectModeFromMenu"
              >
                {{ isSelectMode ? t('queue.cancelSelect') : t('queue.selectMode') }}
              </button>

              <button
                v-if="!isSelectMode"
                type="button"
                role="menuitem"
                data-testid="queue-clear-button"
                class="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm text-red-600 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isLoading || isMutatingQueue || isJumping || isClearingQueue"
                @click="handleClearQueueFromMenu"
              >
                {{ clearConfirmPending ? t('queue.clearConfirm') : t('queue.clear') }}
              </button>
            </template>
          </div>
        </div>
      </template>
    </PageHeader>

    <div class="flex min-h-0 flex-1 flex-col px-4 sm:px-6 sm:pt-4">
      <PlaylistsPanel v-if="isPlaylistsOpen" id="playlists-panel-region" />

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

      <template v-if="!isLoading && !error && tracks.length > 0">
        <div
          v-if="isSelectMode"
          data-testid="queue-select-all"
          class="mb-1 flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-2"
        >
          <input
            type="checkbox"
            :checked="allTracksSelected"
            class="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-500 accent-blue-500 focus:ring-blue-500"
            :aria-label="t('queue.selectAll')"
            @change="handleSelectAll"
          />
          <span class="text-sm text-neutral-700">{{ t('queue.selectAll') }}</span>
          <span class="ml-auto text-xs text-neutral-500"
            >{{ selectedCount }} / {{ tracks.length }}</span
          >
        </div>

        <ul
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
              :data-current="track.isCurrent ? 'true' : 'false'"
              :data-dragging="dragTrackId === getTrackKey(track) ? 'true' : 'false'"
              :data-drop-target="isDropTarget(index) ? 'true' : 'false'"
              :data-busy="isRowBusy(getTrackKey(track)) ? 'true' : 'false'"
              :class="[
                'relative scroll-mt-24 px-4 py-2 transition-colors',
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

              <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
                <span
                  v-if="!isSelectMode"
                  :class="[
                    'w-6 text-right text-xs',
                    track.isCurrent ? 'text-neutral-600' : 'text-neutral-400',
                  ]"
                >
                  {{ track.position }}
                </span>
                <div v-else class="flex items-center">
                  <input
                    type="checkbox"
                    :checked="selectedTrackIds.has(track.id)"
                    :aria-label="`Select ${track.title}`"
                    class="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-blue-500 focus:ring-blue-500"
                    @change="handleToggleTrackSelection(track.id)"
                    @click.stop
                  />
                </div>

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
                  @click="
                    isSelectMode
                      ? handleToggleTrackSelection(track.id)
                      : handleJumpToTrack(track.position - 1)
                  "
                  @keydown="handleQueueItemKeydown"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p
                        class="truncate text-[15px] font-medium text-neutral-900"
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
                        'mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs',
                        track.isCurrent ? 'text-neutral-600' : 'text-neutral-500',
                      ]"
                    >
                      <QualityBadge
                        v-if="track.source || track.audioQuality"
                        class="hidden sm:inline-flex"
                        :source="track.source ?? 'unknown'"
                        :quality="track.audioQuality"
                      />
                      <span class="truncate"
                        >{{ track.artist }} · {{ formatSeconds(track.duration) }}</span
                      >
                    </p>
                  </div>
                </button>

                <div v-if="!isSelectMode" class="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="queue-track-reorder"
                    class="min-h-9 min-w-9 touch-none select-none rounded-lg px-2 py-2 text-xs text-neutral-400 hover:text-neutral-600 active:opacity-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                    class="min-h-9 min-w-9 rounded-lg px-2 py-2 text-xs text-red-400 hover:text-red-600 active:opacity-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="isMutatingQueue || isJumping"
                    :aria-label="`Remove ${track.title}`"
                    @click="handleRemoveTrack(getTrackKey(track), track.position - 1)"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
                <div v-else class="w-9" />
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
      </template>
    </div>

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
      <p
        v-if="dragOverlayLabel"
        data-testid="queue-drag-overlay-label"
        class="mt-1 truncate text-xs font-medium text-sky-700"
      >
        {{ dragOverlayLabel }}
      </p>
    </div>

    <div data-testid="queue-drop-live-region" aria-live="polite" class="sr-only">
      {{ dragOverlayLabel ?? '' }}
    </div>

    <div
      v-if="isSelectMode"
      data-testid="queue-select-action-bar"
      class="flex-shrink-0 border-t border-neutral-200 bg-white px-4 py-3 sm:px-6 sm:pb-3"
    >
      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          @click="handleToggleSelectMode"
        >
          {{ t('queue.cancelSelect') }}
        </button>
        <button
          type="button"
          data-testid="queue-remove-selected-button"
          :class="[
            'rounded-lg border px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50',
            hasSelectedTracks
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-neutral-200 bg-white text-neutral-400',
          ]"
          :disabled="!hasSelectedTracks || isBatchRemoving"
          @click="handleRemoveSelected"
        >
          {{ t('queue.removeSelected')
          }}<span v-if="selectedCount > 0"> ({{ selectedCount }})</span>
        </button>
      </div>
    </div>
  </div>
</template>
