<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'

const router = useRouter()
const { isPhone, isTablet, isDesktop } = useResponsiveLayout()
const playbackStore = usePlaybackStore()

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
        'pb-[calc(4rem+env(safe-area-inset-bottom))]': isPhone && playbackStore.hasCurrentTrack,
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
      v-if="isPhone && playbackStore.hasCurrentTrack"
      data-testid="mini-player"
      type="button"
      class="fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-50 flex w-full items-center gap-3 border-t border-neutral-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg"
      aria-label="Open Now Playing"
      @click="navigateToNowPlaying"
      @keydown.space.prevent="navigateToNowPlaying"
    >
      <!-- Track info -->
      <div class="min-w-0 flex-1">
        <p data-testid="mini-player-title" class="truncate text-sm font-medium text-neutral-900">
          {{ playbackStore.currentTrack?.title }}
        </p>
        <p data-testid="mini-player-artist" class="truncate text-xs text-neutral-500">
          {{ playbackStore.currentTrack?.artist }}
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
