<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import { usePlaylists } from '../shell/usePlaylists'

const i18nStore = useI18nStore()
const t = i18nStore.t

const { playlists, isSaving, save, load } = usePlaylists()

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
        class="min-h-[44px] flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        @keyup.enter="handleSave"
      />
      <button
        type="button"
        data-testid="playlist-save-button"
        :aria-label="t('playlists.save')"
        :disabled="isSaveDisabled"
        class="min-h-[44px] rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        @click="handleSave"
      >
        {{ t('playlists.save') }}
      </button>
    </div>

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
          class="min-h-[44px] shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          @click="handleLoad(playlist.id)"
        >
          {{ t('playlists.load') }}
        </button>
      </li>
    </ul>
  </section>
</template>
