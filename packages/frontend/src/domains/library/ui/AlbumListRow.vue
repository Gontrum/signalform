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
    data-testid="album-list-row"
    class="group flex cursor-pointer items-center gap-4 rounded-lg p-3 hover:bg-neutral-50"
    @click="emit('click:navigate', album.id)"
  >
    <!-- 48px thumbnail -->
    <div
      class="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-gradient-to-br from-accent-400 to-accent-600"
    >
      <img
        v-if="!coverError"
        :src="album.coverArtUrl"
        :alt="`${album.title} by ${album.artist}`"
        data-testid="list-row-thumbnail"
        loading="lazy"
        class="h-full w-full object-cover"
        @error="onCoverError"
      />
      <div v-else class="flex h-full w-full items-center justify-center">
        <svg
          class="h-6 w-6 text-white opacity-80"
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
    </div>

    <!-- Text info -->
    <div class="min-w-0 flex-1">
      <p data-testid="list-row-title" class="truncate text-sm font-medium text-neutral-900">
        {{ album.title }}
      </p>
      <p data-testid="list-row-artist" class="truncate text-xs text-neutral-500">
        {{ album.artist }}
      </p>
    </div>

    <!-- Release year -->
    <p data-testid="list-row-year" class="w-12 flex-shrink-0 text-right text-xs text-neutral-400">
      {{ album.releaseYear ?? '—' }}
    </p>

    <!-- Play button (hover-revealed) -->
    <button
      type="button"
      data-testid="list-row-play-button"
      class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-500 text-white opacity-0 transition-opacity hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400 group-hover:opacity-100"
      :aria-label="`Play ${album.title}`"
      @click.stop="emit('click:play', album.id)"
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>

    <!-- AC3 (Story 9.4): Add to Queue button (hover-revealed) -->
    <button
      type="button"
      data-testid="list-row-add-to-queue-button"
      class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 opacity-0 transition-opacity hover:border-accent-400 hover:text-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400 group-hover:opacity-100"
      :aria-label="`Add ${album.title} to queue`"
      @click.stop="emit('click:add-to-queue', album.id)"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
</template>
