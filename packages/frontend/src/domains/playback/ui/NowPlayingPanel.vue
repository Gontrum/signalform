<script setup lang="ts">
import { ref } from 'vue'
import { formatSeconds } from '@signalform/shared'
import AlbumCover from '@/ui/AlbumCover.vue'
import QualityBadge from '@/ui/QualityBadge.vue'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { useNowPlayingPanel } from '@/domains/playback/shell/useNowPlayingPanel'
import PlaybackControls from './PlaybackControls.vue'
import VolumeControl from './VolumeControl.vue'
import ProgressBar from './ProgressBar.vue'
import { useI18nStore } from '@/app/i18nStore'
import { useLoveTrack } from '@/domains/playback/shell/useLoveTrack'
import { useSleepTimer } from '@/domains/playback/shell/useSleepTimer'

const {
  playbackStore,
  queuedTracks,
  sourceTooltip,
  trackAnnouncement,
  alsoAvailableText,
  navigateToArtist,
  navigateToAlbum,
  navigateToQueue,
} = useNowPlayingPanel()
const i18nStore = useI18nStore()
const { isPhone } = useResponsiveLayout()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)
const { hasLastFmSession, isLoved, isLoving, toggleLove } = useLoveTrack()

const { remainingSeconds, isActive: isSleepTimerActive, setTimer, cancel } = useSleepTimer()
const isSleepMenuOpen = ref(false)

const sleepPresets: ReadonlyArray<{ minutes: number; key: import('@/i18n').MessageKey }> = [
  { minutes: 15, key: 'sleepTimer.min15' },
  { minutes: 30, key: 'sleepTimer.min30' },
  { minutes: 45, key: 'sleepTimer.min45' },
  { minutes: 60, key: 'sleepTimer.min60' },
]

const toggleSleepMenu = (): void => {
  isSleepMenuOpen.value = !isSleepMenuOpen.value
}

const selectSleepPreset = async (minutes: number): Promise<void> => {
  isSleepMenuOpen.value = false
  await setTimer(minutes)
}

const selectSleepOff = async (): Promise<void> => {
  isSleepMenuOpen.value = false
  await cancel()
}
</script>

<template>
  <div
    data-testid="now-playing-panel"
    class="flex min-h-full flex-col items-center rounded-2xl border border-neutral-200 bg-white px-5 pb-5 pt-6 shadow-md sm:sticky sm:top-0 sm:h-full sm:justify-center sm:p-8"
    :class="{
      'justify-start': isPhone,
    }"
  >
    <!-- Screen reader track announcement — updates when track changes -->
    <div
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="track-announcement"
    >
      {{ trackAnnouncement }}
    </div>

    <!-- Playing State -->
    <div
      v-if="playbackStore.hasCurrentTrack"
      class="flex w-full flex-col items-center text-center"
      role="region"
      aria-label="Now Playing"
    >
      <AlbumCover
        :cover-art-url="playbackStore.currentTrack?.coverArtUrl"
        :alt="`${playbackStore.currentTrack?.title ?? ''} by ${playbackStore.currentTrack?.artist ?? ''}`"
      />

      <!-- Track Info -->
      <div class="w-full max-w-sm space-y-2">
        <h2 data-testid="track-title" class="text-xl font-semibold text-neutral-900 truncate">
          {{ playbackStore.currentTrack?.title }}
        </h2>
        <button
          v-if="playbackStore.currentTrack?.artist"
          type="button"
          data-testid="track-artist"
          :aria-label="`Go to ${playbackStore.currentTrack?.artist ?? 'artist'} page`"
          class="min-h-[44px] px-2 text-base text-neutral-600 truncate hover:underline hover:text-neutral-900 focus:underline focus:text-neutral-900 focus:outline-none"
          @click="navigateToArtist"
        >
          {{ playbackStore.currentTrack?.artist }}
        </button>
        <p v-else data-testid="track-artist" class="text-base text-neutral-600 truncate">
          {{ playbackStore.currentTrack?.artist }}
        </p>
        <button
          v-if="playbackStore.currentTrack?.albumId"
          type="button"
          data-testid="track-album"
          :aria-label="`Go to ${playbackStore.currentTrack?.album ?? 'album'} page`"
          class="min-h-[44px] px-2 text-sm text-neutral-500 truncate hover:underline hover:text-neutral-700 focus:underline focus:text-neutral-700 focus:outline-none"
          @click="navigateToAlbum"
        >
          {{ playbackStore.currentTrack?.album }}
        </button>
        <p v-else data-testid="track-album" class="text-sm text-neutral-500 truncate">
          {{ playbackStore.currentTrack?.album }}
        </p>
        <!-- Love Button -->
        <div v-if="hasLastFmSession" class="mt-2 flex justify-center">
          <button
            type="button"
            :aria-label="isLoved ? 'Unlove track on Last.fm' : 'Love track on Last.fm'"
            :disabled="isLoving"
            data-testid="love-button"
            class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:text-red-500 focus:outline-none focus:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            :class="{ 'text-red-500': isLoved }"
            @click="toggleLove"
          >
            <svg
              class="h-6 w-6"
              :fill="isLoved ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </button>
        </div>
        <!-- Source info (Story 3.3 badge + Story 3.4 tooltip & also-available) -->
        <!-- audioQuality set for Tidal tracks (inferred from URL extension via parseTidalAudioQuality) -->
        <div
          v-if="
            playbackStore.currentTrack?.source && playbackStore.currentTrack?.source !== 'unknown'
          "
          class="mt-2 space-y-1"
          data-testid="source-info"
        >
          <span :title="sourceTooltip">
            <QualityBadge
              :source="playbackStore.currentTrack.source"
              :quality="playbackStore.currentTrack.audioQuality"
            />
          </span>
          <p
            v-if="alsoAvailableText"
            data-testid="also-available-now-playing"
            class="text-xs text-neutral-600"
          >
            {{ alsoAvailableText }}
          </p>
        </div>
      </div>

      <!-- Playback Status Badge -->
      <div
        v-if="playbackStore.isCurrentlyPlaying"
        data-testid="playing-badge"
        class="mt-4 inline-flex items-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-sm font-medium text-accent-700"
      >
        <!-- Animated playing icon -->
        <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        {{ t('nowPlaying.playingBadge') }}
      </div>

      <div
        v-else-if="playbackStore.isPaused"
        data-testid="paused-badge"
        class="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600"
      >
        <!-- Pause icon -->
        <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
        {{ t('nowPlaying.pausedBadge') }}
      </div>

      <!-- Sleep Timer -->
      <div class="relative mt-4 flex items-center justify-center">
        <button
          type="button"
          data-testid="sleep-timer-button"
          :aria-label="t('sleepTimer.label')"
          :aria-expanded="isSleepMenuOpen"
          aria-haspopup="menu"
          class="flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 focus:text-neutral-900 focus:outline-none transition-colors"
          :class="{ 'bg-accent-100 text-accent-700 hover:text-accent-700': isSleepTimerActive }"
          @click="toggleSleepMenu"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
            />
          </svg>
          <span v-if="isSleepTimerActive" data-testid="sleep-timer-remaining">
            {{ formatSeconds(remainingSeconds) }}
          </span>
          <span v-else>{{ t('sleepTimer.label') }}</span>
        </button>

        <!-- Backdrop closes the menu on outside click -->
        <button
          v-if="isSleepMenuOpen"
          type="button"
          aria-hidden="true"
          tabindex="-1"
          class="fixed inset-0 z-10 cursor-default"
          @click="isSleepMenuOpen = false"
        />

        <div
          v-if="isSleepMenuOpen"
          data-testid="sleep-timer-menu"
          role="menu"
          :aria-label="t('sleepTimer.label')"
          class="absolute bottom-full left-1/2 z-20 mb-2 flex w-40 -translate-x-1/2 flex-col rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
        >
          <button
            v-for="preset in sleepPresets"
            :key="preset.minutes"
            type="button"
            role="menuitem"
            :data-testid="`sleep-timer-preset-${preset.minutes}`"
            class="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm text-neutral-800 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
            @click="selectSleepPreset(preset.minutes)"
          >
            {{ t(preset.key) }}
          </button>
          <button
            v-if="isSleepTimerActive"
            type="button"
            role="menuitem"
            data-testid="sleep-timer-off"
            class="mt-1 flex min-h-[44px] items-center rounded-lg border-t border-neutral-100 px-3 text-left text-sm text-neutral-800 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
            @click="selectSleepOff"
          >
            {{ t('sleepTimer.off') }}
          </button>
        </div>
      </div>

      <!-- Playback Controls -->
      <div class="mt-6 flex items-center justify-center">
        <PlaybackControls />
      </div>

      <!-- Volume Control -->
      <div class="mt-2 w-full max-w-sm">
        <VolumeControl />
      </div>

      <!-- Progress Bar -->
      <div class="mt-2 w-full max-w-sm">
        <ProgressBar />
      </div>

      <!-- Queue Preview (Story 4.6) -->
      <div
        class="mt-4 w-full max-w-sm pb-1"
        data-testid="queue-preview"
        aria-label="Upcoming tracks"
      >
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
          {{ t('nowPlaying.upNext') }}
        </h3>
        <ul v-if="playbackStore.queuePreview.length > 0" class="space-y-1">
          <li
            v-for="track in playbackStore.queuePreview"
            :key="track.id"
            data-testid="queue-preview-item"
            class="overflow-hidden"
          >
            <p class="truncate text-sm">
              <span class="font-medium text-neutral-800">{{ track.title }}</span>
              <span class="text-neutral-500"> · {{ track.artist }}</span>
            </p>
          </li>
        </ul>
        <p v-else data-testid="queue-empty" class="text-sm text-neutral-600">
          {{ t('nowPlaying.queueEmpty') }}
        </p>
        <button
          type="button"
          data-testid="view-full-queue"
          class="mt-2 min-h-[44px] px-2 text-xs text-neutral-700 underline hover:text-neutral-900 focus:outline-none focus:text-neutral-900"
          @click="navigateToQueue"
        >
          {{ t('nowPlaying.viewFullQueue') }}
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else data-testid="empty-state" class="flex flex-col items-center text-center">
      <!-- Placeholder Album Cover -->
      <div
        data-testid="placeholder-album-cover"
        class="mb-6 flex h-[120px] w-[120px] md:h-[160px] md:w-[160px] lg:h-[200px] lg:w-[200px] items-center justify-center rounded-lg bg-neutral-100"
      >
        <!-- Music Note Icon (simple SVG) -->
        <svg
          class="h-12 w-12 md:h-14 md:w-14 lg:h-20 lg:w-20 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      </div>

      <!-- Empty State Text -->
      <h2 class="mb-2 text-xl font-semibold text-neutral-900">
        {{ t('nowPlaying.emptyTitle') }}
      </h2>
      <p class="text-sm text-neutral-500">
        {{ t('nowPlaying.emptySubtitle') }}
      </p>

      <div
        v-if="queuedTracks.length > 0"
        class="mt-6 w-full max-w-sm pb-1 text-left"
        data-testid="queued-empty-state"
        aria-label="Queued tracks"
      >
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
          {{ t('nowPlaying.upNext') }}
        </h3>
        <ul class="space-y-1">
          <li
            v-for="track in queuedTracks"
            :key="track.id"
            data-testid="queued-empty-state-item"
            class="overflow-hidden"
          >
            <p class="truncate text-sm">
              <span class="font-medium text-neutral-800">{{ track.title }}</span>
              <span class="text-neutral-500"> · {{ track.artist }}</span>
            </p>
          </li>
        </ul>
        <button
          type="button"
          data-testid="view-full-queue-empty-state"
          class="mt-2 min-h-[44px] px-2 text-xs text-neutral-700 underline hover:text-neutral-900 focus:outline-none focus:text-neutral-900"
          @click="navigateToQueue"
        >
          {{ t('nowPlaying.viewFullQueue') }}
        </button>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-if="playbackStore.hasError"
      data-testid="playback-error"
      class="mt-4 w-full max-w-sm rounded-lg border border-red-200 bg-red-50 p-4"
      role="alert"
      aria-live="assertive"
    >
      <p class="text-sm font-medium text-red-800">
        {{ playbackStore.error }}
      </p>
      <button
        type="button"
        class="mt-2 min-h-[44px] px-2 text-xs font-medium text-red-600 underline hover:text-red-700"
        @click="playbackStore.clearError"
      >
        Dismiss
      </button>
    </div>

    <!-- LMS Connectivity Error Banner (S02) -->
    <div
      v-if="playbackStore.isLmsDisconnected"
      data-testid="lms-error-banner"
      class="mt-4 w-full max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-4"
      role="alert"
      aria-live="assertive"
    >
      <p class="text-sm font-medium text-amber-900">
        {{ playbackStore.lmsError }}
      </p>
      <button
        type="button"
        data-testid="lms-retry-button"
        :disabled="playbackStore.isRetryingLms"
        class="mt-2 flex min-h-[44px] items-center gap-1.5 px-2 text-xs font-medium text-amber-700 underline hover:text-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="playbackStore.retryLmsConnection()"
      >
        <span v-if="playbackStore.isRetryingLms" aria-hidden="true">↻</span>
        {{ playbackStore.isRetryingLms ? 'Connecting…' : 'Retry' }}
      </button>
    </div>
  </div>
</template>
