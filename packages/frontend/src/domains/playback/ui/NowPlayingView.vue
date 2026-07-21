<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'
import { usePhonePlaybackShortcut } from '@/domains/playback/shell/usePhonePlaybackShortcut'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'
import PageHeader from '@/ui/PageHeader.vue'

const router = useRouter()
const i18n = useI18nStore()
const { hasQueuedTracks, shouldShowPhonePlaybackShortcut } = usePhonePlaybackShortcut()
const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)

const goToQueue = (): void => {
  void router.push({ name: 'queue' })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-white pb-[env(safe-area-inset-bottom)]">
    <PageHeader :title="t('nowPlaying.playingBadge')" show-back back-icon="down" />

    <!-- Panel content -->
    <div
      class="min-h-0 flex-1 overflow-auto"
      :class="{
        'pb-[calc(7rem+env(safe-area-inset-bottom))]': shouldShowPhonePlaybackShortcut,
      }"
    >
      <NowPlayingPanel />
    </div>

    <button
      v-if="shouldShowPhonePlaybackShortcut && hasQueuedTracks"
      data-testid="now-playing-queue-shortcut"
      type="button"
      class="fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-50 flex min-h-[56px] items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-xl hover:bg-neutral-50"
      :aria-label="t('nowPlaying.viewFullQueue')"
      @click="goToQueue"
    >
      {{ t('nowPlaying.viewFullQueue') }}
    </button>
  </div>
</template>
