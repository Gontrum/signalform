<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import { useGenreRadio } from '../shell/useGenreRadio'

const i18n = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)

const {
  query,
  suggestions,
  isSearching,
  isStarting,
  error,
  showSuggestions,
  canStart,
  handleQueryInput,
  selectSuggestion,
  handleStart,
} = useGenreRadio()
</script>

<template>
  <div class="mt-6 w-full max-w-2xl" data-testid="genre-radio-panel">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
      {{ t('search.genreRadio') }}
    </h2>

    <div class="relative">
      <input
        :value="query"
        type="text"
        :placeholder="t('search.genreRadioPlaceholder')"
        class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        data-testid="genre-radio-input"
        autocomplete="off"
        @input="handleQueryInput(($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="handleStart()"
      />

      <!-- Autocomplete suggestions -->
      <ul
        v-if="showSuggestions"
        class="absolute top-full z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-md"
        role="listbox"
      >
        <li
          v-for="suggestion in suggestions"
          :key="suggestion.name"
          data-testid="genre-radio-suggestion"
          class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-gray-50"
          role="option"
          @click="selectSuggestion(suggestion.name)"
        >
          {{ suggestion.name }}
          <span class="ml-1 text-xs text-gray-400">{{ suggestion.count }}</span>
        </li>
      </ul>
    </div>

    <div class="mt-2 flex items-center gap-3">
      <button
        type="button"
        data-testid="genre-radio-start-button"
        :disabled="!canStart"
        class="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        @click="handleStart()"
      >
        {{ isStarting ? t('search.genreRadioSearching') : t('search.genreRadioStart') }}
      </button>

      <span v-if="isSearching" class="text-xs text-gray-400" aria-live="polite">
        {{ t('search.genreRadioSearching') }}
      </span>
    </div>

    <p v-if="error" data-testid="genre-radio-panel-error" class="mt-1 text-xs text-red-500">
      {{ t('artist.genreRadioError') }}
    </p>
  </div>
</template>
