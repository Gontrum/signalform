<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { formatSeconds } from '@signalform/shared'
import { useI18nStore } from '@/app/i18nStore'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import { usePlaylists } from '../shell/usePlaylists'

const i18nStore = useI18nStore()
const t = i18nStore.t

const {
  playlists,
  isSaving,
  error,
  expandedId,
  tracks,
  isTracksLoading,
  isRemovingTrack,
  hasMoreTracks,
  save,
  load,
  remove,
  rename,
  toggleTracks,
  loadMoreTracks,
  removeTrack,
} = usePlaylists()

const name = ref('')

const isNameEmpty = computed(() => name.value.trim().length === 0)
const isSaveDisabled = computed(() => isNameEmpty.value || isSaving.value)

const handleSave = async (): Promise<void> => {
  if (isSaveDisabled.value) {
    return
  }

  await save(name.value)
  name.value = ''
}

const handleLoad = async (id: string): Promise<void> => {
  await load(id)
}

// Only one row may be in edit mode: a single id, not a per-row flag.
const editingId = ref<string | undefined>(undefined)
const editingName = ref('')

const isRenameConfirmDisabled = computed(() => editingName.value.trim().length === 0)

const renameInputEl = ref<HTMLInputElement | null>(null)

const setRenameInput = (el: Element | ComponentPublicInstance | null): void => {
  renameInputEl.value = el instanceof HTMLInputElement ? el : null
}

// The rename button is unmounted while its own row edits, so the element that
// triggered the edit is detached by the time focus should return to it. Each
// button re-registers itself here on remount, and focus is handed back after
// the DOM has caught up.
const renameTriggerEls = new Map<string, HTMLButtonElement>()

const setRenameTrigger = (id: string, el: Element | ComponentPublicInstance | null): void => {
  if (el instanceof HTMLButtonElement) {
    renameTriggerEls.set(id, el)
    return
  }
  renameTriggerEls.delete(id)
}

const startRename = async (playlist: SavedPlaylist): Promise<void> => {
  editingId.value = playlist.id
  editingName.value = playlist.name
  await nextTick()
  renameInputEl.value?.focus()
}

const closeRename = async (id: string): Promise<void> => {
  editingId.value = undefined
  editingName.value = ''
  await nextTick()
  // Explicit: on macOS a mouse click leaves a button unfocused, so without
  // this a keyboard user would be dropped onto <body> (WCAG 2.4.3).
  renameTriggerEls.get(id)?.focus()
}

const confirmRename = async (id: string): Promise<void> => {
  if (isRenameConfirmDisabled.value) {
    return
  }

  await rename(id, editingName.value)
  if (error.value) {
    // Keep the field open so the rejected name is still there to correct.
    return
  }

  await closeRename(id)
}

// Same reason as the delete button below: one rename button per row, all with
// the same visible label, so the accessible name has to carry the playlist.
const renameAriaLabel = (playlistName: string): string =>
  t('playlists.renameAria').replace('{name}', playlistName)

const renameInputAriaLabel = (playlistName: string): string =>
  t('playlists.renameInputAria').replace('{name}', playlistName)

// Deleting a playlist is irreversible, so it needs a double tap within a
// 3-second window before it fires. Keyed by playlist id because one button is
// rendered per row; a shared boolean would arm every row at once.
const pendingDeleteId = ref<string | undefined>(undefined)
// Not a ref: the handle is only ever read by clearTimeout, never by the
// template, so reactivity would buy nothing.
let pendingDeleteTimer: ReturnType<typeof setTimeout> | undefined = undefined

const clearPendingDeleteTimer = (): void => {
  if (pendingDeleteTimer !== undefined) {
    clearTimeout(pendingDeleteTimer)
    pendingDeleteTimer = undefined
  }
}

const handleDelete = async (id: string): Promise<void> => {
  if (pendingDeleteId.value === id) {
    clearPendingDeleteTimer()
    pendingDeleteId.value = undefined
    await remove(id)
    return
  }

  clearPendingDeleteTimer()
  pendingDeleteId.value = id
  pendingDeleteTimer = setTimeout(() => {
    pendingDeleteId.value = undefined
    pendingDeleteTimer = undefined
  }, 3000)
}

const deleteLabel = (id: string): string =>
  pendingDeleteId.value === id ? t('playlists.deleteConfirm') : t('playlists.delete')

// The visible label is the same on every row, so the accessible name has to
// carry the playlist name — otherwise a screen reader announces "Delete" for
// all of them and the armed row is indistinguishable.
const deleteAriaLabel = (id: string, playlistName: string): string =>
  (pendingDeleteId.value === id
    ? t('playlists.deleteConfirmAria')
    : t('playlists.deleteAria')
  ).replace('{name}', playlistName)

onUnmounted(() => {
  clearPendingDeleteTimer()
})

// Same single-open rule as the rename editor: the composable keeps one
// expanded id, so opening a row closes whichever was open.
const tracksPanelId = (id: string): string => `playlist-tracks-${encodeURIComponent(id)}`

const tracksToggleAriaLabel = (id: string, playlistName: string): string =>
  (expandedId.value === id ? t('playlists.tracksHideAria') : t('playlists.tracksShowAria')).replace(
    '{name}',
    playlistName,
  )

const trackRemoveAriaLabel = (title: string, playlistName: string): string =>
  t('playlists.trackRemoveAria').replace('{title}', title).replace('{name}', playlistName)

// Both maps exist for the same reason as renameTriggerEls: the button that
// started the action is gone by the time focus should come back to it.
const tracksToggleEls = new Map<string, HTMLButtonElement>()

const setTracksToggle = (id: string, el: Element | ComponentPublicInstance | null): void => {
  if (el instanceof HTMLButtonElement) {
    tracksToggleEls.set(id, el)
    return
  }
  tracksToggleEls.delete(id)
}

const trackRemoveEls = new Map<number, HTMLButtonElement>()

const setTrackRemove = (index: number, el: Element | ComponentPublicInstance | null): void => {
  if (el instanceof HTMLButtonElement) {
    trackRemoveEls.set(index, el)
    return
  }
  trackRemoveEls.delete(index)
}

const handleRemoveTrack = async (playlistId: string, index: number): Promise<void> => {
  await removeTrack(index)
  await nextTick()
  // After the reload the following track has taken over this index, so the
  // same position is the nearest surviving control; the toggle is the fallback
  // when the last track went away or the panel closed.
  const next = trackRemoveEls.get(index) ?? tracksToggleEls.get(playlistId)
  next?.focus()
}
</script>

<template>
  <section
    data-testid="playlists-panel"
    class="mb-4 rounded-lg border border-neutral-200 bg-white p-4"
  >
    <h2 class="mb-3 text-lg font-semibold text-neutral-900">
      {{ t('playlists.title') }}
    </h2>

    <div class="mb-4 flex items-center gap-2">
      <input
        v-model="name"
        type="text"
        data-testid="playlist-name-input"
        :placeholder="t('playlists.namePlaceholder')"
        :aria-label="t('playlists.namePlaceholder')"
        class="min-h-11 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
        @keyup.enter="handleSave"
      />
      <button
        type="button"
        data-testid="playlist-save-button"
        :aria-label="t('playlists.save')"
        :disabled="isSaveDisabled"
        class="min-h-11 rounded-lg border border-accent-300 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        @click="handleSave"
      >
        {{ t('playlists.save') }}
      </button>
    </div>

    <p v-if="error" data-testid="playlists-error" role="alert" class="mb-3 text-sm text-error">
      {{ t('playlists.error') }}
    </p>

    <p v-if="playlists.length === 0" data-testid="playlists-empty" class="text-sm text-neutral-500">
      {{ t('playlists.empty') }}
    </p>
    <ul v-else class="flex flex-col gap-1">
      <li v-for="playlist in playlists" :key="playlist.id" data-testid="playlist-row">
        <div
          class="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-neutral-50"
        >
          <template v-if="editingId === playlist.id">
            <input
              :ref="setRenameInput"
              v-model="editingName"
              type="text"
              data-testid="playlist-rename-input"
              :aria-label="renameInputAriaLabel(playlist.name)"
              class="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              @keyup.enter="confirmRename(playlist.id)"
              @keydown.esc="closeRename(playlist.id)"
            />
            <button
              type="button"
              data-testid="playlist-rename-confirm"
              :aria-label="t('playlists.renameConfirm')"
              :disabled="isRenameConfirmDisabled"
              class="min-h-11 shrink-0 rounded-lg border border-accent-300 bg-accent-50 px-4 py-2 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
              @click="confirmRename(playlist.id)"
            >
              {{ t('playlists.renameConfirm') }}
            </button>
            <button
              type="button"
              data-testid="playlist-rename-cancel"
              :aria-label="t('playlists.renameCancel')"
              class="min-h-11 shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
              @click="closeRename(playlist.id)"
            >
              {{ t('playlists.renameCancel') }}
            </button>
          </template>
          <template v-else>
            <span class="min-w-0 flex-1 truncate text-sm text-neutral-900">{{
              playlist.name
            }}</span>
            <button
              :ref="(el) => setTracksToggle(playlist.id, el)"
              type="button"
              data-testid="playlist-tracks-toggle"
              :aria-label="tracksToggleAriaLabel(playlist.id, playlist.name)"
              :aria-expanded="expandedId === playlist.id"
              :aria-controls="expandedId === playlist.id ? tracksPanelId(playlist.id) : undefined"
              class="min-h-11 shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
              @click="toggleTracks(playlist.id)"
            >
              {{ t('playlists.tracks') }}
            </button>
            <button
              :ref="(el) => setRenameTrigger(playlist.id, el)"
              type="button"
              data-testid="playlist-rename-button"
              :aria-label="renameAriaLabel(playlist.name)"
              class="min-h-11 shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
              @click="startRename(playlist)"
            >
              {{ t('playlists.rename') }}
            </button>
            <button
              type="button"
              data-testid="playlist-load-button"
              :aria-label="t('playlists.load')"
              class="min-h-11 shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
              @click="handleLoad(playlist.id)"
            >
              {{ t('playlists.load') }}
            </button>
            <button
              type="button"
              data-testid="playlist-delete-button"
              :aria-label="deleteAriaLabel(playlist.id, playlist.name)"
              :class="[
                'min-h-11 shrink-0 rounded-lg border px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-inset',
                pendingDeleteId === playlist.id
                  ? 'border-error/30 bg-error/10 text-error hover:bg-error/10 focus:ring-error'
                  : 'border-neutral-200 bg-white text-error hover:bg-error/10 focus:ring-accent-500',
              ]"
              @click="handleDelete(playlist.id)"
            >
              {{ deleteLabel(playlist.id) }}
            </button>
          </template>
        </div>

        <div
          v-if="expandedId === playlist.id"
          :id="tracksPanelId(playlist.id)"
          data-testid="playlist-tracks"
          class="mt-1 border-l-2 border-neutral-200 pl-3"
        >
          <p
            v-if="isTracksLoading && tracks.length === 0"
            data-testid="playlist-tracks-loading"
            class="px-2 py-2 text-sm text-neutral-500"
          >
            {{ t('playlists.tracksLoading') }}
          </p>
          <p
            v-else-if="tracks.length === 0"
            data-testid="playlist-tracks-empty"
            class="px-2 py-2 text-sm text-neutral-500"
          >
            {{ t('playlists.tracksEmpty') }}
          </p>
          <template v-else>
            <ul class="flex flex-col gap-1">
              <li
                v-for="track in tracks"
                :key="track.index"
                data-testid="playlist-track-row"
                class="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-neutral-50"
              >
                <span class="min-w-0 flex-1">
                  <span
                    data-testid="playlist-track-title"
                    class="block truncate text-sm text-neutral-900"
                    >{{ track.title }}</span
                  >
                  <span
                    data-testid="playlist-track-artist"
                    class="block truncate text-xs text-neutral-500"
                    >{{ track.artist }}</span
                  >
                </span>
                <span
                  v-if="track.duration !== undefined"
                  data-testid="playlist-track-duration"
                  class="shrink-0 text-xs tabular-nums text-neutral-500"
                  >{{ formatSeconds(track.duration) }}</span
                >
                <button
                  :ref="(el) => setTrackRemove(track.index, el)"
                  type="button"
                  data-testid="playlist-track-remove"
                  :aria-label="trackRemoveAriaLabel(track.title, playlist.name)"
                  :disabled="isRemovingTrack"
                  class="min-h-11 shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-error transition-colors hover:bg-error/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
                  @click="handleRemoveTrack(playlist.id, track.index)"
                >
                  {{ t('playlists.trackRemove') }}
                </button>
              </li>
            </ul>
            <button
              v-if="hasMoreTracks"
              type="button"
              data-testid="playlist-tracks-more"
              :aria-label="t('playlists.tracksMore')"
              :disabled="isTracksLoading"
              class="mt-1 min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
              @click="loadMoreTracks"
            >
              {{ t('playlists.tracksMore') }}
            </button>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
