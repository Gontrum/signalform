<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { usePhonePlaybackShortcut } from '@/domains/playback/shell/usePhonePlaybackShortcut'

const router = useRouter()
const { isPhone, isTablet, isDesktop } = useResponsiveLayout()
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
</script>

<template>
  <div
    data-testid="layout-container"
    class="flex h-dvh min-h-0 w-full transition-all duration-300 ease-out"
    :class="{
      'flex-row gap-6': isTablet || isDesktop,
      'flex-col': isPhone,
    }"
  >
    <!-- Left Panel: Search (60% on tablet/desktop, 100% on phone) -->
    <main
      data-testid="left-panel"
      class="h-full overflow-hidden transition-all duration-300 ease-out"
      :class="{
        'w-full md:w-[60%]': isTablet || isDesktop,
        'w-full': isPhone,
        'pb-[calc(7rem+env(safe-area-inset-bottom))]': shouldShowPhonePlaybackShortcut,
      }"
    >
      <slot name="left" />
    </main>

    <!-- Right Panel: Now Playing (40% on tablet/desktop, hidden on phone) -->
    <aside
      v-if="isTablet || isDesktop"
      data-testid="right-panel"
      aria-label="Now Playing"
      class="h-full w-full overflow-hidden md:w-[40%] transition-all duration-300 ease-out"
    >
      <slot name="right" />
    </aside>

    <!-- Mini Player: visible on phone when a track is loaded -->
    <button
      v-if="shouldShowPhonePlaybackShortcut"
      data-testid="mini-player"
      type="button"
      class="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-50 flex min-h-[56px] items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-xl"
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
  </div>
</template>
