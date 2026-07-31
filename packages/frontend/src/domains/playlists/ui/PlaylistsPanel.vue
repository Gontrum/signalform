<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import { usePlaylists } from '../shell/usePlaylists'

const i18nStore = useI18nStore()
const t = i18nStore.t

const { playlists, isSaving, error, save, load, remove } = usePlaylists()

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
      <li
        v-for="playlist in playlists"
        :key="playlist.id"
        data-testid="playlist-row"
        class="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-neutral-50"
      >
        <span class="truncate text-sm text-neutral-900">{{ playlist.name }}</span>
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
      </li>
    </ul>
  </section>
</template>
