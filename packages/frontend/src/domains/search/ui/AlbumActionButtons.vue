<script setup lang="ts">
/**
 * AlbumActionButtons Component
 *
 * Renders the Play, Add-to-Queue and Go-to-Artist action buttons for an
 * album result row. The parent is responsible for providing the correct
 * handler functions.
 */
import { useI18nStore } from '@/app/i18nStore'

interface Props {
  albumId: string
  albumTitle: string
  albumArtist: string
  playState: 'idle' | 'success' | 'error'
  queueState: 'idle' | 'success' | 'error'
  showGoToArtist?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showGoToArtist: false,
})

interface Emits {
  (event: 'play'): void
  (event: 'add-to-queue'): void
  (event: 'go-to-artist'): void
}

const emit = defineEmits<Emits>()

const i18n = useI18nStore()
const t = i18n.t
</script>

<template>
  <div class="ml-4 flex gap-2">
    <button
      :data-testid="`play-album-button-${props.albumId}`"
      type="button"
      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white transition-all duration-200 ease-out hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 active:bg-accent-700 sm:px-6"
      :aria-label="`${t('home.playAlbum')} ${props.albumTitle}`"
      @click.stop="emit('play')"
    >
      <svg
        v-if="props.playState === 'success'"
        class="h-5 w-5 text-white sm:mr-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <svg
        v-else-if="props.playState === 'error'"
        class="h-5 w-5 text-red-200 sm:mr-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
      <svg
        v-else
        class="h-5 w-5 sm:mr-2"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
      <span data-testid="play-album-text" class="hidden sm:inline">{{ t('home.playAlbum') }}</span>
    </button>

    <button
      :data-testid="`add-album-to-queue-button-${props.albumId}`"
      type="button"
      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-accent-500 px-3 py-2 text-sm font-medium text-accent-500 transition-all duration-200 ease-out hover:bg-accent-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
      :aria-label="`${t('home.addAlbumToQueue')} ${props.albumTitle}`"
      @click.stop="emit('add-to-queue')"
    >
      <svg
        v-if="props.queueState === 'success'"
        class="h-5 w-5 text-green-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <svg
        v-else-if="props.queueState === 'error'"
        data-testid="add-album-to-queue-error"
        class="h-5 w-5 text-red-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
      <svg
        v-else
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>

    <button
      v-if="props.showGoToArtist && props.albumArtist"
      :data-testid="`go-to-artist-button-${props.albumId}`"
      type="button"
      class="hidden min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 transition-all duration-200 ease-out hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 sm:inline-flex"
      :aria-label="`${t('home.goToArtist')}: ${props.albumArtist}`"
      @click.stop="emit('go-to-artist')"
    >
      {{ t('home.goToArtist') }}
    </button>
  </div>
</template>
