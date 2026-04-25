<script setup lang="ts">
import { ref } from 'vue'
import type { LibraryAlbum } from '@/domains/library/core/types'

defineProps<{
  album: LibraryAlbum
}>()

const emit = defineEmits<{
  (e: 'click:navigate', albumId: string): void
  (e: 'click:play', albumId: string): void
  (e: 'click:add-to-queue', albumId: string): void
}>()

const coverError = ref<boolean>(false)

const onCoverError = (): void => {
  coverError.value = true
}
</script>

<template>
  <div
    data-testid="album-card"
    class="group cursor-pointer"
    @click="emit('click:navigate', album.id)"
  >
    <!-- Cover image container -->
    <div
      class="relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-accent-400 to-accent-600"
    >
      <img
        v-if="!coverError"
        :src="album.coverArtUrl"
        :alt="`${album.title} by ${album.artist}`"
        data-testid="album-cover-img"
        loading="lazy"
        class="h-full w-full object-cover"
        @error="onCoverError"
      />

      <!-- Music note SVG fallback when cover fails to load -->
      <div v-else class="flex h-full w-full items-center justify-center">
        <svg
          class="h-16 w-16 text-white opacity-80"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      </div>

      <!-- Hover overlay -->
      <div
        data-testid="album-hover-overlay"
        class="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        <button
          type="button"
          data-testid="play-album-button"
          class="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-lg hover:bg-white hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
          :aria-label="`Play ${album.title}`"
          @click.stop="emit('click:play', album.id)"
        >
          <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        <!-- AC3 (Story 9.4): Add to Queue button in hover overlay -->
        <button
          type="button"
          data-testid="add-album-to-queue-button"
          class="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-900 shadow hover:bg-white hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
          :aria-label="`Add ${album.title} to queue`"
          @click.stop="emit('click:add-to-queue', album.id)"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Album info -->
    <div class="mt-2 px-1">
      <p data-testid="album-title" class="truncate text-sm font-semibold text-neutral-900">
        {{ album.title }}
      </p>
      <p data-testid="album-artist" class="truncate text-xs text-neutral-500">
        {{ album.artist }}
      </p>
    </div>
  </div>
</template>
