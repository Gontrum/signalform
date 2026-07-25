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
  activeIndex,
  canStart,
  handleQueryInput,
  selectSuggestion,
  handleArrowDown,
  handleArrowUp,
  handleStart,
  handleEnterKey,
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
        :aria-label="t('search.genreRadio')"
        role="combobox"
        :aria-expanded="showSuggestions"
        :aria-activedescendant="
          activeIndex >= 0 ? `genre-radio-suggestion-${activeIndex}` : undefined
        "
        aria-controls="genre-radio-suggestions"
        class="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
        data-testid="genre-radio-input"
        autocomplete="off"
        @input="handleQueryInput(($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="handleEnterKey()"
        @keydown.down.prevent="handleArrowDown()"
        @keydown.up.prevent="handleArrowUp()"
      />

      <!-- Autocomplete suggestions -->
      <ul
        v-if="showSuggestions"
        id="genre-radio-suggestions"
        class="absolute top-full z-raised mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-md"
        role="listbox"
      >
        <!--
          keyboard selection is handled by the input's @keydown.enter/@keydown.down/@keydown.up
          via activeIndex (aria-activedescendant combobox pattern) — this option is never
          itself focused (tabindex="-1").
        -->
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
        <li
          v-for="(suggestion, index) in suggestions"
          :id="`genre-radio-suggestion-${index}`"
          :key="suggestion.name"
          data-testid="genre-radio-suggestion"
          class="cursor-pointer px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-50"
          :class="{ 'bg-neutral-100': activeIndex === index }"
          role="option"
          tabindex="-1"
          :aria-selected="activeIndex === index"
          @click="selectSuggestion(suggestion.name)"
        >
          {{ suggestion.name }}
          <span class="ml-1 text-xs text-neutral-400">{{ suggestion.count }}</span>
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

      <span v-if="isSearching" class="text-xs text-neutral-400" aria-live="polite">
        {{ t('search.genreRadioSearching') }}
      </span>
    </div>

    <p v-if="error" data-testid="genre-radio-panel-error" class="mt-1 text-xs text-error">
      {{ t('artist.genreRadioError') }}
    </p>
  </div>
</template>
