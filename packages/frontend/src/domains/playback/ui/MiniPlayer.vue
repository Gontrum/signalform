<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'
import { usePhonePlaybackShortcut } from '@/domains/playback/shell/usePhonePlaybackShortcut'

const router = useRouter()
const i18nStore = useI18nStore()
const {
  playbackStore,
  hasQueuedTracks,
  shouldShowPhonePlaybackShortcut,
  phonePlaybackShortcutLabel,
} = usePhonePlaybackShortcut()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

const navigateToNowPlaying = (): void => {
  void router.push('/now-playing')
}

const navigateToQueue = (): void => {
  void router.push('/queue')
}
</script>

<template>
  <div
    v-if="shouldShowPhonePlaybackShortcut"
    data-testid="mini-player-bar"
    class="flex min-h-[56px] w-full flex-shrink-0 items-stretch border-t border-neutral-200 bg-white"
  >
    <button
      data-testid="mini-player"
      type="button"
      class="flex min-w-0 flex-1 items-center gap-3 bg-transparent px-4 py-3 text-left hover:bg-neutral-50"
      :aria-label="phonePlaybackShortcutLabel"
      @click="navigateToNowPlaying"
      @keydown.space.prevent="navigateToNowPlaying"
    >
      <!-- Track info -->
      <div class="min-w-0 flex-1">
        <p data-testid="mini-player-title" class="truncate text-sm font-medium text-neutral-900">
          {{ playbackStore.currentTrack?.title ?? t('nav.queue') }}
        </p>
        <p data-testid="mini-player-artist" class="truncate text-xs text-neutral-500">
          {{
            playbackStore.currentTrack?.artist ??
            (hasQueuedTracks ? t('nowPlaying.viewFullQueue') : t('nowPlaying.queueEmpty'))
          }}
        </p>
      </div>

      <!-- Play/Pause indicator -->
      <div class="flex-shrink-0">
        <svg
          v-if="playbackStore.isCurrentlyPlaying"
          class="h-6 w-6 text-accent-500"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <!-- Pause icon -->
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
        <svg
          v-else
          class="h-6 w-6 text-accent-500"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <!-- Play icon -->
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </button>

    <!-- Queue shortcut -->
    <button
      data-testid="mini-player-queue"
      type="button"
      class="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center bg-transparent pl-2 pr-4 hover:bg-neutral-50"
      :aria-label="t('nowPlaying.viewFullQueue')"
      @click="navigateToQueue"
    >
      <svg
        class="h-6 w-6 text-accent-500"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <!-- Queue icon: stacked list with note -->
        <path
          d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zm14-10v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
        />
      </svg>
    </button>
  </div>
</template>
