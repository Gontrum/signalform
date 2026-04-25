<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'

const router = useRouter()
const i18n = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)

const goBack = (): void => {
  void router.back()
}
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col bg-white pb-[env(safe-area-inset-bottom)]">
    <!-- Header with back button -->
    <div class="flex flex-shrink-0 items-center border-b border-neutral-200 px-4 py-3">
      <button
        type="button"
        class="mr-3 inline-flex items-center gap-1 rounded-lg text-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
        aria-label="Go back"
        @click="goBack"
      >
        <svg
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span class="text-sm font-medium">{{ t('settings.fullResultsBack') }}</span>
      </button>
      <span class="text-sm font-semibold text-neutral-700">Now Playing</span>
    </div>

    <!-- Panel content -->
    <div class="min-h-0 flex-1 overflow-auto">
      <NowPlayingPanel />
    </div>
  </div>
</template>
