<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import type { LibraryAlbum } from '@/domains/library/core/types'

const props = defineProps<{
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

const navigate = (): void => {
  emit('click:navigate', props.album.id)
}

const i18n = useI18nStore()

const navigateAriaLabel = computed(() =>
  i18n
    .t('library.viewAlbum')
    .replace('{title}', props.album.title)
    .replace('{name}', props.album.artist),
)

const playAriaLabel = computed(() =>
  i18n.t('home.playAlbumAria').replace('{title}', props.album.title),
)

const addToQueueAriaLabel = computed(() =>
  i18n.t('home.addAlbumToQueue').replace('{title}', props.album.title),
)
</script>

<template>
  <!--
    `relative` here is the positioning context for the hover overlay below,
    which is a sibling of the "navigate" region (not a descendant of it) so a
    screen reader/AT user never encounters an interactive control nested
    inside another one (axe nested-interactive, WCAG 4.1.2). The overlay is
    pinned to the top of this card via `inset-x-0 top-0 aspect-square`, which
    matches the cover image's own `aspect-square` sizing below it.
  -->
  <div data-testid="album-card" class="group relative cursor-pointer">
    <!--
      Single "navigate" region: wraps both the cover image and the title/
      artist info block as ONE interactive control (one tab-stop) rather
      than two, since both areas trigger the same action.
    -->
    <div
      data-testid="album-navigate-button"
      role="button"
      tabindex="0"
      :aria-label="navigateAriaLabel"
      @click="navigate"
      @keydown.enter="navigate"
      @keydown.space.prevent="navigate"
    >
      <div
        class="relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-accent-400 to-accent-600"
      >
        <img
          v-if="!coverError"
          :src="album.coverArtUrl"
          alt=""
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
      </div>

      <div class="mt-2 px-1">
        <p data-testid="album-title" class="truncate text-sm font-semibold text-neutral-900">
          {{ album.title }}
        </p>
        <p data-testid="album-artist" class="truncate text-xs text-neutral-500">
          {{ album.artist }}
        </p>
      </div>
    </div>

    <!--
      Hover overlay: sibling of the "navigate" region above (see comment
      there), not a descendant of it, so its two real buttons stay outside
      any interactive ancestor's subtree.

      The overlay container itself stays `pointer-events-none` PERMANENTLY
      (never `group-hover:pointer-events-auto`): Playwright's `.click()` (and
      any real mouse pointer) moves over the card before clicking, which sets
      real CSS `:hover` — if the whole overlay div became hit-testable on
      hover, it would sit on top of (and swallow clicks meant for) the
      "navigate" region beneath for every pixel in its footprint, not just the
      two buttons, since it is painted after (and covers the same footprint
      as) the cover image. Each button re-enables its own
      `pointer-events-auto` instead — a child can opt back into hit-testing
      even though its `pointer-events: none` ancestor does not — so the
      buttons stay clickable on hover while every other point in the overlay
      area still falls through to "navigate" beneath.
    -->
    <div
      data-testid="album-hover-overlay"
      class="absolute inset-x-0 top-0 aspect-square overflow-hidden rounded-lg flex items-center justify-center gap-2 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <button
        type="button"
        data-testid="play-album-button"
        class="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-lg hover:bg-white hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
        :aria-label="playAriaLabel"
        @click.stop="emit('click:play', album.id)"
      >
        <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>

      <button
        type="button"
        data-testid="add-album-to-queue-button"
        class="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-900 shadow hover:bg-white hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
        :aria-label="addToQueueAriaLabel"
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
</template>
