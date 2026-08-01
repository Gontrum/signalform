<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
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
  hasMore,
  isLoadingMore,
  loadMoreFailed,
  loadMore,
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
  adjustedFilter,
  genreChips,
  genreRest,
  searchQuery,
  setSearchQuery,
  clearAllFilters,
  hasActiveFilters,
} = useLibraryBrowser(t)

const inputValue = (event: Event): string | undefined =>
  event.target instanceof HTMLInputElement ? event.target.value : undefined

const handleSearchInput = (event: Event): void => {
  const value = inputValue(event)
  if (value !== undefined) {
    setSearchQuery(value)
  }
}

const allGenres = computed(() => [...genreChips.value, ...genreRest.value])

// The cold genre endpoint answers alphabetically and without counts, so the
// first 20 entries are not the biggest ones — showing them as chips would
// reshuffle the row as soon as the counts arrive.
const showGenreChips = computed(
  () =>
    genreChips.value.length > 0 && genreChips.value.some((genre) => genre.albumCount !== undefined),
)

const activeGenreName = computed(
  () => allGenres.value.find((genre) => genre.id === genreFilter.value)?.name ?? '',
)

const genreQuery = ref(activeGenreName.value)
watch(activeGenreName, (name) => {
  genreQuery.value = name
})

const toggleGenre = (genreId: number): void => {
  setGenreFilter(genreFilter.value === genreId ? null : genreId)
}

const handleGenreInput = (event: Event): void => {
  const value = inputValue(event)
  if (value === undefined) {
    return
  }

  genreQuery.value = value
  const typed = value.trim().toLowerCase()

  if (typed === '') {
    if (genreFilter.value !== null) {
      setGenreFilter(null)
    }
    return
  }

  const match = allGenres.value.find((genre) => genre.name.toLowerCase() === typed)
  if (match !== undefined && match.id !== genreFilter.value) {
    setGenreFilter(match.id)
  }
}

const showsEmptyLibrary = computed(
  () =>
    activeSource.value === 'local' &&
    currentStatus.value === 'success' &&
    albums.value.length === 0 &&
    !hasActiveFilters.value,
)

// Both orderings group by year first, so without the headings the secondary
// sort inside a year reads as a broken list.
const showYearHeadings = computed(
  () =>
    activeSource.value === 'local' &&
    (sortBy.value === 'year-newest' || decadeFilter.value !== 'all'),
)

const yearLabel = (year: number | null): string =>
  year === null ? t('library.unknownYear') : String(year)

// Comparing against the previous entry of the merged list — not per page — is
// what keeps a year from being announced twice across a load-more boundary.
const albumRows = computed(() => {
  const items = currentAlbumsForDisplay.value

  return items.map((album, index) => {
    const previous = items[index - 1]
    const startsYear =
      showYearHeadings.value &&
      (previous === undefined || yearLabel(previous.releaseYear) !== yearLabel(album.releaseYear))

    return { album, heading: startsYear ? yearLabel(album.releaseYear) : undefined }
  })
})

const loadMoreTrigger = useTemplateRef<HTMLElement>('loadMoreTrigger')

useIntersectionObserver(loadMoreTrigger, (entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    void loadMore()
  }
})

// Below sm the three chip rows are single-line scrollers instead of wrapping —
// 20 genre chips otherwise stack seven rows deep and push the album grid off a
// phone screen entirely. The horizontal padding is inside the scroller and
// cancelled by the negative margin so the row clips at the screen edge: the
// half-cut chip there is the "there is more" affordance. A fade would sink the
// last chip's contrast and a scrollbar is invisible at rest on iOS and macOS.
// py-1 keeps the focus ring (ring-2 + ring-offset-2 = 4px) out of the clip.
const CHIP_ROW_CLASS =
  '-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:py-0'

const CHIP_CLASS =
  'min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2'

const CHIP_ACTIVE_CLASS = 'border-neutral-900 bg-neutral-900 text-white'

const CHIP_INACTIVE_CLASS =
  'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'

const chipClass = (isActive: boolean): readonly string[] => [
  CHIP_CLASS,
  isActive ? CHIP_ACTIVE_CLASS : CHIP_INACTIVE_CLASS,
]

// A fresh scroller starts at scrollLeft 0, which hides the active chip whenever
// it sits past the fold ("Older" is the last decade). No CSS property picks an
// initial scroll offset, so nudge it here — scrollLeft only, never
// scrollIntoView, so no ancestor and no vertical scroll position is touched.
const CHIP_REVEAL_GUTTER_PX = 16

const revealActiveChip = (row: HTMLElement | null): void => {
  if (row === null) {
    return
  }

  const chip = row.querySelector<HTMLElement>('[aria-pressed="true"]')
  if (chip === null) {
    return
  }

  const overshoot = chip.getBoundingClientRect().right - row.getBoundingClientRect().right
  if (overshoot > 0) {
    row.scrollLeft += overshoot + CHIP_REVEAL_GUTTER_PX
  }
}

const sortRow = useTemplateRef<HTMLElement>('sortRow')
const decadeRow = useTemplateRef<HTMLElement>('decadeRow')
const genreRow = useTemplateRef<HTMLElement>('genreRow')

// Each reload swaps the whole filter block for the spinner, so the rows remount
// on every filter change and every reveal is a fresh element at scrollLeft 0.
watch(sortRow, revealActiveChip, { flush: 'post' })
watch(decadeRow, revealActiveChip, { flush: 'post' })
watch(genreRow, revealActiveChip, { flush: 'post' })

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

    <div class="px-4 py-2 sm:px-6 sm:py-4">
      <!-- Source selector (AC1 — Story 8.1) -->
      <div
        data-testid="source-selector"
        role="tablist"
        aria-label="Music source"
        class="mb-3 flex gap-2 rounded-lg border border-neutral-200 p-1 w-fit sm:mb-6"
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
      <div v-if="activeSource === 'local'" class="mb-3 flex items-center gap-3 sm:mb-6">
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

      <!-- Library search (local only) — outside the state branches below so a
           debounced reload does not unmount the field the user is typing in. -->
      <div
        v-if="activeSource === 'local' && currentStatus !== 'error' && !showsEmptyLibrary"
        class="mb-3 sm:mb-4"
      >
        <input
          data-testid="library-search-input"
          type="search"
          :value="searchQuery"
          :placeholder="t('library.searchPlaceholder')"
          :aria-label="t('library.searchLabel')"
          autocomplete="off"
          class="min-h-11 w-full max-w-md rounded-lg border border-neutral-300 bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @input="handleSearchInput"
        />
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
        v-else-if="albums.length === 0 && activeSource === 'local' && !hasActiveFilters"
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
              :album="{ ...album, releaseYear: null }"
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
        <div
          v-if="activeSource === 'local'"
          data-testid="sort-controls"
          class="mb-3 space-y-2 sm:mb-4 sm:space-y-3"
        >
          <!-- Sort chips -->
          <div
            ref="sortRow"
            data-testid="sort-chip-row"
            :class="CHIP_ROW_CLASS"
            role="group"
            aria-label="Sort order"
          >
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              type="button"
              :data-testid="`sort-chip-${opt.value}`"
              :aria-pressed="sortBy === opt.value ? 'true' : 'false'"
              :class="chipClass(sortBy === opt.value)"
              @click="setSortBy(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Decade filter chips -->
          <div
            ref="decadeRow"
            data-testid="decade-chip-row"
            :class="CHIP_ROW_CLASS"
            role="group"
            aria-label="Filter by decade"
          >
            <button
              v-for="opt in decadeOptions"
              :key="opt.value"
              type="button"
              :data-testid="`decade-chip-${opt.value}`"
              :aria-pressed="decadeFilter === opt.value ? 'true' : 'false'"
              :class="chipClass(decadeFilter === opt.value)"
              @click="setDecadeFilter(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Genre filter: the most common genres as chips, everything else
               through the native datalist autocomplete. -->
          <div v-if="allGenres.length > 0" class="space-y-2">
            <div
              v-if="showGenreChips"
              ref="genreRow"
              data-testid="genre-chips"
              :class="CHIP_ROW_CLASS"
              role="group"
              :aria-label="t('library.genreFilterLabel')"
            >
              <button
                v-for="genre in genreChips"
                :key="genre.id"
                type="button"
                :data-testid="`genre-chip-${genre.id}`"
                :aria-pressed="genreFilter === genre.id ? 'true' : 'false'"
                :class="chipClass(genreFilter === genre.id)"
                @click="toggleGenre(genre.id)"
              >
                {{ genre.name }}
              </button>
            </div>

            <input
              data-testid="genre-filter-input"
              type="text"
              list="library-genre-options"
              :value="genreQuery"
              :placeholder="t('library.genrePlaceholder')"
              :aria-label="t('library.genreFilterLabel')"
              autocomplete="off"
              class="min-h-11 w-full max-w-xs rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              @input="handleGenreInput"
            />
            <datalist id="library-genre-options">
              <option v-for="genre in allGenres" :key="genre.id" :value="genre.name" />
            </datalist>
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

        <!-- Header: forced-filter notice (local only) + view toggle -->
        <div class="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <p
            v-if="activeSource === 'local' && adjustedFilter !== null"
            data-testid="filter-adjusted-message"
            class="text-sm text-neutral-500"
            role="status"
            aria-live="polite"
          >
            {{
              adjustedFilter === 'decade'
                ? t('library.filterAdjustedDecade')
                : t('library.filterAdjustedSort')
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

        <!-- No filter results (local only — filter combination too narrow) -->
        <div
          v-if="activeSource === 'local' && albums.length === 0"
          data-testid="no-filter-results"
          class="py-12 text-center text-neutral-400"
        >
          <p class="text-sm">{{ t('library.noFilterMatch') }}</p>
        </div>

        <!-- Grid view -->
        <div
          v-else-if="viewMode === 'grid'"
          data-testid="album-grid"
          class="grid grid-cols-2 gap-6 lg:grid-cols-3 lg:gap-8"
        >
          <template v-for="row in albumRows" :key="row.album.id">
            <h2
              v-if="row.heading !== undefined"
              data-testid="year-heading"
              class="col-span-full text-sm font-semibold uppercase tracking-wide text-neutral-500"
            >
              {{ row.heading }}
            </h2>
            <AlbumCard
              :album="row.album"
              @click:navigate="handleNavigate"
              @click:play="handlePlay"
              @click:add-to-queue="handleAddToQueue"
            />
          </template>
        </div>

        <!-- List view -->
        <div v-else data-testid="album-list" class="flex flex-col divide-y divide-neutral-100">
          <template v-for="row in albumRows" :key="row.album.id">
            <h2
              v-if="row.heading !== undefined"
              data-testid="year-heading"
              class="pb-1 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500"
            >
              {{ row.heading }}
            </h2>
            <AlbumListRow
              :album="row.album"
              @click:navigate="handleNavigate"
              @click:play="handlePlay"
              @click:add-to-queue="handleAddToQueue"
            />
          </template>
        </div>

        <!-- Load more (local only). The button stays the accessible path; the
             observer on its wrapper only saves the click while scrolling. -->
        <div
          v-if="activeSource === 'local' && hasMore"
          ref="loadMoreTrigger"
          class="mt-6 flex flex-col items-center gap-2"
        >
          <button
            type="button"
            data-testid="load-more-button"
            :disabled="isLoadingMore"
            class="min-h-11 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            @click="loadMore"
          >
            {{ isLoadingMore ? t('home.loading') : t('library.loadMore') }}
          </button>
          <p
            v-if="loadMoreFailed"
            data-testid="load-more-error"
            class="text-sm text-neutral-500"
            role="status"
            aria-live="polite"
          >
            {{ t('library.loadMoreError') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
