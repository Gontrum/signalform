<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import type { MessageKey } from '@/i18n'
import {
  PASTE_IMPORT_LIMIT,
  importName,
  isImportSubmittable,
  planImport,
  toLastFmSource,
} from '../core/import-form'
import type { ImportFormState, LastFmKind, LastFmPeriod } from '../core/import-form'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import { usePlaylistImport } from '../shell/usePlaylistImport'

const emit = defineEmits<{
  (event: 'saved'): void
}>()

const i18nStore = useI18nStore()
const t = (key: MessageKey): string => i18nStore.t(key)

const { isImporting, result, errorKind, submitText, submitLastFm } = usePlaylistImport()

const isOpen = ref(false)
const isMissingOpen = ref(false)

const sourceMode = ref<'paste' | 'lastfm'>('paste')
const text = ref('')
const lastFmKind = ref<LastFmKind>('top-tracks')
const period = ref<LastFmPeriod>('overall')
const tag = ref('')
const artist = ref('')
const limit = ref(50)
const saveEnabled = ref(false)
const saveName = ref('')

const formState = computed<ImportFormState>(() => ({
  sourceMode: sourceMode.value,
  text: text.value,
  lastFmKind: lastFmKind.value,
  period: period.value,
  tag: tag.value,
  artist: artist.value,
  limit: limit.value,
  saveEnabled: saveEnabled.value,
  saveName: saveName.value,
}))

const plan = computed(() => planImport(formState.value))

const isSubmitDisabled = computed(() => isImporting.value || !isImportSubmittable(formState.value))

const estimateLabel = computed(() =>
  t('playlists.import.estimate')
    .replace('{count}', String(plan.value.candidateCount))
    .replace('{seconds}', String(plan.value.estimatedSeconds)),
)

const truncatedLabel = computed(() =>
  t('playlists.import.truncated').replace('{limit}', String(PASTE_IMPORT_LIMIT)),
)

const handleSubmit = async (): Promise<void> => {
  if (isSubmitDisabled.value) {
    return
  }

  isMissingOpen.value = false
  const name = importName(formState.value)

  if (sourceMode.value === 'paste') {
    await submitText(text.value, name)
  } else {
    await submitLastFm(toLastFmSource(formState.value), limit.value, name)
  }

  if (result.value?.savedAs !== undefined) {
    emit('saved')
  }
}

const submitAriaLabel = computed(() =>
  isImporting.value ? t('playlists.import.running') : t('playlists.import.submit'),
)

const importedLabel = computed(() =>
  t('playlists.import.result')
    .replace('{imported}', String(result.value?.imported ?? 0))
    .replace('{total}', String(result.value?.total ?? 0)),
)

const savedLabel = computed(() =>
  t('playlists.import.resultSaved').replace('{name}', result.value?.savedAs ?? ''),
)

const skippedLabel = computed(() =>
  t('playlists.import.skipped').replace('{count}', String(result.value?.skippedLines ?? 0)),
)

const missingToggleLabel = computed(() =>
  isMissingOpen.value
    ? t('playlists.import.missingHide')
    : t('playlists.import.missingToggle').replace(
        '{count}',
        String(result.value?.missing.length ?? 0),
      ),
)

const zeroResultKey = computed<MessageKey>(() =>
  (result.value?.missing.length ?? 0) > 0
    ? 'playlists.import.resultNoneResolved'
    : 'playlists.import.empty',
)

const errorKey = computed<MessageKey>(() => {
  if (errorKind.value === 'lastfm-not-configured') {
    return 'playlists.import.errorLastfmNotConfigured'
  }
  return errorKind.value === 'lastfm-unavailable'
    ? 'playlists.import.errorLastfmUnavailable'
    : 'playlists.import.error'
})

const segmentClass = (active: boolean): readonly string[] => [
  'flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-accent-500',
  active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100',
]

const FIELD_BASE_CLASS =
  'min-h-11 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50'

const selectClass = `${FIELD_BASE_CLASS} text-sm`

// iOS Safari zooms the page when a focused field is under 16px, and the
// viewport meta deliberately allows zoom; a <select> is not typed into and is
// never focused that way.
const textFieldClass = `${FIELD_BASE_CLASS} text-base`

const labelClass = 'text-xs font-medium text-neutral-700'
</script>

<template>
  <div data-testid="playlist-import-section" class="mt-6 border-t border-neutral-200 pt-4">
    <button
      type="button"
      data-testid="playlist-import-toggle"
      :aria-expanded="isOpen"
      aria-controls="playlist-import-body"
      class="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-base font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
      @click="isOpen = !isOpen"
    >
      <span>{{ t('playlists.import.heading') }}</span>
      <svg
        :class="['h-5 w-5 text-neutral-500 transition-transform', isOpen ? 'rotate-180' : '']"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="isOpen" id="playlist-import-body">
      <fieldset class="mt-3">
        <legend class="sr-only">{{ t('playlists.import.sourceLegend') }}</legend>
        <div class="flex gap-1 rounded-lg border border-neutral-200 p-1">
          <div class="min-w-0 flex-1">
            <input
              id="playlist-import-source-paste"
              v-model="sourceMode"
              type="radio"
              name="playlist-import-source"
              value="paste"
              data-testid="playlist-import-source-paste"
              :disabled="isImporting"
              class="peer sr-only"
            />
            <label for="playlist-import-source-paste" :class="segmentClass(sourceMode === 'paste')">
              <span class="truncate">{{ t('playlists.import.sourcePaste') }}</span>
            </label>
          </div>
          <div class="min-w-0 flex-1">
            <input
              id="playlist-import-source-lastfm"
              v-model="sourceMode"
              type="radio"
              name="playlist-import-source"
              value="lastfm"
              data-testid="playlist-import-source-lastfm"
              :disabled="isImporting"
              class="peer sr-only"
            />
            <label
              for="playlist-import-source-lastfm"
              :class="segmentClass(sourceMode === 'lastfm')"
            >
              <span class="truncate">{{ t('playlists.import.sourceLastfm') }}</span>
            </label>
          </div>
        </div>
      </fieldset>

      <template v-if="sourceMode === 'paste'">
        <textarea
          v-model="text"
          data-testid="playlist-import-text"
          rows="8"
          :disabled="isImporting"
          :placeholder="t('playlists.import.placeholder')"
          :aria-label="t('playlists.import.textAria')"
          class="mt-3 min-h-11 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 font-mono text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50"
        />
        <p class="mt-1 text-xs text-neutral-500">{{ t('playlists.import.hint') }}</p>
        <p
          v-if="plan.truncated"
          data-testid="playlist-import-truncated"
          class="mt-1 text-xs text-neutral-700"
        >
          {{ truncatedLabel }}
        </p>
      </template>

      <template v-else>
        <div class="mt-3 flex flex-col gap-2">
          <label :class="labelClass" for="playlist-import-lastfm-kind">
            {{ t('playlists.import.lastfmKindLabel') }}
          </label>
          <select
            id="playlist-import-lastfm-kind"
            v-model="lastFmKind"
            data-testid="playlist-import-lastfm-kind"
            :disabled="isImporting"
            :class="selectClass"
          >
            <option value="top-tracks">{{ t('playlists.import.lastfmKindTopTracks') }}</option>
            <option value="loved">{{ t('playlists.import.lastfmKindLoved') }}</option>
            <option value="tag">{{ t('playlists.import.lastfmKindTag') }}</option>
            <option value="artist">{{ t('playlists.import.lastfmKindArtist') }}</option>
            <option value="recommended">{{ t('playlists.import.lastfmKindRecommended') }}</option>
          </select>
        </div>

        <div v-if="lastFmKind === 'top-tracks'" class="mt-3 flex flex-col gap-2">
          <label :class="labelClass" for="playlist-import-lastfm-period">
            {{ t('playlists.import.lastfmPeriodLabel') }}
          </label>
          <select
            id="playlist-import-lastfm-period"
            v-model="period"
            data-testid="playlist-import-lastfm-period"
            :disabled="isImporting"
            :class="selectClass"
          >
            <option value="7day">{{ t('playlists.import.lastfmPeriod7day') }}</option>
            <option value="1month">{{ t('playlists.import.lastfmPeriod1month') }}</option>
            <option value="12month">{{ t('playlists.import.lastfmPeriod12month') }}</option>
            <option value="overall">{{ t('playlists.import.lastfmPeriodOverall') }}</option>
          </select>
        </div>

        <div v-if="lastFmKind === 'tag'" class="mt-3 flex flex-col gap-2">
          <label :class="labelClass" for="playlist-import-lastfm-tag">
            {{ t('playlists.import.lastfmTagLabel') }}
          </label>
          <input
            id="playlist-import-lastfm-tag"
            v-model="tag"
            type="text"
            data-testid="playlist-import-lastfm-tag"
            :disabled="isImporting"
            :placeholder="t('playlists.import.lastfmTagPlaceholder')"
            :class="textFieldClass"
          />
        </div>

        <div v-if="lastFmKind === 'artist'" class="mt-3 flex flex-col gap-2">
          <label :class="labelClass" for="playlist-import-lastfm-artist">
            {{ t('playlists.import.lastfmArtistLabel') }}
          </label>
          <input
            id="playlist-import-lastfm-artist"
            v-model="artist"
            type="text"
            data-testid="playlist-import-lastfm-artist"
            :disabled="isImporting"
            :placeholder="t('playlists.import.lastfmArtistPlaceholder')"
            :class="textFieldClass"
          />
        </div>

        <div class="mt-3 flex flex-col gap-2">
          <label :class="labelClass" for="playlist-import-lastfm-limit">
            {{ t('playlists.import.lastfmLimitLabel') }}
          </label>
          <select
            id="playlist-import-lastfm-limit"
            v-model="limit"
            data-testid="playlist-import-lastfm-limit"
            :disabled="isImporting"
            :class="selectClass"
          >
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
      </template>

      <div class="mt-3 flex items-center gap-2">
        <input
          id="playlist-import-save-toggle"
          v-model="saveEnabled"
          type="checkbox"
          data-testid="playlist-import-save-toggle"
          :disabled="isImporting"
          class="h-5 w-5 shrink-0 rounded border-neutral-300 text-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50"
        />
        <label
          class="min-h-11 min-w-0 flex-1 py-3 text-sm text-neutral-700"
          for="playlist-import-save-toggle"
        >
          {{ t('playlists.import.saveToggle') }}
        </label>
      </div>

      <div v-if="saveEnabled" class="mt-2 flex flex-col gap-2">
        <label :class="labelClass" for="playlist-import-save-name">
          {{ t('playlists.import.saveNameLabel') }}
        </label>
        <input
          id="playlist-import-save-name"
          v-model="saveName"
          type="text"
          data-testid="playlist-import-save-name"
          :disabled="isImporting"
          :placeholder="t('playlists.import.saveNamePlaceholder')"
          :class="textFieldClass"
        />
      </div>

      <button
        type="button"
        data-testid="playlist-import-submit"
        :disabled="isSubmitDisabled"
        :aria-label="submitAriaLabel"
        class="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        @click="handleSubmit"
      >
        <LoadingSpinner
          v-if="isImporting"
          size="sm"
          color="current"
          :announce="false"
          aria-hidden="true"
        />
        <span>{{
          isImporting ? t('playlists.import.running') : t('playlists.import.submit')
        }}</span>
      </button>

      <p
        v-if="isImporting"
        data-testid="playlist-import-estimate"
        role="status"
        class="mt-2 text-xs text-neutral-500"
      >
        {{ estimateLabel }}
      </p>

      <div
        v-else-if="errorKind"
        data-testid="playlist-import-error"
        role="alert"
        class="mt-3 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
      >
        {{ t(errorKey) }}
      </div>

      <div
        v-else-if="result"
        data-testid="playlist-import-result"
        role="status"
        class="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      >
        <p class="text-sm font-medium text-neutral-900">
          {{ result.imported > 0 ? importedLabel : t(zeroResultKey) }}
        </p>
        <template v-if="result.imported > 0">
          <p
            data-testid="playlist-import-result-playing"
            class="mt-1 min-w-0 truncate text-xs text-neutral-500"
          >
            {{ t('playlists.import.resultPlaying') }}
          </p>
          <p
            v-if="result.savedAs !== undefined"
            data-testid="playlist-import-result-saved"
            class="mt-1 min-w-0 truncate text-xs text-neutral-500"
          >
            {{ savedLabel }}
          </p>
        </template>
        <p v-if="result.skippedLines > 0" class="mt-1 text-xs text-neutral-500">
          {{ skippedLabel }}
        </p>
        <div v-if="result.missing.length > 0" class="mt-2">
          <button
            type="button"
            data-testid="playlist-import-missing-toggle"
            :aria-expanded="isMissingOpen"
            aria-controls="playlist-import-missing"
            class="min-h-11 text-xs font-medium text-accent-700 underline focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
            @click="isMissingOpen = !isMissingOpen"
          >
            {{ missingToggleLabel }}
          </button>
          <ul
            v-if="isMissingOpen"
            id="playlist-import-missing"
            data-testid="playlist-import-missing"
            class="mt-2 flex flex-col gap-1"
          >
            <li
              v-for="entry in result.missing"
              :key="entry"
              data-testid="playlist-import-missing-row"
              class="truncate text-xs text-neutral-500"
            >
              {{ entry }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
