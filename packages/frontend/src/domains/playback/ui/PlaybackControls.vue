<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import { usePlaybackControls } from '@/domains/playback/shell/usePlaybackControls'

const { playbackStore, canSkipPrevious, canSkipNext, handlePlayPause, handlePrevious, handleNext } =
  usePlaybackControls()
const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)
</script>

<template>
  <div data-testid="playback-controls" class="flex items-center justify-center gap-2">
    <!-- ARIA Live Region for screen reader announcements -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      <span v-if="playbackStore.isLoading">{{ t('home.loading') }}</span>
      <span v-else-if="playbackStore.isCurrentlyPlaying">{{ t('nowPlaying.playingBadge') }}</span>
      <span v-else-if="playbackStore.isPaused">{{ t('nowPlaying.pausedBadge') }}</span>
    </div>

    <!-- Previous Track Button -->
    <button
      type="button"
      data-testid="previous-button"
      class="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      :disabled="!canSkipPrevious"
      :aria-label="'Skip to previous track'"
      @click="handlePrevious"
    >
      <!-- Previous/Skip-Back Icon (⏮) -->
      <svg
        class="h-6 w-6 text-neutral-700"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
      </svg>
    </button>

    <!-- Play/Pause Toggle Button -->
    <button
      type="button"
      data-testid="play-pause-button"
      class="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-accent-500 hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-md"
      :disabled="playbackStore.isLoading"
      :aria-label="playbackStore.isPlaying && !playbackStore.isPaused ? 'Pause' : 'Play'"
      @click="handlePlayPause"
    >
      <!-- Loading Spinner -->
      <svg
        v-if="playbackStore.isLoading"
        data-testid="loading-spinner"
        class="h-6 w-6 animate-spin text-white"
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>

      <!-- Pause Icon (⏸) -->
      <svg
        v-else-if="playbackStore.isPlaying && !playbackStore.isPaused"
        class="h-6 w-6 text-white"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
      </svg>

      <!-- Play Icon (▶) -->
      <svg
        v-else
        class="h-6 w-6 text-white"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>

    <!-- Next Track Button -->
    <button
      type="button"
      data-testid="next-button"
      class="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      :disabled="!canSkipNext"
      :aria-label="'Skip to next track'"
      @click="handleNext"
    >
      <!-- Next/Skip-Forward Icon (⏭) -->
      <svg
        class="h-6 w-6 text-neutral-700"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
      </svg>
    </button>
  </div>
</template>
