<script setup lang="ts">
import MainNavBar from '@/app/MainNavBar.vue'
import AutocompleteDropdown from './AutocompleteDropdown.vue'
import { useI18nStore } from '@/app/i18nStore'
import SearchResultsList from './SearchResultsList.vue'
import { useSearchPanel } from '../shell/useSearchPanel'

const i18nStore = useI18nStore()
const t = i18nStore.t

const {
  searchStore,
  searchQuery,
  searchInputEl,
  showMinLengthHint,
  showLoadingIndicator,
  activeIndex,
  showFullResults,
  displayedTracks,
  displayedAlbums,
  displayedArtists,
  handleQueryChange,
  handleArrowDown,
  handleArrowUp,
  handleEscapeKey,
  handleSelect,
  handleEnterKey,
  handlePlayTrack,
  handlePause,
  handleNavigateArtist,
  handleNavigateAlbum,
  handleNavigateTidalAlbum,
  handlePlayAlbum,
  backToSearch,
} = useSearchPanel()
</script>

<template>
  <div data-testid="search-container" class="flex h-full flex-col p-6">
    <MainNavBar />
    <!-- Autocomplete Mode -->
    <div v-if="!showFullResults" class="flex h-full flex-col items-center justify-center">
      <div class="w-full max-w-2xl">
        <div class="relative">
          <input
            ref="searchInputEl"
            v-model="searchQuery"
            type="text"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            :placeholder="t('home.searchPlaceholder')"
            :aria-label="t('home.searchPlaceholder')"
            role="combobox"
            :aria-expanded="searchStore.hasSuggestions"
            :aria-activedescendant="activeIndex >= 0 ? `suggestion-item-${activeIndex}` : undefined"
            aria-controls="autocomplete-dropdown"
            data-testid="search-input"
            autocomplete="off"
            @input="handleQueryChange"
            @keydown.enter.prevent="handleEnterKey"
            @keydown.down.prevent="handleArrowDown"
            @keydown.up.prevent="handleArrowUp"
            @keydown.esc="handleEscapeKey"
          />

          <AutocompleteDropdown
            :suggestions="searchStore.autocompleteSuggestions"
            :is-loading="showLoadingIndicator"
            :is-empty="
              !searchStore.hasSuggestions &&
              searchQuery.trim().length >= 2 &&
              !searchStore.isAutocompleteLoading
            "
            :error="searchStore.autocompleteError"
            :query="searchQuery"
            :active-index="activeIndex"
            @select="handleSelect"
            @search="handleEnterKey"
          />

          <!-- Minimum length hint -->
          <div
            v-if="showMinLengthHint"
            class="absolute top-full z-10 mt-1 w-full rounded-lg bg-gray-100 p-3 text-center text-xs text-gray-500 shadow-sm"
            role="status"
            aria-live="polite"
            data-testid="min-length-hint"
          >
            {{ t('home.minLengthHint') }}
          </div>
        </div>

        <!-- Results Count (for autocomplete) -->
        <div
          v-if="searchStore.hasSuggestions"
          class="mt-4 text-center text-sm text-gray-500"
          aria-live="polite"
          aria-atomic="true"
          data-testid="results-count"
        >
          {{ searchStore.suggestionCount }}
        </div>
      </div>
    </div>

    <!-- Full Results Mode -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto" data-testid="full-results-list">
      <div
        data-testid="scroll-header"
        class="-mx-2 sticky top-0 z-10 mb-4 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/95 px-2 py-3 backdrop-blur-sm"
      >
        <button
          type="button"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          data-testid="back-button"
          @click="backToSearch"
        >
          ← {{ t('settings.fullResultsBack') }}
        </button>
        <h2 class="min-w-0 text-xl font-semibold text-gray-900">
          {{ t('home.resultsFor') }} "{{ searchQuery }}"
        </h2>
      </div>

      <!-- Loading State -->
      <div
        v-if="searchStore.isFullResultsLoading"
        class="flex min-h-64 items-center justify-center"
        data-testid="full-results-loading"
      >
        <div class="text-center">
          <div
            class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
            role="status"
          >
            <span class="sr-only">{{ t('home.loading') }}</span>
          </div>
          <p class="mt-4 text-sm text-gray-500">{{ t('home.searching') }}</p>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="searchStore.fullResultsError"
        class="flex min-h-64 items-center justify-center"
        data-testid="full-results-error"
      >
        <div class="text-center">
          <p class="text-lg font-medium text-red-600">
            {{ searchStore.fullResultsError }}
          </p>
          <button
            type="button"
            class="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            @click="handleEnterKey"
          >
            {{ t('common.tryAgain') }}
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="
          searchStore.fullResults &&
          searchStore.fullResults.tracks.length === 0 &&
          searchStore.fullResults.albums.length === 0 &&
          searchStore.fullResults.artists.length === 0
        "
        class="flex min-h-64 items-center justify-center"
        data-testid="empty-state"
      >
        <div class="text-center max-w-md">
          <p class="text-lg font-medium text-gray-900">
            {{ t('home.emptyState.title') }}
          </p>
          <p class="mt-2 text-sm text-gray-600">
            {{ t('home.emptyState.description') }}
          </p>
        </div>
      </div>

      <!-- Results List -->
      <SearchResultsList
        v-else-if="searchStore.fullResults"
        :results="displayedTracks"
        :albums="displayedAlbums"
        :artists="displayedArtists"
        @play="handlePlayTrack"
        @pause="handlePause"
        @play-album="handlePlayAlbum"
        @navigate-artist="handleNavigateArtist"
        @navigate-album="handleNavigateAlbum"
        @navigate-tidal-album="handleNavigateTidalAlbum"
      />
    </div>
  </div>
</template>
