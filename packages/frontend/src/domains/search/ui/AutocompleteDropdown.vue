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
import Banner from '@/ui/Banner.vue'
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
    class="absolute top-full z-raised mt-1 w-full overflow-hidden rounded-lg bg-neutral-100 shadow-md transition-all duration-200 motion-reduce:duration-[0.01ms]"
    style="transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)"
  >
    <div id="autocomplete-dropdown" class="w-full" data-testid="autocomplete-dropdown">
      <div
        v-if="isLoading"
        class="px-4 py-3 text-sm text-neutral-500"
        role="status"
        aria-live="polite"
        data-testid="loading-state"
      >
        {{ t('home.loading') }}
      </div>

      <div
        v-else-if="isEmpty && !isLoading"
        class="px-4 py-3 text-sm italic text-neutral-600"
        role="status"
        aria-live="polite"
        data-testid="empty-state"
      >
        {{ t('home.emptyState.title') }}
      </div>

      <ul
        v-else
        class="divide-y divide-neutral-200"
        role="listbox"
        aria-label="Autocomplete suggestions"
      >
        <!--
          Keyboard selection is fully handled by the parent input's
          @keydown.enter/@keydown.down/@keydown.up via activeIndex (aria-activedescendant
          combobox pattern) — this option element is never itself focused (tabindex="-1").
        -->
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
        <li
          v-for="(suggestion, index) in props.suggestions"
          :id="`suggestion-item-${index}`"
          :key="suggestion.id"
          :class="[
            'flex min-h-12 cursor-pointer items-center px-4 py-3 transition-colors duration-200 motion-reduce:duration-[0.01ms] md:min-h-14',
            activeIndex === index ? 'bg-accent-500 text-white' : 'bg-neutral-100 text-neutral-900',
          ]"
          :style="{ transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)' }"
          :aria-label="`${suggestion.artist}${suggestion.album ? ` - ${suggestion.album}` : ''}`"
          :data-testid="`suggestion-item-${index}`"
          role="option"
          tabindex="-1"
          :aria-selected="activeIndex === index"
          @click="emit('select', suggestion)"
        >
          <div
            :class="[
              'h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg flex items-center justify-center',
              activeIndex === index ? 'bg-accent-400' : 'bg-neutral-300',
            ]"
          >
            <img
              v-if="artistImageState.getImage(suggestion.artist) || suggestion.albumCover"
              :src="artistImageState.getImage(suggestion.artist) ?? suggestion.albumCover"
              :alt="`${suggestion.album || suggestion.artist} cover art`"
              class="h-full w-full object-cover"
            />
            <span v-else class="text-xs text-neutral-500">♪</span>
          </div>

          <div class="ml-3 min-w-0 flex-1">
            <div
              :class="[
                'truncate text-base font-normal',
                activeIndex === index ? 'text-white' : 'text-neutral-700',
              ]"
            >
              {{ suggestion.artist }}
            </div>
            <div
              v-if="suggestion.album"
              :class="[
                'truncate text-sm',
                activeIndex === index ? 'text-white' : 'text-neutral-500',
              ]"
            >
              {{ suggestion.album }}
            </div>
          </div>

          <div
            v-if="suggestion.quality?.lossless"
            class="ml-2 flex-shrink-0 rounded bg-success px-2 py-1 text-xs font-medium text-white"
            :title="`${suggestion.quality.format} ${suggestion.quality.sampleRate}/${suggestion.quality.bitrate / 1000}k`"
          >
            {{ suggestion.quality.format }} {{ suggestion.quality.sampleRate }}/{{
              suggestion.quality.bitrate / 1000
            }}
          </div>
        </li>
      </ul>

      <!--
        Keyboard selection is fully handled by the parent input's
        @keydown.enter/@keydown.down/@keydown.up via activeIndex (aria-activedescendant
        combobox pattern) — this option element is never itself focused (tabindex="-1").
      -->
      <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
      <li
        v-if="suggestions.length > 0"
        :id="`suggestion-item-${suggestions.length}`"
        :class="[
          'flex min-h-12 cursor-pointer items-center gap-3 border-t border-neutral-200 px-4 py-3 text-sm transition-colors duration-200 motion-reduce:duration-[0.01ms] md:min-h-14',
          activeIndex === suggestions.length
            ? 'bg-accent-500 text-white'
            : 'bg-neutral-100 text-neutral-700',
        ]"
        data-testid="autocomplete-footer-hint"
        :aria-label="`Search for ${query}`"
        role="option"
        tabindex="-1"
        :aria-selected="activeIndex === suggestions.length"
        @click="emit('search')"
      >
        <svg
          :class="[
            'h-4 w-4 flex-shrink-0',
            activeIndex === suggestions.length ? 'text-white' : 'text-neutral-500',
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

  <Banner
    v-if="error && !isLoading && suggestions.length === 0"
    data-testid="error-state"
    variant="error"
    class="absolute top-full z-raised mt-1 w-full text-center shadow-md"
  >
    {{ error }}
  </Banner>
</template>
