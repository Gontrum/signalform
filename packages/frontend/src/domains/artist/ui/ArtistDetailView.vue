<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import MainNavBar from '@/app/MainNavBar.vue'
import ArtistHero from './ArtistHero.vue'
import SimilarArtistGrid from './SimilarArtistGrid.vue'
import { useArtistDetailView } from '../shell/useArtistDetailView'

const i18n = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)
const {
  isTidalMode,
  status,
  artist,
  enrichment,
  tidalArtistName,
  tidalAlbums,
  errorMessage,
  similarArtists,
  enrichmentLoading,
  heroImageUrl,
  coverErrors,
  handleAlbumClick,
  handleTidalAlbumClick,
  handleSimilarArtistClick,
  goBack,
  onCoverError,
} = useArtistDetailView()
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-white p-6" data-testid="artist-detail-view">
    <MainNavBar />
    <!-- Back button -->
    <button
      type="button"
      data-testid="back-button"
      class="mb-6 flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
      @click="goBack"
    >
      ← {{ t('settings.fullResultsBack') }}
    </button>

    <!-- Loading state -->
    <div v-if="status === 'loading'" data-testid="loading-state" class="flex justify-center py-20">
      <div
        class="h-12 w-12 animate-spin rounded-full border-4 border-accent-400 border-t-transparent"
      />
    </div>

    <!-- Error: Not Found (local mode only) -->
    <div
      v-else-if="status === 'error-not-found'"
      data-testid="error-not-found"
      class="py-20 text-center text-neutral-500"
    >
      <p class="text-lg">
        {{ t('artist.errorNotFoundTitle') }}
      </p>
      <p class="text-sm">
        {{ t('artist.errorNotFoundMessage') }}
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
        {{ t('artist.errorServerTitle') }}
      </p>
      <p class="text-sm">
        {{ t('artist.errorServerMessage') }}
      </p>
      <p v-if="errorMessage" class="mt-1 text-xs">
        {{ errorMessage }}
      </p>
    </div>

    <!-- Success — Tidal mode -->
    <div v-else-if="status === 'success' && isTidalMode" data-testid="artist-detail-content">
      <!-- Artist header -->
      <div class="mb-8 flex items-center gap-6">
        <div
          data-testid="artist-avatar"
          class="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 shadow-lg"
        >
          <span class="text-3xl font-bold text-neutral-600">
            {{ tidalArtistName.charAt(0).toUpperCase() || '?' }}
          </span>
        </div>
        <div>
          <h1 data-testid="artist-name" class="text-3xl font-bold text-neutral-900">
            {{ tidalArtistName || t('artist.localEmpty').replace('{name}', '') }}
          </h1>
          <p class="mt-1 text-sm text-neutral-500">
            {{ t('artist.tidalAlbumCount').replace('{count}', String(tidalAlbums.length)) }}
          </p>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="tidalAlbums.length === 0"
        data-testid="no-albums-message"
        class="py-12 text-center text-neutral-500"
      >
        {{ t('artist.tidalEmpty').replace('{name}', tidalArtistName) }}
      </div>

      <!-- Tidal album list -->
      <div v-else data-testid="album-list" class="space-y-2">
        <button
          v-for="album in tidalAlbums"
          :key="album.id"
          type="button"
          data-testid="album-item"
          class="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left hover:bg-neutral-50"
          @click="handleTidalAlbumClick(album)"
        >
          <!-- Album cover -->
          <div
            class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 shadow"
          >
            <img
              v-if="album.coverArtUrl && !coverErrors[album.id]"
              :src="album.coverArtUrl"
              :alt="`${album.title} cover`"
              data-testid="album-cover"
              class="h-full w-full object-cover"
              loading="lazy"
              @error="onCoverError(album.id)"
            />
            <div v-else class="flex h-full w-full items-center justify-center">
              <svg
                class="h-6 w-6 text-white opacity-80"
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

          <!-- Album info -->
          <div class="flex-1 overflow-hidden">
            <p data-testid="album-title" class="truncate text-sm font-medium text-neutral-900">
              {{ album.title }}
            </p>
          </div>

          <!-- Chevron -->
          <svg
            class="h-4 w-4 flex-shrink-0 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Success — local library mode -->
    <div v-else-if="status === 'success' && artist" data-testid="artist-detail-content">
      <!-- Artist header -->
      <ArtistHero :hero-image-url="heroImageUrl">
        <template #default="{ hasImage }">
          <h1
            data-testid="artist-name"
            :class="
              hasImage ? 'text-3xl font-bold text-white' : 'text-3xl font-bold text-neutral-900'
            "
          >
            {{ artist.name || t('artist.localEmpty').replace('{name}', '') }}
          </h1>
          <!-- Enrichment skeleton -->
          <div
            v-if="status === 'success' && enrichmentLoading"
            data-testid="enrichment-skeleton"
            class="mt-2 space-y-2"
          >
            <div class="h-4 w-48 animate-pulse rounded bg-neutral-100" />
            <div class="h-3 w-full animate-pulse rounded bg-neutral-100" />
            <div class="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
          </div>
          <div
            v-if="enrichment"
            data-testid="enrichment-stats"
            :class="hasImage ? 'mt-1 text-sm text-white/80' : 'mt-1 text-sm text-neutral-500'"
          >
            {{ enrichment.listeners.toLocaleString() }} listeners ·
            {{ enrichment.playcount.toLocaleString() }} plays
          </div>
          <p
            v-if="enrichment && enrichment.bio"
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
            v-if="enrichment && enrichment.tags.length > 0"
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
      </ArtistHero>

      <!-- Empty state -->
      <div
        v-if="artist.albums.length === 0"
        data-testid="no-albums-message"
        class="py-12 text-center text-neutral-500"
      >
        {{ t('artist.localEmpty').replace('{name}', artist.name) }}
      </div>

      <!-- Album list -->
      <div v-else data-testid="album-list" class="space-y-2">
        <button
          v-for="album in artist.albums"
          :key="album.id"
          type="button"
          data-testid="album-item"
          class="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left hover:bg-neutral-50"
          @click="handleAlbumClick(album)"
        >
          <!-- Album cover -->
          <div
            class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 shadow"
          >
            <img
              v-if="album.coverArtUrl && !coverErrors[album.id]"
              :src="album.coverArtUrl"
              :alt="`${album.title} cover`"
              data-testid="album-cover"
              class="h-full w-full object-cover"
              loading="lazy"
              @error="onCoverError(album.id)"
            />
            <div v-else class="flex h-full w-full items-center justify-center">
              <svg
                class="h-6 w-6 text-white opacity-80"
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

          <!-- Album info -->
          <div class="flex-1 overflow-hidden">
            <p data-testid="album-title" class="truncate text-sm font-medium text-neutral-900">
              {{ album.title }}
            </p>
            <p
              v-if="album.releaseYear"
              data-testid="album-year"
              class="truncate text-xs text-neutral-500"
            >
              {{ album.releaseYear }}
            </p>
          </div>

          <!-- Chevron -->
          <svg
            class="h-4 w-4 flex-shrink-0 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      <!-- Similar artists section -->
      <SimilarArtistGrid :artists="similarArtists" @select="handleSimilarArtistClick" />
    </div>
  </div>
</template>
