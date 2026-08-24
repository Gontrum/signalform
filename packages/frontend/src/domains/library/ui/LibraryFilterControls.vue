<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import type { LibraryGenre } from '@/platform/api/libraryApi'
import { useI18nStore } from '@/app/i18nStore'
import {
  chipRevealScrollLeft,
  filterAdjustedMessageKey,
  findGenreName,
  nextGenreFilter,
  showsGenreChips,
} from '../core/service'
import type { DecadeFilter, FilterField, SortOption } from '../core/types'

const props = defineProps<{
  readonly sortOptions: ReadonlyArray<{ readonly value: SortOption; readonly label: string }>
  readonly decadeOptions: ReadonlyArray<{ readonly value: DecadeFilter; readonly label: string }>
  readonly sortBy: SortOption
  readonly decadeFilter: DecadeFilter
  readonly genreFilter: number | null
  readonly genreChips: readonly LibraryGenre[]
  readonly genreRest: readonly LibraryGenre[]
  readonly hasActiveFilters: boolean
  readonly adjustedFilter: FilterField | null
}>()

const emit = defineEmits<{
  (event: 'select:sort', sort: SortOption): void
  (event: 'select:decade', decade: DecadeFilter): void
  (event: 'select:genre', genreId: number | null): void
  (event: 'clear'): void
}>()

const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

const allGenres = computed(() => [...props.genreChips, ...props.genreRest])

const showGenreChips = computed(() => showsGenreChips(props.genreChips))

// Carries its own answer for the absent case instead of leaning on the `v-if`
// that hides it — the guard and the message stay independent that way.
const adjustedMessage = computed(() =>
  props.adjustedFilter === null ? '' : t(filterAdjustedMessageKey(props.adjustedFilter)),
)

const activeGenreName = computed(() => findGenreName(allGenres.value, props.genreFilter))

const genreQuery = ref(activeGenreName.value)
watch(activeGenreName, (name) => {
  genreQuery.value = name
})

const toggleGenre = (genreId: number): void => {
  emit('select:genre', props.genreFilter === genreId ? null : genreId)
}

const handleGenreInput = (event: Event): void => {
  const value = event.target instanceof HTMLInputElement ? event.target.value : undefined
  if (value === undefined) {
    return
  }

  genreQuery.value = value

  const step = nextGenreFilter(allGenres.value, value, props.genreFilter)
  if (step.action === 'clear') {
    emit('select:genre', null)
  } else if (step.action === 'set') {
    emit('select:genre', step.genreId)
  }
}

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
  'min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

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

  row.scrollLeft = chipRevealScrollLeft({
    scrollLeft: row.scrollLeft,
    chipRight: chip.getBoundingClientRect().right,
    rowRight: row.getBoundingClientRect().right,
    gutterPx: CHIP_REVEAL_GUTTER_PX,
  })
}

const sortRow = useTemplateRef<HTMLElement>('sortRow')
const decadeRow = useTemplateRef<HTMLElement>('decadeRow')
const genreRow = useTemplateRef<HTMLElement>('genreRow')

// The rows outlive every reload, so this fires once per row when it first
// appears — which is the only moment a restored filter can sit past the fold;
// afterwards the active chip is the one the user just tapped.
watch(sortRow, revealActiveChip, { flush: 'post' })
watch(decadeRow, revealActiveChip, { flush: 'post' })
watch(genreRow, revealActiveChip, { flush: 'post' })
</script>

<template>
  <!-- Sort & Filter controls (local albums only) — chip-based for mobile
       friendliness. In artist mode none of the three has a counterpart in
       the query, so the block is gone rather than inert. -->
  <div data-testid="sort-controls" class="mb-3 space-y-2 sm:mb-4 sm:space-y-3">
    <!-- Sort chips -->
    <div
      ref="sortRow"
      data-testid="sort-chip-row"
      :class="CHIP_ROW_CLASS"
      role="group"
      :aria-label="t('library.sortOrderLabel')"
    >
      <button
        v-for="opt in sortOptions"
        :key="opt.value"
        type="button"
        :data-testid="`sort-chip-${opt.value}`"
        :aria-pressed="sortBy === opt.value ? 'true' : 'false'"
        :class="chipClass(sortBy === opt.value)"
        @click="emit('select:sort', opt.value)"
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
      :aria-label="t('library.decadeFilterLabel')"
    >
      <button
        v-for="opt in decadeOptions"
        :key="opt.value"
        type="button"
        :data-testid="`decade-chip-${opt.value}`"
        :aria-pressed="decadeFilter === opt.value ? 'true' : 'false'"
        :class="chipClass(decadeFilter === opt.value)"
        @click="emit('select:decade', opt.value)"
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
        class="min-h-11 w-full max-w-xs rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
      class="min-h-11 text-sm text-accent-700 underline hover:text-accent-900"
      @click="emit('clear')"
    >
      × {{ t('library.clearFilters') }}
    </button>

    <!-- Why a chip moved on its own. Belongs to the chips, not to the
         album list: the correction happens in the error state too. -->
    <p
      v-if="adjustedFilter !== null"
      data-testid="filter-adjusted-message"
      class="text-sm text-neutral-500"
      role="status"
      aria-live="polite"
    >
      {{ adjustedMessage }}
    </p>
  </div>
</template>
