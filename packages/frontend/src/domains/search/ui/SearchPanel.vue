<script setup lang="ts">
import MainNavBar from '@/app/MainNavBar.vue'
import PageHeader from '@/ui/PageHeader.vue'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import EmptyState from '@/ui/EmptyState.vue'
import AutocompleteDropdown from './AutocompleteDropdown.vue'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import SearchResultsList from './SearchResultsList.vue'
import { useSearchPanel } from '../shell/useSearchPanel'

const { isPhone } = useResponsiveLayout()

const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

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
  genreRadioLoading,
  genreRadioError,
  handleGenreRadioStart,
  personalRadioEnabled,
  personalRadioLoading,
  personalRadioError,
  handlePersonalRadioStart,
  lovedRadioLoading,
  lovedRadioError,
  startLovedRadioMode,
} = useSearchPanel()
</script>

<template>
  <div data-testid="search-container" class="flex h-full flex-col p-6">
    <MainNavBar v-if="!isPhone" />
    <PageHeader v-if="isPhone" :title="t('nav.search')" />
    <h1 v-else class="sr-only">{{ t('nav.search') }}</h1>
    <!-- Autocomplete Mode -->
    <div v-if="!showFullResults" class="flex h-full flex-col items-center justify-center">
      <div class="w-full max-w-2xl">
        <div class="relative">
          <input
            ref="searchInputEl"
            v-model="searchQuery"
            type="text"
            class="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
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
            class="absolute top-full z-raised mt-1 w-full rounded-lg bg-neutral-100 p-3 text-center text-xs text-neutral-500 shadow-sm"
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
          class="mt-4 text-center text-sm text-neutral-500"
          aria-live="polite"
          aria-atomic="true"
          data-testid="results-count"
        >
          {{ searchStore.suggestionCount }}
        </div>

        <!-- Personal Radio — only shown when feature is enabled in settings -->
        <div v-if="personalRadioEnabled" class="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            data-testid="personal-radio-button"
            :disabled="personalRadioLoading"
            class="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            @click="handlePersonalRadioStart"
          >
            {{ personalRadioLoading ? t('home.personalRadioStarting') : t('home.personalRadio') }}
          </button>
          <span
            v-if="personalRadioError"
            class="text-xs text-error"
            data-testid="personal-radio-error"
          >
            {{ t('home.personalRadioError') }}
          </span>
          <button
            type="button"
            data-testid="loved-radio-button"
            :disabled="lovedRadioLoading"
            class="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            @click="startLovedRadioMode"
          >
            {{ lovedRadioLoading ? t('home.lovedRadioStarting') : t('home.lovedRadio') }}
          </button>
          <span v-if="lovedRadioError" class="text-xs text-error" data-testid="loved-radio-error">
            {{ t('home.lovedRadioError') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Full Results Mode -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto" data-testid="full-results-list">
      <div
        data-testid="scroll-header"
        class="sticky top-0 z-raised mb-4 flex flex-col rounded-xl border border-neutral-200 bg-neutral-50/95 px-3 py-3 shadow-sm backdrop-blur-sm"
      >
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
            data-testid="back-button"
            @click="backToSearch"
          >
            ← {{ t('settings.fullResultsBack') }}
          </button>
          <h2 class="min-w-0 text-xl font-semibold text-neutral-900">
            {{ t('home.resultsFor') }} "{{ searchQuery }}"
          </h2>
        </div>

        <!-- Genre Radio action for current query -->
        <div class="mt-2 flex items-center gap-2">
          <button
            type="button"
            data-testid="genre-radio-from-search-button"
            :disabled="genreRadioLoading"
            class="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            @click="handleGenreRadioStart"
          >
            {{ genreRadioLoading ? t('search.genreRadioSearching') : t('search.genreRadioStart') }}
            "{{ searchQuery }}"
          </button>
          <span
            v-if="genreRadioError"
            class="text-xs text-error"
            data-testid="genre-radio-search-error"
          >
            {{ t('artist.genreRadioError') }}
          </span>
        </div>
      </div>

      <!-- Tidal Unavailable Warning -->
      <div
        v-if="searchStore.showTidalWarning"
        class="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        role="status"
        aria-live="polite"
        data-testid="tidal-unavailable-warning"
      >
        {{ t('home.tidalUnavailable') }}
      </div>

      <!-- Loading State -->
      <div
        v-if="searchStore.isFullResultsLoading"
        class="flex min-h-64 items-center justify-center"
        data-testid="full-results-loading"
      >
        <div class="text-center">
          <LoadingSpinner size="md" color="current" />
          <p class="mt-4 text-sm text-neutral-500">{{ t('home.searching') }}</p>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="searchStore.fullResultsError"
        class="flex min-h-64 items-center justify-center"
        data-testid="full-results-error"
      >
        <div class="text-center">
          <p class="text-lg font-medium text-error">
            {{ searchStore.fullResultsError }}
          </p>
          <button
            type="button"
            class="mt-4 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
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
        <EmptyState
          :title="t('home.emptyState.title')"
          :subtitle="t('home.emptyState.description')"
        >
          <template #icon>
            <svg
              class="h-12 w-12 text-neutral-400"
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
