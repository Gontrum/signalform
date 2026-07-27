<script setup lang="ts">
import PageHeader from '@/ui/PageHeader.vue'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import EmptyState from '@/ui/EmptyState.vue'
import AlbumCard from '@/domains/library/ui/AlbumCard.vue'
import AlbumListRow from '@/domains/library/ui/AlbumListRow.vue'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { useLibraryBrowser } from '../shell/useLibraryBrowser'
import type { Source } from '../core/types'

const { isPhone } = useResponsiveLayout()

const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

const {
  activeSource,
  setSource,
  currentStatus,
  albums,
  totalCount,
  tidalAlbumsForDisplay,
  featuredAlbums,
  featuredStatus,
  isRescanning,
  rescanMessage,
  handleRescan,
  handleNavigate,
  handlePlay,
  handleAddToQueue,
  viewMode,
  setViewMode,
  currentAlbumsForDisplay,
  sortOptions,
  decadeOptions,
  sortBy,
  setSortBy,
  genreFilter,
  setGenreFilter,
  decadeFilter,
  setDecadeFilter,
  availableGenres,
  displayedAlbums,
  clearAllFilters,
  hasActiveFilters,
  displayLimit,
} = useLibraryBrowser(t)

// ARIA APG "Tabs" pattern: only the active tab is Tab-reachable (roving
// tabindex, bound in the template via :tabindex on both buttons);
// ArrowRight/ArrowLeft move and activate focus between the two, wrapping at
// the ends. Mirrors the closest+querySelectorAll+indexOf+focus() style of
// QueueView's handleQueueItemKeydown, adapted for horizontal navigation,
// wrap-around, and roving tabindex (which the queue list doesn't need).
const handleSourceTabKeydown = (event: KeyboardEvent): void => {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return
  }

  const currentTarget = event.currentTarget
  const tablist = currentTarget.closest('[data-testid="source-selector"]')
  const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]')) : []
  const currentIndex = tabs.indexOf(currentTarget)

  if (currentIndex === -1 || tabs.length === 0) {
    return
  }

  let nextIndex: number | undefined
  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % tabs.length
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
  }

  if (nextIndex === undefined) {
    return
  }

  event.preventDefault()
  const nextTab = tabs[nextIndex]
  const nextSource = nextTab?.dataset['source']
  if (nextSource !== 'local' && nextSource !== 'tidal') {
    return
  }

  nextTab?.focus()
  setSource(nextSource satisfies Source)
}
</script>

<template>
  <div data-testid="library-view" class="h-full min-h-0 overflow-y-auto bg-white">
    <PageHeader v-if="isPhone" :title="t('nav.library')" />
    <h1 v-else class="sr-only">{{ t('nav.library') }}</h1>

    <div class="px-4 py-4 sm:px-6">
      <!-- Source selector (AC1 — Story 8.1) -->
      <div
        data-testid="source-selector"
        role="tablist"
        aria-label="Music source"
        class="mb-6 flex gap-2 rounded-lg border border-neutral-200 p-1 w-fit"
      >
        <button
          type="button"
          role="tab"
          data-testid="source-local"
          data-source="local"
          :aria-selected="activeSource === 'local' ? 'true' : 'false'"
          :tabindex="activeSource === 'local' ? 0 : -1"
          :class="[
            'rounded px-4 py-1.5 text-sm font-medium transition-colors',
            activeSource === 'local'
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-500 hover:text-neutral-900',
          ]"
          @click="setSource('local')"
          @keydown.enter="setSource('local')"
          @keydown.space.prevent="setSource('local')"
          @keydown="handleSourceTabKeydown"
        >
          Local
        </button>
        <button
          type="button"
          role="tab"
          data-testid="source-tidal"
          data-source="tidal"
          :aria-selected="activeSource === 'tidal' ? 'true' : 'false'"
          :tabindex="activeSource === 'tidal' ? 0 : -1"
          :class="[
            'rounded px-4 py-1.5 text-sm font-medium transition-colors',
            activeSource === 'tidal'
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-500 hover:text-neutral-900',
          ]"
          @click="setSource('tidal')"
          @keydown.enter="setSource('tidal')"
          @keydown.space.prevent="setSource('tidal')"
          @keydown="handleSourceTabKeydown"
        >
          Tidal
        </button>
      </div>

      <!-- Rescan library button (local only) -->
      <div v-if="activeSource === 'local'" class="mb-6 flex items-center gap-3">
        <button
          type="button"
          data-testid="rescan-library-button"
          :disabled="isRescanning"
          class="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          :aria-label="isRescanning ? 'Scanning library…' : 'Refresh local library'"
          @click="handleRescan"
        >
          <svg
            :class="['h-4 w-4 flex-shrink-0', isRescanning ? 'animate-spin' : '']"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {{ isRescanning ? t('library.rescanScanning') : t('library.rescanButton') }}
        </button>
        <span
          v-if="rescanMessage"
          class="text-sm text-neutral-500"
          role="status"
          aria-live="polite"
          >{{ rescanMessage }}</span
        >
      </div>

      <div
        v-if="currentStatus === 'loading'"
        data-testid="loading-state"
        class="flex justify-center py-20"
      >
        <LoadingSpinner size="lg" color="accent-400" />
      </div>

      <!-- Error state (source-specific message) -->
      <div
        v-else-if="currentStatus === 'error'"
        data-testid="error-state"
        class="py-20 text-center text-neutral-500"
      >
        <p class="text-lg">
          {{ activeSource === 'tidal' ? t('library.errorTidal') : t('library.errorLocal') }}
        </p>
      </div>

      <!-- Empty state (local — 0 albums in library) -->
      <div
        v-else-if="albums.length === 0 && activeSource === 'local'"
        data-testid="empty-state"
        class="py-20"
      >
        <EmptyState :title="t('library.emptyLocal')">
          <template #icon>
            <svg
              class="h-12 w-12 md:h-14 md:w-14 lg:h-20 lg:w-20 text-neutral-400"
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
          </template>
        </EmptyState>
      </div>

      <!-- Story 8.9 AC2: No Tidal favorites → show Featured Albums (Neu bei Tidal) -->
      <div
        v-else-if="tidalAlbumsForDisplay.length === 0 && activeSource === 'tidal'"
        data-testid="tidal-featured-section"
      >
        <!-- Featured loading -->
        <div
          v-if="featuredStatus === 'loading'"
          data-testid="featured-loading-state"
          class="flex justify-center py-20"
        >
          <LoadingSpinner size="lg" color="accent-400" />
        </div>

        <!-- Featured error -->
        <div
          v-else-if="featuredStatus === 'error'"
          data-testid="tidal-empty-state"
          class="py-20 text-center text-neutral-500"
        >
          <p class="text-lg">{{ t('library.emptyTidal') }}</p>
        </div>

        <!-- Featured albums grid -->
        <div v-else data-testid="featured-albums-section">
          <h2 class="mb-4 text-lg font-semibold text-neutral-700">
            {{ t('library.featuredTidal') }}
          </h2>
          <div
            data-testid="featured-album-grid"
            class="grid grid-cols-2 gap-6 lg:grid-cols-3 lg:gap-8"
          >
            <AlbumCard
              v-for="album in featuredAlbums"
              :key="album.id"
              :album="{ ...album, releaseYear: null, genre: null }"
              @click:navigate="handleNavigate"
              @click:play="handlePlay"
              @click:add-to-queue="handleAddToQueue"
            />
          </div>
        </div>
      </div>

      <!-- Main content: sort/filter (local only) + view toggle + album grid/list -->
      <div v-else>
        <!-- Sort & Filter controls (local only) — chip-based for mobile friendliness -->
        <div v-if="activeSource === 'local'" data-testid="sort-controls" class="mb-4 space-y-3">
          <!-- Sort chips -->
          <div class="flex flex-wrap gap-2" role="group" aria-label="Sort order">
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              type="button"
              :data-testid="`sort-chip-${opt.value}`"
              :aria-pressed="sortBy === opt.value ? 'true' : 'false'"
              :class="[
                'min-h-9 rounded-full border px-4 text-sm font-medium transition-colors',
                sortBy === opt.value
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900',
              ]"
              @click="setSortBy(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Decade filter chips -->
          <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by decade">
            <button
              v-for="opt in decadeOptions"
              :key="opt.value"
              type="button"
              :data-testid="`decade-chip-${opt.value}`"
              :aria-pressed="decadeFilter === opt.value ? 'true' : 'false'"
              :class="[
                'min-h-9 rounded-full border px-4 text-sm font-medium transition-colors',
                decadeFilter === opt.value
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900',
              ]"
              @click="setDecadeFilter(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Genre chips -->
          <div
            class="flex flex-wrap gap-2"
            data-testid="genre-filter-row"
            role="group"
            aria-label="Filter by genre"
          >
            <button
              type="button"
              :data-testid="`genre-chip-all`"
              :aria-pressed="genreFilter === null ? 'true' : 'false'"
              :class="[
                'min-h-9 flex-shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                genreFilter === null
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900',
              ]"
              @click="setGenreFilter(null)"
            >
              {{ t('library.genre.all') }}
            </button>
            <button
              v-for="genre in availableGenres"
              :key="genre"
              type="button"
              :data-testid="`genre-chip-${genre}`"
              :aria-pressed="genreFilter === genre ? 'true' : 'false'"
              :class="[
                'min-h-9 flex-shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                genreFilter === genre
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900',
              ]"
              @click="setGenreFilter(genre)"
            >
              {{ genre }}
            </button>
          </div>

          <!-- Clear all filters -->
          <button
            v-if="hasActiveFilters"
            type="button"
            data-testid="clear-all-filters"
            class="text-sm text-accent-700 hover:text-accent-900 underline"
            @click="clearAllFilters"
          >
            × Clear all filters
          </button>
        </div>

        <!-- Header: display-limit message (local only) + view toggle -->
        <div class="mb-4 flex items-center justify-between">
          <p
            v-if="activeSource === 'local' && totalCount > displayLimit"
            data-testid="display-limit-message"
            class="text-sm text-neutral-500"
          >
            {{
              t('library.displayLimit')
                .replace('{limit}', String(displayLimit))
                .replace('{total}', String(totalCount))
            }}
          </p>
          <div v-else />

          <!-- View toggle (shared — single instance for both sources) -->
          <div data-testid="view-toggle" class="flex rounded-lg border border-neutral-200 p-1">
            <button
              type="button"
              data-testid="grid-view-button"
              :class="[
                'flex h-8 w-8 items-center justify-center rounded transition-colors',
                viewMode === 'grid'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900',
              ]"
              aria-label="Grid view"
              :aria-pressed="viewMode === 'grid'"
              @click="setViewMode('grid')"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
              </svg>
            </button>
            <button
              type="button"
              data-testid="list-view-button"
              :class="[
                'flex h-8 w-8 items-center justify-center rounded transition-colors',
                viewMode === 'list'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900',
              ]"
              aria-label="List view"
              :aria-pressed="viewMode === 'list'"
              @click="setViewMode('list')"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- No filter results (local only — genre filter too narrow) -->
        <div
          v-if="activeSource === 'local' && displayedAlbums.length === 0"
          data-testid="no-filter-results"
          class="py-12 text-center text-neutral-400"
        >
          <p class="text-sm">{{ t('library.noGenreMatch') }}</p>
        </div>

        <!-- Grid view -->
        <div
          v-else-if="viewMode === 'grid'"
          data-testid="album-grid"
          class="grid grid-cols-2 gap-6 lg:grid-cols-3 lg:gap-8"
        >
          <AlbumCard
            v-for="album in currentAlbumsForDisplay"
            :key="album.id"
            :album="album"
            @click:navigate="handleNavigate"
            @click:play="handlePlay"
            @click:add-to-queue="handleAddToQueue"
          />
        </div>

        <!-- List view -->
        <div v-else data-testid="album-list" class="flex flex-col divide-y divide-neutral-100">
          <AlbumListRow
            v-for="album in currentAlbumsForDisplay"
            :key="album.id"
            :album="album"
            @click:navigate="handleNavigate"
            @click:play="handlePlay"
            @click:add-to-queue="handleAddToQueue"
          />
        </div>
      </div>
    </div>
  </div>
</template>
