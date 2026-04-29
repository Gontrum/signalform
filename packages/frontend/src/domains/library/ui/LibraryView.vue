<script setup lang="ts">
import MainNavBar from '@/app/MainNavBar.vue'
import AlbumCard from '@/domains/library/ui/AlbumCard.vue'
import AlbumListRow from '@/domains/library/ui/AlbumListRow.vue'
import { useI18nStore } from '@/app/i18nStore'
import { useLibraryBrowser } from '../shell/useLibraryBrowser'

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
</script>

<template>
  <div data-testid="library-view" class="h-full min-h-0 overflow-y-auto bg-white p-6">
    <MainNavBar />
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
        :aria-selected="activeSource === 'local' ? 'true' : 'false'"
        :class="[
          'rounded px-4 py-1.5 text-sm font-medium transition-colors',
          activeSource === 'local'
            ? 'bg-neutral-900 text-white'
            : 'text-neutral-500 hover:text-neutral-900',
        ]"
        @click="setSource('local')"
        @keydown.enter="setSource('local')"
        @keydown.space.prevent="setSource('local')"
      >
        Local
      </button>
      <button
        type="button"
        role="tab"
        data-testid="source-tidal"
        :aria-selected="activeSource === 'tidal' ? 'true' : 'false'"
        :class="[
          'rounded px-4 py-1.5 text-sm font-medium transition-colors',
          activeSource === 'tidal'
            ? 'bg-neutral-900 text-white'
            : 'text-neutral-500 hover:text-neutral-900',
        ]"
        @click="setSource('tidal')"
        @keydown.enter="setSource('tidal')"
        @keydown.space.prevent="setSource('tidal')"
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
        class="flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div
        class="h-12 w-12 animate-spin rounded-full border-4 border-accent-400 border-t-transparent"
      />
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
      class="py-20 text-center text-neutral-500"
    >
      <p class="text-lg">{{ t('library.emptyLocal') }}</p>
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
        <div
          class="h-12 w-12 animate-spin rounded-full border-4 border-accent-400 border-t-transparent"
        />
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
        <h2 class="mb-4 text-lg font-semibold text-neutral-700">Neu bei Tidal</h2>
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
              'min-h-[36px] rounded-full border px-4 text-sm font-medium transition-colors',
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
              'min-h-[36px] rounded-full border px-4 text-sm font-medium transition-colors',
              decadeFilter === opt.value
                ? 'border-accent-500 bg-accent-500 text-white'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900',
            ]"
            @click="setDecadeFilter(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Genre chips — horizontal scroll on mobile -->
        <div class="-mx-6 px-6 overflow-x-auto" data-testid="genre-filter-row">
          <div class="flex gap-2 pb-1" role="group" aria-label="Filter by genre">
            <button
              type="button"
              :data-testid="`genre-chip-all`"
              :aria-pressed="genreFilter === null ? 'true' : 'false'"
              :class="[
                'min-h-[36px] flex-shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
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
                'min-h-[36px] flex-shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                genreFilter === genre
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900',
              ]"
              @click="setGenreFilter(genre)"
            >
              {{ genre }}
            </button>
          </div>
        </div>

        <!-- Clear all filters -->
        <button
          v-if="hasActiveFilters"
          type="button"
          data-testid="clear-all-filters"
          class="text-sm text-accent-500 hover:text-accent-700 underline"
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
</template>
