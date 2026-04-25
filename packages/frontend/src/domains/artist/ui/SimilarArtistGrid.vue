<script setup lang="ts">
/**
 * SimilarArtistGrid Component
 *
 * Renders a 2–3-column grid of similar artist cards. Each card shows the
 * artist name, a match-percentage label, and an accent border when the
 * artist is in the local library.
 *
 * Used identically in ArtistDetailView and UnifiedArtistView.
 */
import { useI18nStore } from '@/app/i18nStore'
import type { SimilarArtistMatch } from '../core/types'

interface Props {
  artists: readonly SimilarArtistMatch[]
}

defineProps<Props>()

defineEmits<{
  select: [artist: SimilarArtistMatch]
}>()

const i18n = useI18nStore()
const t = i18n.t
</script>

<template>
  <div v-if="artists.length > 0" data-testid="similar-artists-section" class="mt-8">
    <h2 class="mb-4 text-lg font-semibold text-neutral-900">
      {{ t('artist.similarHeading') }}
    </h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <button
        v-for="artist in artists.slice(0, 6)"
        :key="artist.name"
        type="button"
        data-testid="similar-artist-card"
        class="rounded-lg border p-3 text-left hover:bg-neutral-50"
        :class="artist.inLibrary ? 'border-accent-400' : 'border-neutral-200'"
        @click="$emit('select', artist)"
      >
        <span v-if="artist.inLibrary" data-testid="similar-artist-in-library" class="sr-only">{{
          t('artist.similarInLibrarySr')
        }}</span>
        <p class="truncate text-sm font-medium text-neutral-900">
          {{ artist.name }}
        </p>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{
            t('artist.similarMatch').replace('{percent}', String(Math.round(artist.match * 100)))
          }}
        </p>
      </button>
    </div>
  </div>
</template>
