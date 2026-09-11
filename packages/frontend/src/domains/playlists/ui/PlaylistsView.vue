<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import PageHeader from '@/ui/PageHeader.vue'
import { useI18nStore } from '@/app/i18nStore'
import type { MessageKey } from '@/i18n'
import PlaylistsPanel from './PlaylistsPanel.vue'

const i18nStore = useI18nStore()
const t = (key: MessageKey): string => i18nStore.t(key)

const header = useTemplateRef<InstanceType<typeof PageHeader>>('header')

onMounted(() => {
  header.value?.focusTitle()
})
</script>

<template>
  <div data-testid="playlists-view" class="h-full min-h-0 overflow-y-auto bg-white">
    <PageHeader ref="header" :title="t('playlists.title')" :show-back="true" />

    <div class="px-4 py-4 sm:px-6">
      <PlaylistsPanel />
    </div>
  </div>
</template>
