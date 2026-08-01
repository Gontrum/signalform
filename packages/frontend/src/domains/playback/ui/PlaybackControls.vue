<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import { usePlaybackControls } from '@/domains/playback/shell/usePlaybackControls'

const {
  playbackStore,
  canSkipPrevious,
  canSkipNext,
  isShuffleActive,
  isRepeatActive,
  shuffleLabelKey,
  repeatLabelKey,
  handlePlayPause,
  handlePrevious,
  handleNext,
  handleShuffle,
  handleRepeat,
} = usePlaybackControls()
const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

// Same active/inactive treatment as the library filter chips: a filled dark
// pill, plus the dot below the icon so "on" survives greyscale and colour
// blindness. The repeat icon additionally swaps glyph for 'track'.
const MODE_BUTTON_CLASS =
  'relative flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2'

const MODE_ACTIVE_CLASS = 'border-neutral-900 bg-neutral-900 text-white'

const MODE_INACTIVE_CLASS =
  'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'

const modeButtonClass = (isActive: boolean): readonly string[] => [
  MODE_BUTTON_CLASS,
  isActive ? MODE_ACTIVE_CLASS : MODE_INACTIVE_CLASS,
]
</script>

<template>
  <div data-testid="playback-controls" class="flex items-center justify-center gap-2">
    <!-- ARIA Live Region for screen reader announcements -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      <span v-if="playbackStore.isLoading">{{ t('home.loading') }}</span>
      <span v-else-if="playbackStore.isCurrentlyPlaying">{{ t('nowPlaying.playingBadge') }}</span>
      <span v-else-if="playbackStore.isPaused">{{ t('nowPlaying.pausedBadge') }}</span>
    </div>

    <!-- Shuffle Mode Button -->
    <button
      type="button"
      data-testid="shuffle-button"
      :class="modeButtonClass(isShuffleActive)"
      :aria-label="t(shuffleLabelKey)"
      :aria-pressed="isShuffleActive"
      @click="handleShuffle"
    >
      <!-- Shuffle Icon (🔀) — the stacked square marks the album variant -->
      <svg
        :data-testid="`shuffle-icon-${playbackStore.shuffleMode}`"
        class="h-5 w-5"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.66 10.99l-1.41 1.41 3.13 3.13L14.5 21H20v-5.5l-2.04 2.04-2.8-2.55z"
        />
        <rect
          v-if="playbackStore.shuffleMode === 'albums'"
          x="3"
          y="2"
          width="5"
          height="5"
          rx="1"
        />
      </svg>

      <span
        v-if="isShuffleActive"
        data-testid="shuffle-active-dot"
        class="absolute bottom-1 h-1 w-1 rounded-full bg-current"
      />
    </button>

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
      <LoadingSpinner
        v-if="playbackStore.isLoading"
        data-testid="loading-spinner"
        size="sm"
        color="current"
        class="text-white"
        :announce="false"
      />

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

    <!-- Repeat Mode Button -->
    <button
      type="button"
      data-testid="repeat-button"
      :class="modeButtonClass(isRepeatActive)"
      :aria-label="t(repeatLabelKey)"
      :aria-pressed="isRepeatActive"
      @click="handleRepeat"
    >
      <!-- Repeat-One Icon (🔂) — the "1" is what separates track from queue -->
      <svg
        v-if="playbackStore.repeatMode === 'track'"
        data-testid="repeat-icon-track"
        class="h-5 w-5"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"
        />
      </svg>

      <!-- Repeat Icon (🔁) -->
      <svg
        v-else
        :data-testid="`repeat-icon-${playbackStore.repeatMode}`"
        class="h-5 w-5"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
      </svg>

      <span
        v-if="isRepeatActive"
        data-testid="repeat-active-dot"
        class="absolute bottom-1 h-1 w-1 rounded-full bg-current"
      />
    </button>
  </div>
</template>
