<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import MainNavBar from '@/app/MainNavBar.vue'
import ArtistHero from './ArtistHero.vue'
import SimilarArtistGrid from './SimilarArtistGrid.vue'
import { useUnifiedArtistView } from '../shell/useUnifiedArtistView'

const i18n = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)
const {
  status,
  data,
  errorMessage,
  enrichment,
  enrichmentLoading,
  enrichmentError,
  heroImageUrl,
  similarArtists,
  artistName,
  coverErrors,
  goBack,
  handleLocalAlbumClick,
  handleTidalAlbumClick,
  handleSimilarArtistClick,
  onCoverError,
} = useUnifiedArtistView(t('artist.errorNotFoundMessage'))
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-white p-6" data-testid="unified-artist-view">
    <MainNavBar />
    <!-- Back button -->
    <button
      type="button"
      class="mb-6 flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
      data-testid="back-button"
      @click="goBack"
    >
      ← {{ t('settings.fullResultsBack') }}
    </button>

    <!-- Loading -->
    <div
      v-if="status === 'loading'"
      class="flex h-64 items-center justify-center"
      data-testid="loading-state"
    >
      <div
        class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"
        role="status"
      >
        <span class="sr-only">{{ t('home.loading') }}</span>
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="status === 'error'"
      class="flex h-64 items-center justify-center"
      data-testid="error-state"
    >
      <p class="text-lg font-medium text-red-600">
        {{ errorMessage || t('artist.errorServerMessage') }}
      </p>
    </div>

    <!-- Success -->
    <div v-else-if="status === 'success' && data">
      <!-- Artist header (with optional hero background) -->
      <ArtistHero :hero-image-url="heroImageUrl">
        <template #default="{ hasImage }">
          <h1
            data-testid="artist-name"
            :class="
              hasImage ? 'text-3xl font-bold text-white' : 'text-3xl font-bold text-neutral-900'
            "
          >
            {{ artistName }}
          </h1>

          <!-- Enrichment heading -->
          <h2
            v-if="enrichment || enrichmentError.kind !== 'none'"
            data-testid="artist-enrichment-heading"
            :class="
              hasImage
                ? 'mt-3 text-sm font-semibold uppercase tracking-wide text-white/80'
                : 'mt-3 text-sm font-semibold uppercase tracking-wide text-neutral-600'
            "
          >
            {{ t('artist.enrichment.heading') }}
          </h2>

          <!-- Enrichment skeleton -->
          <div v-if="enrichmentLoading" data-testid="enrichment-skeleton" class="mt-2 space-y-2">
            <div class="h-4 w-48 animate-pulse rounded bg-neutral-100" />
            <div class="h-3 w-full animate-pulse rounded bg-neutral-100" />
            <div class="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
          </div>

          <!-- Enrichment error message -->
          <p
            v-else-if="enrichmentError.kind === 'not-found'"
            data-testid="enrichment-error-not-found"
            :class="hasImage ? 'mt-2 text-sm text-white/70' : 'mt-2 text-sm text-neutral-500'"
          >
            {{ t('artist.enrichment.error.notFound') }}
          </p>
          <p
            v-else-if="enrichmentError.kind === 'unavailable'"
            data-testid="enrichment-error-unavailable"
            :class="hasImage ? 'mt-2 text-sm text-white/70' : 'mt-2 text-sm text-neutral-500'"
          >
            {{ t('artist.enrichment.error.unavailable') }}
          </p>

          <!-- Enrichment data -->
          <template v-else-if="enrichment">
            <div
              data-testid="enrichment-stats"
              :class="hasImage ? 'mt-1 text-sm text-white/80' : 'mt-1 text-sm text-neutral-500'"
            >
              {{ enrichment.listeners.toLocaleString() }} listeners ·
              {{ enrichment.playcount.toLocaleString() }} plays
            </div>
            <p
              v-if="enrichment.bio"
              data-testid="enrichment-bio"
              :class="
                hasImage
                  ? 'mt-3 text-sm text-white/80 leading-relaxed line-clamp-4'
                  : 'mt-3 text-sm text-neutral-600 leading-relaxed line-clamp-4'
              "
            >
              {{ enrichment.bio }}
            </p>
            <div
              v-if="enrichment.tags.length > 0"
              data-testid="enrichment-tags"
              class="mt-3 flex flex-wrap gap-2"
            >
              <span
                v-for="tag in enrichment.tags"
                :key="tag"
                :class="
                  hasImage
                    ? 'text-xs border border-white/40 rounded-full px-2 py-0.5 text-white/80'
                    : 'text-xs border border-neutral-200 rounded-full px-2 py-0.5 text-neutral-600'
                "
              >
                {{ tag }}
              </span>
            </div>
          </template>
        </template>
      </ArtistHero>

      <!-- Empty state — both sections empty -->
      <div
        v-if="data.localAlbums.length === 0 && data.tidalAlbums.length === 0"
        class="flex h-48 items-center justify-center"
        data-testid="no-albums-message"
      >
        <p class="text-neutral-500">
          {{ t('artist.localEmpty').replace('{name}', artistName) }}
        </p>
      </div>

      <!-- In your library section -->
      <section v-if="data.localAlbums.length > 0" class="mb-10" data-testid="local-section">
        <h2 class="mb-4 text-xl font-semibold text-neutral-800">
          {{
            t(
              'queue.backToNowPlaying',
            ) /* reuse: "Back to now playing" is not ideal; consider new key */
          }}
        </h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <button
            v-for="album in data.localAlbums"
            :key="album.id"
            type="button"
            class="flex cursor-pointer flex-col items-start gap-2 rounded-lg p-2 text-left hover:bg-neutral-50"
            data-testid="local-album-item"
            @click="handleLocalAlbumClick(album)"
          >
            <div class="relative aspect-square w-full overflow-hidden rounded-lg bg-neutral-100">
              <img
                v-if="album.coverArtUrl && !coverErrors[album.id]"
                :src="album.coverArtUrl"
                :alt="`Cover for ${album.title}`"
                class="h-full w-full object-cover"
                data-testid="album-cover"
                @error="onCoverError(album.id)"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center text-2xl text-neutral-400"
              >
                ♪
              </div>
            </div>
            <div class="w-full">
              <p class="truncate text-sm font-medium text-neutral-900" data-testid="album-title">
                {{ album.title }}
              </p>
              <p class="truncate text-xs text-neutral-500">{{ album.artist }}</p>
            </div>
          </button>
        </div>
      </section>

      <!-- On Tidal section -->
      <section v-if="data.tidalAlbums.length > 0" class="mb-10" data-testid="tidal-section">
        <h2 class="mb-4 text-xl font-semibold text-neutral-800">On Tidal</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <button
            v-for="album in data.tidalAlbums"
            :key="album.id"
            type="button"
            class="flex cursor-pointer flex-col items-start gap-2 rounded-lg p-2 text-left hover:bg-neutral-50"
            data-testid="tidal-album-item"
            @click="handleTidalAlbumClick(album)"
          >
            <div class="relative aspect-square w-full overflow-hidden rounded-lg bg-neutral-100">
              <img
                v-if="album.coverArtUrl && !coverErrors[album.id]"
                :src="album.coverArtUrl"
                :alt="`Cover for ${album.title}`"
                class="h-full w-full object-cover"
                data-testid="album-cover"
                @error="onCoverError(album.id)"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center text-2xl text-neutral-400"
              >
                ♪
              </div>
            </div>
            <div class="w-full">
              <p class="truncate text-sm font-medium text-neutral-900" data-testid="album-title">
                {{ album.title }}
              </p>
              <p class="truncate text-xs text-neutral-500">{{ album.artist }}</p>
            </div>
          </button>
        </div>
      </section>

      <!-- Similar artists section -->
      <SimilarArtistGrid :artists="similarArtists" @select="handleSimilarArtistClick" />
    </div>
  </div>
</template>
