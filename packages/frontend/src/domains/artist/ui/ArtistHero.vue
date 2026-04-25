<script setup lang="ts">
/**
 * ArtistHero Component
 *
 * Hero banner for artist pages. When a hero image URL is provided it renders
 * as a full-bleed background image with a dark gradient overlay so white text
 * stays readable. Without an image it falls back to a plain white background
 * with dark text — callers don't need to know which state is active.
 *
 * The component is a pure layout wrapper; all content (artist name,
 * enrichment stats, similar artists, etc.) is passed via the default slot.
 */

interface Props {
  /** Fanart.tv hero image URL, or null when not yet loaded / unavailable */
  heroImageUrl: string | null
  /** data-testid applied to the root element */
  testId?: string
}

withDefaults(defineProps<Props>(), {
  testId: 'artist-hero',
})
</script>

<template>
  <div
    class="relative mb-8 overflow-hidden rounded-xl"
    :style="
      heroImageUrl
        ? {
            backgroundImage: `url(${heroImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 20%',
            minHeight: '200px',
          }
        : undefined
    "
    :data-testid="testId"
  >
    <!-- Dark gradient overlay — only when hero image is present -->
    <div
      v-if="heroImageUrl"
      class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
    />

    <!-- Content slot: receives heroImageUrl as a scoped slot prop so
         callers can adapt text colours without duplicating the null-check -->
    <div :class="heroImageUrl ? 'relative z-10 p-6' : 'py-2'">
      <slot :has-image="heroImageUrl !== null" />
    </div>
  </div>
</template>
