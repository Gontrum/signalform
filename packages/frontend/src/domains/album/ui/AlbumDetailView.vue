<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import QualityBadge from '@/ui/QualityBadge.vue'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import PageHeader from '@/ui/PageHeader.vue'
import AlbumActionButtons from '@/domains/search/ui/AlbumActionButtons.vue'
import { buildCountLabel } from '@/domains/enrichment/core/service'
import { useAlbumDetailView } from '../shell/useAlbumDetailView'

const i18n = useI18nStore()

const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)

// Read per call like `t`: the language lands after setup, and the host default
// would otherwise group 1,234,567 into an otherwise German page.
const locale = (): string => i18n.currentLanguage

const {
  status,
  album,
  errorMessage,
  coverError,
  enrichment,
  albumEnrichmentLoading,
  albumEnrichmentError,
  queueSuccessUrls,
  queueErrorUrls,
  albumQueueSuccessFlag,
  albumQueueErrorFlag,
  albumQueueKey,
  onCoverError,
  handlePlayAlbum,
  handlePlayTrack,
  handleAddTrackToQueue,
  handleAddAlbumToQueue,
  handleArtistClick,
  formatDuration,
  detectSource,
} = useAlbumDetailView()

const playTrackAriaLabel = (title: string): string => t('album.playTrack').replace('{title}', title)

const addTrackToQueueAriaLabel = (title: string): string =>
  t('home.addTrackToQueue').replace('{title}', title)

const trackCountLabel = (count: number): string =>
  buildCountLabel(count, t('album.trackCountOne'), t('album.trackCountOther'), locale())

const listenersLabel = (count: number): string =>
  buildCountLabel(count, t('enrichment.listenersOne'), t('enrichment.listenersOther'), locale())

const playsLabel = (count: number): string =>
  buildCountLabel(count, t('enrichment.playsOne'), t('enrichment.playsOther'), locale())

const albumQueueButtonState = computed<'idle' | 'success' | 'error'>(() =>
  albumQueueErrorFlag.items.value.has(albumQueueKey)
    ? 'error'
    : albumQueueSuccessFlag.items.value.has(albumQueueKey)
      ? 'success'
      : 'idle',
)
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-white" data-testid="album-detail-view">
    <PageHeader :title="album?.title ?? t('album.titleFallback')" :show-back="true" />

    <div class="px-4 py-4 sm:px-6">
      <!-- Loading state -->
      <div
        v-if="status === 'loading'"
        data-testid="loading-state"
        class="flex justify-center py-20"
      >
        <LoadingSpinner size="lg" color="accent-400" />
      </div>

      <!-- Error: Not Found -->
      <div
        v-else-if="status === 'error-not-found'"
        data-testid="error-not-found"
        class="py-20 text-center text-neutral-500"
      >
        <p class="text-lg">
          {{ t('album.errorNotFoundTitle') }}
        </p>
        <p class="text-sm">
          {{ t('album.errorNotFoundMessage') }}
        </p>
        <p v-if="errorMessage" class="mt-1 text-xs">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Error: Server -->
      <div
        v-else-if="status === 'error-server'"
        data-testid="error-server"
        class="py-20 text-center text-neutral-500"
      >
        <p class="text-lg">
          {{ t('album.enrichment.error.unavailable') }}
        </p>
        <p class="text-sm">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success' && album" data-testid="album-detail-content">
        <!-- Header: cover + metadata + play album button -->
        <div class="mb-8 flex flex-col items-center gap-6 md:flex-row md:items-start">
          <!-- Album Cover -->
          <div
            data-testid="album-cover"
            class="h-50 w-50 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg md:h-75 md:w-75"
          >
            <img
              v-if="album.coverArtUrl && !coverError"
              :src="album.coverArtUrl"
              alt=""
              data-testid="album-cover-image"
              class="h-full w-full object-cover"
              loading="lazy"
              @error="onCoverError"
            />
            <div v-else class="flex h-full w-full items-center justify-center">
              <svg
                data-testid="album-cover-fallback"
                class="h-20 w-20 text-white opacity-80"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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

          <!-- Album metadata + Play Album -->
          <div class="flex flex-col gap-3">
            <h1 data-testid="album-title" class="text-2xl font-bold text-neutral-900">
              {{ album.title }}
            </h1>
            <!-- Artist always clickable: navigates to unified-artist view by name,
               or to Tidal artist-detail when tidalArtistId is known -->
            <button
              type="button"
              data-testid="artist-link-button"
              class="text-left text-lg text-accent-500 hover:text-accent-600 hover:underline"
              @click="handleArtistClick"
            >
              {{ album.artist }}
            </button>
            <p v-if="album.releaseYear" data-testid="album-year" class="text-sm text-neutral-500">
              {{ album.releaseYear }}
            </p>
            <p data-testid="album-track-count" class="text-sm text-neutral-500">
              {{ trackCountLabel(album.tracks.length) }}
            </p>

            <AlbumActionButtons
              size="large"
              :album-id="album.id"
              :album-title="album.title"
              :album-artist="album.artist"
              play-state="idle"
              :queue-state="albumQueueButtonState"
              @play="handlePlayAlbum"
              @add-to-queue="handleAddAlbumToQueue"
            />
          </div>
        </div>

        <!-- Tracklist -->
        <div data-testid="tracklist" class="space-y-1">
          <div
            v-for="track in album.tracks"
            :key="track.id"
            data-testid="track-item"
            class="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-neutral-50"
          >
            <!-- Track number -->
            <span class="w-6 text-right text-sm text-neutral-400">{{ track.trackNumber }}</span>

            <!-- Track info -->
            <div class="flex-1 overflow-hidden">
              <p class="text-sm font-medium text-neutral-900 sm:truncate">
                {{ track.title }}
              </p>
              <p class="text-xs text-neutral-500 sm:truncate">
                {{ track.artist }}
              </p>
            </div>

            <!-- Quality badge + duration: hidden on phone to give title more space -->
            <div class="hidden sm:contents">
              <QualityBadge
                v-if="track.audioQuality"
                :quality="track.audioQuality"
                :source="detectSource(track.url)"
                data-testid="track-quality-badge"
              />
              <span class="text-sm text-neutral-500">{{ formatDuration(track.duration) }}</span>
            </div>

            <!-- Play button -->
            <button
              type="button"
              data-testid="track-play-button"
              class="rounded-full p-2 text-accent-400 hover:bg-accent-400/10 hover:text-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!track.url"
              :aria-label="playTrackAriaLabel(track.title)"
              @click="handlePlayTrack(track.url)"
            >
              <svg
                class="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>

            <button
              type="button"
              data-testid="track-add-to-queue-button"
              class="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!track.url"
              :aria-label="addTrackToQueueAriaLabel(track.title)"
              @click="handleAddTrackToQueue(track.url)"
            >
              <svg
                v-if="queueSuccessUrls.items.value.has(track.url)"
                class="h-4 w-4 text-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <svg
                v-else-if="queueErrorUrls.items.value.has(track.url)"
                class="h-4 w-4 text-error"
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
                class="h-4 w-4"
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

        <!-- Album enrichment skeleton -->
        <div
          v-if="status === 'success' && albumEnrichmentLoading"
          data-testid="album-enrichment-skeleton"
          class="mt-8 space-y-2"
        >
          <div class="h-4 w-48 animate-pulse rounded bg-neutral-100" />
          <div class="h-3 w-full animate-pulse rounded bg-neutral-100" />
        </div>

        <!-- Album enrichment heading + error / content -->
        <div
          v-if="enrichment || albumEnrichmentError.kind !== 'none'"
          data-testid="album-enrichment-block-wrapper"
          class="mt-8"
        >
          <h2
            data-testid="album-enrichment-heading"
            class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600"
          >
            {{ t('album.enrichment.heading') }}
          </h2>

          <!-- Error messages -->
          <p
            v-if="albumEnrichmentError.kind === 'not-found'"
            data-testid="album-enrichment-error-not-found"
            class="text-sm text-neutral-500 mb-2"
          >
            {{ t('album.enrichment.error.notFound') }}
          </p>
          <p
            v-else-if="albumEnrichmentError.kind === 'unavailable'"
            data-testid="album-enrichment-error-unavailable"
            class="text-sm text-neutral-500 mb-2"
          >
            {{ t('album.enrichment.error.unavailable') }}
          </p>

          <!-- Enrichment content -->
          <div v-else-if="enrichment" data-testid="enrichment-block">
            <div data-testid="enrichment-stats" class="text-sm text-neutral-500 mt-2">
              {{ listenersLabel(enrichment.listeners) }} ·
              {{ playsLabel(enrichment.playcount) }}
            </div>
            <p
              v-if="enrichment.wiki"
              data-testid="enrichment-wiki"
              class="text-sm text-neutral-600 leading-relaxed mt-2"
            >
              {{ enrichment.wiki }}
            </p>
            <div
              v-if="enrichment.tags.length > 0"
              data-testid="enrichment-tags"
              class="flex flex-wrap gap-2 mt-2"
            >
              <span
                v-for="tag in enrichment.tags"
                :key="tag"
                class="text-xs border border-neutral-200 rounded-full px-2 py-0.5 text-neutral-600"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
