<script setup lang="ts">
import AppLayout from '@/layouts/AppLayout.vue'
import SearchPanel from '@/domains/search/ui/SearchPanel.vue'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'
</script>

<template>
  <AppLayout>
    <template #left>
      <SearchPanel />
    </template>
    <template #right>
      <NowPlayingPanel />
    </template>
  </AppLayout>
</template>
