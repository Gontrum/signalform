<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    coverArtUrl?: string
    alt?: string
  }>(),
  { coverArtUrl: undefined, alt: 'Album cover' },
)

const thumbnailLoaded = ref(false)
const fullLoaded = ref(false)
const hasError = ref(false)
const hasFullResError = ref(false)

const thumbnailUrl = computed((): string | null => {
  if (!props.coverArtUrl) return null

  if (props.coverArtUrl.startsWith('/api/playback/cover?src=')) {
    try {
      const proxied = new URL(props.coverArtUrl, 'http://localhost')
      const src = proxied.searchParams.get('src')
      if (!src) return props.coverArtUrl

      const upstream = new URL(src)
      upstream.pathname = upstream.pathname.replace(/\/cover\.jpg$/, '/cover_100x100.jpg')
      proxied.searchParams.set('src', upstream.toString())
      return `${proxied.pathname}?${proxied.searchParams.toString()}`
    } catch {
      return props.coverArtUrl
    }
  }

  return props.coverArtUrl.replace(/\/cover\.jpg$/, '/cover_100x100.jpg')
})

const showImage = computed(() => Boolean(props.coverArtUrl) && !hasError.value)
const showMusicNote = computed(() => !props.coverArtUrl || hasError.value)

// Reset state when track changes
watch(
  () => props.coverArtUrl,
  () => {
    thumbnailLoaded.value = false
    fullLoaded.value = false
    hasError.value = false
    hasFullResError.value = false
  },
)

const handleThumbnailLoad = (): void => {
  thumbnailLoaded.value = true
}
const handleFullLoad = (): void => {
  fullLoaded.value = true
}
const handleError = (): void => {
  hasError.value = true
}
const handleFullResError = (): void => {
  // Full-res failed: stay on thumbnail instead of falling back to music note
  hasFullResError.value = true
}
</script>

<template>
  <div
    data-testid="album-cover"
    class="relative mb-6 flex h-[120px] w-[120px] md:h-[160px] md:w-[160px] lg:h-[200px] lg:w-[200px] flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg items-center justify-center"
  >
    <!-- Music note fallback (shown when no URL or on error) -->
    <svg
      v-show="showMusicNote"
      data-testid="album-cover-fallback"
      class="h-12 w-12 md:h-14 md:w-14 lg:h-20 lg:w-20 text-white opacity-80"
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

    <!-- Thumbnail (loads first — fast) -->
    <img
      v-if="showImage && thumbnailUrl"
      :src="thumbnailUrl"
      :alt="alt"
      data-testid="album-cover-thumbnail"
      class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
      :class="thumbnailLoaded ? 'opacity-100' : 'opacity-0'"
      loading="eager"
      fetchpriority="high"
      decoding="async"
      @load="handleThumbnailLoad"
      @error="handleError"
    />

    <!-- Full-resolution (loads after thumbnail is visible) -->
    <img
      v-if="showImage && thumbnailLoaded && !hasFullResError"
      :src="coverArtUrl"
      :alt="alt"
      aria-hidden="true"
      data-testid="album-cover-image"
      class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
      :class="fullLoaded ? 'opacity-100' : 'opacity-0'"
      loading="eager"
      fetchpriority="high"
      decoding="async"
      @load="handleFullLoad"
      @error="handleFullResError"
    />
  </div>
</template>
