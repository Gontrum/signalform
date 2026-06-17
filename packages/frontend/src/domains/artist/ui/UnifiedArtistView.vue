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
  topTracks,
  topTracksLoading,
  albumSort,
  sortedLocalAlbums,
  sortedTidalAlbums,
  goBack,
  handleLocalAlbumClick,
  handleTidalAlbumClick,
  handleSimilarArtistClick,
  handleTopTrackPlay,
  handleTopTrackAddToQueue,
  handleAllTopTracksAddToQueue,
  onCoverError,
  setAlbumSort,
  radioLoading,
  radioError,
  handleStartArtistRadio,
  genreRadioLoading,
  genreRadioError,
  genreRadioActiveTag,
  handleGenreRadioStart,
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

          <div class="mt-4 flex items-center gap-3">
            <button
              type="button"
              data-testid="artist-radio-button"
              :disabled="radioLoading"
              :class="
                hasImage
                  ? 'rounded-full bg-white/20 border border-white/40 px-4 py-2 text-sm font-medium text-white hover:bg-white/30 disabled:opacity-50'
                  : 'rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50'
              "
              @click="handleStartArtistRadio"
            >
              {{ radioLoading ? t('artist.radioStarting') : t('artist.startRadio') }}
            </button>
            <span
              v-if="radioError"
              data-testid="artist-radio-error"
              :class="hasImage ? 'text-sm text-red-300' : 'text-sm text-red-600'"
            >
              {{ t('artist.radioError') }}
            </span>
          </div>

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
              <button
                v-for="tag in enrichment.tags"
                :key="tag"
                type="button"
                data-testid="genre-tag-radio-button"
                :disabled="genreRadioLoading"
                :class="[
                  hasImage
                    ? 'text-xs border rounded-full px-2 py-0.5 cursor-pointer transition'
                    : 'text-xs border rounded-full px-2 py-0.5 cursor-pointer transition',
                  genreRadioError && genreRadioActiveTag === tag
                    ? 'border-red-400 text-red-500'
                    : hasImage
                      ? 'border-white/40 text-white/80 hover:bg-white/10'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100',
                  'disabled:opacity-50',
                ]"
                @click="handleGenreRadioStart(tag)"
              >
                {{ genreRadioLoading && genreRadioActiveTag === tag ? '…' : tag }}
              </button>
            </div>
            <p
              v-if="genreRadioError"
              data-testid="genre-radio-error"
              :class="hasImage ? 'mt-1 text-xs text-red-300' : 'mt-1 text-xs text-red-500'"
            >
              {{ t('artist.genreRadioError') }}
            </p>
          </template>
        </template>
      </ArtistHero>

      <!-- Top tracks section -->
      <section
        v-if="topTracksLoading || topTracks.length > 0"
        data-testid="top-tracks-section"
        class="mb-8"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-neutral-900">
            {{ t('artist.topTracksHeading') }}
          </h2>
          <button
            v-if="topTracks.length > 0 && !topTracksLoading"
            type="button"
            data-testid="top-tracks-add-all-button"
            class="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            @click="handleAllTopTracksAddToQueue()"
          >
            {{ t('artist.addAllTopTracksToQueue') }}
          </button>
        </div>
        <div v-if="topTracksLoading" data-testid="top-tracks-loading" class="space-y-2">
          <div class="h-12 animate-pulse rounded bg-neutral-100" />
          <div class="h-12 animate-pulse rounded bg-neutral-100" />
          <div class="h-12 animate-pulse rounded bg-neutral-100" />
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="track in topTracks"
            :key="track.id"
            data-testid="top-track-item"
            class="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 hover:bg-neutral-50"
          >
            <span class="w-6 flex-shrink-0 text-right text-xs font-medium text-neutral-400">
              {{ track.rank }}
            </span>
            <div class="min-w-0 flex-1">
              <p
                data-testid="top-track-title"
                class="truncate text-sm font-medium text-neutral-900"
              >
                {{ track.title }}
              </p>
              <p class="truncate text-xs text-neutral-500">
                {{ track.album }}
              </p>
            </div>
            <button
              type="button"
              data-testid="top-track-add-to-queue-button"
              class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              :aria-label="`Add ${track.title} to queue`"
              :disabled="track.url === ''"
              @click="handleTopTrackAddToQueue(track)"
            >
              +
            </button>
            <button
              type="button"
              data-testid="top-track-play-button"
              class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700"
              :aria-label="`${t('artist.playTopTrack')} ${track.title}`"
              @click="handleTopTrackPlay(track)"
            >
              ▶
            </button>
          </div>
        </div>
      </section>

      <!-- Sort buttons -->
      <div
        v-if="data.localAlbums.length > 0 || data.tidalAlbums.length > 0"
        class="mb-4 flex flex-wrap items-center gap-2"
      >
        <span class="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {{ t('artist.sortLabel') }}
        </span>
        <button
          type="button"
          data-testid="artist-sort-year"
          :class="
            albumSort === 'year'
              ? 'rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white'
              : 'rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200'
          "
          @click="setAlbumSort('year')"
        >
          {{ t('artist.sort.year') }}
        </button>
        <button
          type="button"
          data-testid="artist-sort-popularity"
          :class="
            albumSort === 'popularity'
              ? 'rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white'
              : 'rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200'
          "
          @click="setAlbumSort('popularity')"
        >
          {{ t('artist.sort.popularity') }}
        </button>
        <button
          type="button"
          data-testid="artist-sort-title"
          :class="
            albumSort === 'title'
              ? 'rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white'
              : 'rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200'
          "
          @click="setAlbumSort('title')"
        >
          {{ t('artist.sort.title') }}
        </button>
      </div>

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
            v-for="album in sortedLocalAlbums"
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
            v-for="album in sortedTidalAlbums"
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
