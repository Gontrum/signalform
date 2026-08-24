<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import PageHeader from '@/ui/PageHeader.vue'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import EmptyState from '@/ui/EmptyState.vue'
import BottomSheet from '@/ui/BottomSheet.vue'
import AlbumCard from '@/domains/library/ui/AlbumCard.vue'
import AlbumListRow from '@/domains/library/ui/AlbumListRow.vue'
import LibraryFilterControls from '@/domains/library/ui/LibraryFilterControls.vue'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { useLibraryBrowser } from '../shell/useLibraryBrowser'
import {
  buildAlbumRows,
  filterControlPresentation,
  nextRovingTabIndex,
  showsAlbumContent as showsAlbumContentFor,
  showsEmptyLibrary as showsEmptyLocalLibrary,
  showsTidalFeatured as showsTidalFeaturedFor,
  showsYearHeadings,
} from '../core/service'
import type { Source } from '../core/types'

const { isPhone } = useResponsiveLayout()

const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

const {
  activeSource,
  setSource,
  currentStatus,
  albums,
  browseMode,
  setBrowseMode,
  artists,
  loadMoreCurrent,
  handleNavigateArtist,
  showsAlbumControls,
  showsBrowseModeToggle,
  showsArtistBrowser,
  showsEmptyArtists,
  showsLoadMore,
  isLoadingMoreCurrent,
  loadMoreCurrentFailed,
  errorMessage,
  loadMoreErrorMessage,
  searchPlaceholder,
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
  filterSummary,
  showsRecentlyAddedCapNotice,
  showsDecadeScopeNotice,
  decadeScopeMessage,
} = useLibraryBrowser(t)

const inputValue = (event: Event): string | undefined =>
  event.target instanceof HTMLInputElement ? event.target.value : undefined

const handleSearchInput = (event: Event): void => {
  const value = inputValue(event)
  if (value !== undefined) {
    setSearchQuery(value)
  }
}

const filterControls = computed(() =>
  filterControlPresentation({ isPhone: isPhone.value, albumControls: showsAlbumControls.value }),
)

const isFilterSheetOpen = ref(false)

// A sheet that survives its own trigger comes back open the next time the
// summary line exists — after a rotation, or a switch to the artist list and
// back — with no way to tell what opened it.
watch(
  () => filterControls.value.sheet,
  (isAvailable) => {
    if (!isAvailable) {
      isFilterSheetOpen.value = false
    }
  },
)

// Passed to the sheet so focus returns here on close: a mouse click on a
// <button> does not focus it on macOS/WebKit, so the sheet's own
// `document.activeElement` fallback would find <body> and drop the focus.
const filterSummaryButton = useTemplateRef<HTMLButtonElement>('filterSummaryButton')

const filterSummaryLabel = computed(() =>
  t('library.filterSummaryAria').replace('{filters}', filterSummary.value),
)

// The chip row and the sheet mount the same control in two places the template
// cannot share an element between, so one object carries the props and the
// handlers to both — two attribute lists would drift apart unnoticed.
const filterControlBindings = computed(() => ({
  sortOptions: sortOptions.value,
  decadeOptions: decadeOptions.value,
  sortBy: sortBy.value,
  decadeFilter: decadeFilter.value,
  genreFilter: genreFilter.value,
  genreChips: genreChips.value,
  genreRest: genreRest.value,
  hasActiveFilters: hasActiveFilters.value,
  adjustedFilter: adjustedFilter.value,
  'onSelect:sort': setSortBy,
  'onSelect:decade': setDecadeFilter,
  'onSelect:genre': setGenreFilter,
  onClear: clearAllFilters,
}))

const showsEmptyLibrary = computed(() =>
  showsEmptyLocalLibrary(
    activeSource.value,
    currentStatus.value,
    albums.value.length,
    hasActiveFilters.value,
  ),
)

const showsTidalFeatured = computed(() =>
  showsTidalFeaturedFor(activeSource.value, tidalAlbumsForDisplay.value.length),
)

const showsAlbumContent = computed(() =>
  showsAlbumContentFor({
    status: currentStatus.value,
    artistBrowser: showsArtistBrowser.value,
    emptyLibrary: showsEmptyLibrary.value,
    tidalFeatured: showsTidalFeatured.value,
  }),
)

const showYearHeadings = computed(() =>
  showsYearHeadings(activeSource.value, sortBy.value, decadeFilter.value),
)

const albumRows = computed(() =>
  buildAlbumRows(currentAlbumsForDisplay.value, showYearHeadings.value, t('library.unknownYear')),
)

const loadMoreTrigger = useTemplateRef<HTMLElement>('loadMoreTrigger')

useIntersectionObserver(loadMoreTrigger, (entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    void loadMoreCurrent()
  }
})

// Local/Tidal and Albums/Artists are the same widget with different words, and
// they share one row, so they share one class. px-2 is what makes all three
// controls fit a 375px phone: the four labels alone are 160px, which leaves
// ~8px of padding per side once the view toggle and the gaps are paid for.
const SEGMENT_GROUP_CLASS =
  'flex flex-shrink-0 gap-1 rounded-lg border border-neutral-200 p-1 sm:gap-2'

const SEGMENT_BUTTON_CLASS =
  'min-h-11 whitespace-nowrap rounded px-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 sm:px-3'

const segmentClass = (isActive: boolean): readonly string[] => [
  SEGMENT_BUTTON_CLASS,
  isActive ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900',
]

// Only the active tab is Tab-reachable (roving tabindex, bound in the template
// via :tabindex on both buttons); the arrow keys move focus and activate.
const handleSourceTabKeydown = (event: KeyboardEvent): void => {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return
  }

  const currentTarget = event.currentTarget
  const tablist = currentTarget.closest('[data-testid="source-selector"]')
  const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]')) : []
  const nextIndex = nextRovingTabIndex(event.key, tabs.indexOf(currentTarget), tabs.length)

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
    <!-- On a phone the rescan control rides in the app bar instead of holding
         a 56px row of its own above the grid: it is a maintenance action, run
         once in a while, and the bar has the space for it. -->
    <PageHeader v-if="isPhone" :title="t('nav.library')">
      <template #trailing>
        <button
          v-if="activeSource === 'local'"
          type="button"
          data-testid="rescan-library-button"
          :disabled="isRescanning"
          class="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          :aria-label="isRescanning ? t('library.rescanAriaScanning') : t('library.rescanAriaIdle')"
          @click="handleRescan"
        >
          <svg
            :class="['h-5 w-5', isRescanning ? 'animate-spin' : '']"
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
        </button>
      </template>
    </PageHeader>
    <h1 v-else class="sr-only">{{ t('nav.library') }}</h1>

    <div class="px-4 py-2 sm:px-6 sm:py-4">
      <!-- Only while a scan runs, so it costs no height at rest — the phone
           has no room for a permanently empty status line. -->
      <p
        v-if="isPhone && rescanMessage"
        data-testid="rescan-message"
        class="mb-2 text-sm text-neutral-500"
        role="status"
        aria-live="polite"
      >
        {{ rescanMessage }}
      </p>

      <!-- One row for the three "what am I looking at" controls: the source
           tabs, the Albums/Artists switch, and the grid/list toggle at the
           right edge. Four rows of chrome above the grid put the second row of
           covers below the fold once the mini-player claims its 61px, and this
           is the row that costs nothing to give up — none of the three is
           hidden, they just stop each owning a line.
           flex-wrap is the pressure valve: a longer translation or a narrower
           phone drops the toggle to a second line instead of scrolling the
           document sideways. e2e/journeys/phone-layout.spec.ts fails on the
           height that costs, so a wrap cannot pass unnoticed. -->
      <div
        data-testid="library-controls-row"
        class="mb-3 flex flex-wrap items-center gap-2 sm:mb-6 sm:gap-3"
      >
        <div
          data-testid="source-selector"
          role="tablist"
          :aria-label="t('library.sourceTabsLabel')"
          :class="SEGMENT_GROUP_CLASS"
        >
          <button
            type="button"
            role="tab"
            data-testid="source-local"
            data-source="local"
            :aria-selected="activeSource === 'local' ? 'true' : 'false'"
            :tabindex="activeSource === 'local' ? 0 : -1"
            :class="segmentClass(activeSource === 'local')"
            @click="setSource('local')"
            @keydown.enter="setSource('local')"
            @keydown.space.prevent="setSource('local')"
            @keydown="handleSourceTabKeydown"
          >
            {{ t('library.sourceLocal') }}
          </button>
          <button
            type="button"
            role="tab"
            data-testid="source-tidal"
            data-source="tidal"
            :aria-selected="activeSource === 'tidal' ? 'true' : 'false'"
            :tabindex="activeSource === 'tidal' ? 0 : -1"
            :class="segmentClass(activeSource === 'tidal')"
            @click="setSource('tidal')"
            @keydown.enter="setSource('tidal')"
            @keydown.space.prevent="setSource('tidal')"
            @keydown="handleSourceTabKeydown"
          >
            {{ t('library.sourceTidal') }}
          </button>
        </div>

        <!-- Albums / Artists switch (local only — Tidal has no artist browser,
             so the switch disappears with the tab and the mode is restored on
             the way back). -->
        <div
          v-if="showsBrowseModeToggle"
          data-testid="browse-mode-toggle"
          role="group"
          :aria-label="t('library.browseModeLabel')"
          :class="SEGMENT_GROUP_CLASS"
        >
          <button
            type="button"
            data-testid="browse-mode-albums"
            :aria-pressed="browseMode === 'albums'"
            :class="segmentClass(browseMode === 'albums')"
            @click="setBrowseMode('albums')"
          >
            {{ t('library.browseAlbums') }}
          </button>
          <button
            type="button"
            data-testid="browse-mode-artists"
            :aria-pressed="browseMode === 'artists'"
            :class="segmentClass(browseMode === 'artists')"
            @click="setBrowseMode('artists')"
          >
            {{ t('library.browseArtists') }}
          </button>
        </div>

        <!-- View toggle (shared — single instance for both sources). The one
             control here that is pure icon, so it is the one that gives up its
             bordered box on a phone; both buttons stay, at full 44px height.
             ml-auto, not justify-end on the row: on Tidal it is the only child
             after the tabs and must still sit right. It carries the branch
             condition the album list gets from its `v-else`, and in artist
             mode it goes away entirely — that list is text, it has no grid. -->
        <div
          v-if="showsAlbumContent"
          data-testid="view-toggle"
          class="ml-auto flex flex-shrink-0 rounded-lg sm:border sm:border-neutral-200 sm:p-1"
        >
          <button
            type="button"
            data-testid="grid-view-button"
            :class="[
              'flex h-11 w-8 items-center justify-center rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 sm:h-8',
              viewMode === 'grid'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:text-neutral-900',
            ]"
            :aria-label="t('library.gridView')"
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
              'flex h-11 w-8 items-center justify-center rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 sm:h-8',
              viewMode === 'list'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:text-neutral-900',
            ]"
            :aria-label="t('library.listView')"
            :aria-pressed="viewMode === 'list'"
            @click="setViewMode('list')"
          >
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Rescan library button (local only) -->
      <div v-if="activeSource === 'local' && !isPhone" class="mb-3 flex items-center gap-3 sm:mb-6">
        <button
          type="button"
          data-testid="rescan-library-button"
          :disabled="isRescanning"
          class="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          :aria-label="isRescanning ? t('library.rescanAriaScanning') : t('library.rescanAriaIdle')"
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
          data-testid="rescan-message"
          class="text-sm text-neutral-500"
          role="status"
          aria-live="polite"
          >{{ rescanMessage }}</span
        >
      </div>

      <!-- Search and filters (local only) — outside the state branches below.
           A debounced reload must not unmount the field the user is typing in,
           and an error or an empty result must not take away the very controls
           that change the query: only the album list is replaced below. -->
      <div v-if="activeSource === 'local'" class="mb-3 sm:mb-4">
        <input
          data-testid="library-search-input"
          type="search"
          :value="searchQuery"
          :placeholder="searchPlaceholder"
          :aria-label="t('library.searchLabel')"
          autocomplete="off"
          class="min-h-11 w-full max-w-md rounded-lg border border-neutral-300 bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          @input="handleSearchInput"
        />
      </div>

      <!-- Sort & Filter controls (local albums only). In artist mode none of
           the three has a counterpart in the query, so the block is gone
           rather than inert. -->
      <LibraryFilterControls v-if="filterControls.chips" v-bind="filterControlBindings" />

      <!-- Phone: three chip rows plus the genre field cost 244px above the
           grid, for a choice made once and then browsed past for minutes.
           One line names the state and opens the sheet that holds the rows. -->
      <div v-if="filterControls.sheet" class="mb-2 flex items-center gap-2">
        <button
          ref="filterSummaryButton"
          type="button"
          data-testid="filter-summary"
          :aria-label="filterSummaryLabel"
          aria-haspopup="dialog"
          :aria-expanded="isFilterSheetOpen ? 'true' : 'false'"
          class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-left text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @click="isFilterSheetOpen = true"
        >
          <svg
            class="h-4 w-4 flex-shrink-0 text-neutral-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 4h18M6 12h12M10 20h4"
            />
          </svg>
          <span data-testid="filter-summary-text" class="truncate">{{ filterSummary }}</span>
        </button>

        <button
          v-if="hasActiveFilters"
          type="button"
          data-testid="filter-summary-clear"
          :aria-label="t('library.clearFilters')"
          class="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @click="clearAllFilters"
        >
          <svg
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <BottomSheet
        v-if="filterControls.sheet"
        v-model:open="isFilterSheetOpen"
        data-testid="filter-sheet"
        :title="t('library.filterSheetTitle')"
        :close-label="t('library.filterSheetClose')"
        :return-focus-to="filterSummaryButton"
      >
        <LibraryFilterControls v-bind="filterControlBindings" />

        <button
          type="button"
          data-testid="filter-sheet-done"
          class="min-h-11 w-full rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @click="isFilterSheetOpen = false"
        >
          {{ t('library.filterSheetDone') }}
        </button>
      </BottomSheet>

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
        <p class="text-lg">{{ errorMessage }}</p>
      </div>

      <!-- Artist browser (local only). Text only, on purpose: LMS holds no
           artist artwork, so a thumbnail per row would mean one extra request
           per artist for an image that mostly does not exist. This list is the
           right shape for the data — do not "upgrade" it to a cover grid. -->
      <div v-else-if="showsArtistBrowser" data-testid="artist-browser">
        <div
          v-if="showsEmptyArtists"
          data-testid="artists-empty-state"
          class="py-12 text-center text-neutral-400"
        >
          <p class="text-sm">{{ t('library.artistsEmpty') }}</p>
        </div>

        <ul v-else data-testid="artist-list" class="flex flex-col divide-y divide-neutral-100">
          <li v-for="artist in artists" :key="artist.id">
            <button
              type="button"
              data-testid="artist-row"
              class="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              @click="handleNavigateArtist(artist.name)"
            >
              <span class="truncate">{{ artist.name }}</span>
            </button>
          </li>
        </ul>
      </div>

      <!-- Empty state (local — 0 albums in library) -->
      <div v-else-if="showsEmptyLibrary" data-testid="empty-state" class="py-20">
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

      <!-- No Tidal favorites → show Featured Albums (Neu bei Tidal) -->
      <div v-else-if="showsTidalFeatured" data-testid="tidal-featured-section">
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

      <!-- Main content: album grid/list. Its view toggle lives above the state
           chain, sharing a line with the source tabs and the browse switch. -->
      <div v-else>
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
      </div>

      <!-- Load more (local only) — one block for albums and artists, since the
           two paginate identically. The button stays the accessible path; the
           observer on its wrapper only saves the click while scrolling. -->
      <div v-if="showsLoadMore" ref="loadMoreTrigger" class="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          data-testid="load-more-button"
          :disabled="isLoadingMoreCurrent"
          class="min-h-11 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          @click="loadMoreCurrent"
        >
          {{ isLoadingMoreCurrent ? t('home.loading') : t('library.loadMore') }}
        </button>
        <p
          v-if="loadMoreCurrentFailed"
          data-testid="load-more-error"
          class="text-sm text-neutral-500"
          role="status"
          aria-live="polite"
        >
          {{ loadMoreErrorMessage }}
        </p>
      </div>

      <!-- Why the list ends here, and what a decade filter does to the order.
           Below the grid on purpose: this is where the user meets the effect,
           and a line above it would push the first cover off a phone screen
           (e2e/journeys/phone-layout.spec.ts measures exactly that). The two
           never appear together — 'recently-added' and a decade are the pair
           reconcileFilters refuses. -->
      <p
        v-if="showsRecentlyAddedCapNotice"
        data-testid="recently-added-cap-notice"
        class="mt-6 text-sm text-neutral-500"
      >
        {{ t('library.recentlyAddedCapNotice') }}
      </p>

      <p
        v-if="showsDecadeScopeNotice"
        data-testid="decade-scope-notice"
        class="mt-6 text-sm text-neutral-500"
      >
        {{ decadeScopeMessage }}
      </p>
    </div>
  </div>
</template>
