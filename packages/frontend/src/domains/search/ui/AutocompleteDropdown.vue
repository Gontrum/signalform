<script setup lang="ts">
/**
 * AutocompleteDropdown Component
 *
 * Displays autocomplete suggestions.
 * Implements Apple-inspired design with accessibility (WCAG AA).
 *
 * Features:
 * - Top 5 artist/album suggestions
 * - Loading, empty, and error states
 * - Keyboard navigation via activeIndex prop (controlled by parent)
 * - Touch-friendly (48px phone, 56px tablet)
 * - Motion-sensitive (prefers-reduced-motion support)
 *
 * @component
 */
import { ref, watch } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import { useArtistImages } from '@/domains/enrichment/shell/useArtistImage'
import type { AutocompleteSuggestion } from '../core/types'

interface Props {
  /** Autocomplete suggestions (max 5) */
  suggestions: readonly AutocompleteSuggestion[]
  /** Whether suggestions are being fetched */
  isLoading: boolean
  /** Whether no results were found (query >= 2 chars) */
  isEmpty: boolean
  /** Error message to display (network/timeout errors) */
  error: string | null
  /** Current search query — shown in footer CTA "Search for '...'" */
  query?: string
  /**
   * Index of the currently keyboard-highlighted item.
   * -1 = nothing highlighted, 0..suggestions.length-1 = a suggestion,
   * suggestions.length = the footer "Search for X" item.
   */
  activeIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
  query: '',
  activeIndex: -1,
})

interface Emits {
  /** Emitted when user clicks a suggestion */
  (event: 'select', suggestion: AutocompleteSuggestion): void
  /** Emitted when footer "Search for X" is clicked */
  (event: 'search'): void
}

const emit = defineEmits<Emits>()

const i18n = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18n.t(key)

// Load artist images lazily via Fanart.tv enrichment API (single shared source).
// Re-triggered whenever suggestions change (new query results arriving).
const artistImageState = ref<{ readonly getImage: (name: string) => string | null }>({
  getImage: () => null,
})
watch(
  () => props.suggestions,
  (suggestions) => {
    const names = suggestions
      .map((s) => s.artist)
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
    if (names.length > 0) {
      artistImageState.value = useArtistImages(names)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="!error || suggestions.length > 0 || isLoading"
    class="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg bg-gray-100 shadow-md transition-all duration-150 motion-reduce:duration-[0.01ms]"
    style="transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)"
  >
    <div class="w-full" aria-label="Autocomplete suggestions" data-testid="autocomplete-dropdown">
      <div
        v-if="isLoading"
        class="px-4 py-3 text-sm text-gray-500"
        role="status"
        aria-live="polite"
        data-testid="loading-state"
      >
        {{ t('home.loading') }}
      </div>

      <div
        v-else-if="isEmpty && !isLoading"
        class="px-4 py-3 text-sm italic text-gray-500"
        role="status"
        aria-live="polite"
        data-testid="empty-state"
      >
        {{ t('home.emptyState.title') }}
      </div>

      <ul v-else class="divide-y divide-gray-200" role="listbox">
        <li
          v-for="(suggestion, index) in props.suggestions"
          :key="suggestion.id"
          :class="[
            'flex min-h-[48px] cursor-pointer items-center px-4 py-3 transition-colors duration-150 motion-reduce:duration-[0.01ms] md:min-h-[56px]',
            activeIndex === index ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-900',
          ]"
          :style="{ transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)' }"
          :aria-label="`${suggestion.artist}${suggestion.album ? ` - ${suggestion.album}` : ''}`"
          :data-testid="`suggestion-item-${index}`"
          role="option"
          :aria-selected="activeIndex === index"
          @click="emit('select', suggestion)"
        >
          <div
            :class="[
              'h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg flex items-center justify-center',
              activeIndex === index ? 'bg-accent-400' : 'bg-gray-300',
            ]"
          >
            <img
              v-if="artistImageState.getImage(suggestion.artist) || suggestion.albumCover"
              :src="artistImageState.getImage(suggestion.artist) ?? suggestion.albumCover"
              :alt="`${suggestion.album || suggestion.artist} cover art`"
              class="h-full w-full object-cover"
            />
            <span v-else class="text-xs text-gray-500">♪</span>
          </div>

          <div class="ml-3 min-w-0 flex-1">
            <div
              :class="[
                'truncate text-base font-normal',
                activeIndex === index ? 'text-white' : 'text-gray-700',
              ]"
            >
              {{ suggestion.artist }}
            </div>
            <div
              v-if="suggestion.album"
              :class="['truncate text-sm', activeIndex === index ? 'text-white' : 'text-gray-500']"
            >
              {{ suggestion.album }}
            </div>
          </div>

          <div
            v-if="suggestion.quality?.lossless"
            class="ml-2 flex-shrink-0 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white"
            :title="`${suggestion.quality.format} ${suggestion.quality.sampleRate}/${suggestion.quality.bitrate / 1000}k`"
          >
            {{ suggestion.quality.format }} {{ suggestion.quality.sampleRate }}/{{
              suggestion.quality.bitrate / 1000
            }}
          </div>
        </li>
      </ul>

      <li
        v-if="suggestions.length > 0"
        :class="[
          'flex min-h-[48px] cursor-pointer items-center gap-3 border-t border-gray-200 px-4 py-3 text-sm transition-colors duration-150 motion-reduce:duration-[0.01ms] md:min-h-[56px]',
          activeIndex === suggestions.length
            ? 'bg-accent-500 text-white'
            : 'bg-gray-100 text-gray-700',
        ]"
        data-testid="autocomplete-footer-hint"
        :aria-label="`Search for ${query}`"
        role="option"
        :aria-selected="activeIndex === suggestions.length"
        @click="emit('search')"
      >
        <svg
          :class="[
            'h-4 w-4 flex-shrink-0',
            activeIndex === suggestions.length ? 'text-white' : 'text-gray-500',
          ]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span>{{ t('home.viewArtist').replace('{name}', String(query ?? '')) }}</span>
      </li>
    </div>
  </div>

  <div
    v-if="error && !isLoading && suggestions.length === 0"
    class="absolute top-full z-10 mt-1 w-full rounded-lg bg-error/10 p-4 text-center text-sm text-error shadow-md"
    role="alert"
    aria-live="assertive"
    data-testid="error-state"
  >
    {{ error }}
  </div>
</template>
