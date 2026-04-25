<script setup lang="ts">
import { computed } from 'vue'
import { Listbox, ListboxOptions, ListboxOption } from '@headlessui/vue'
import type { TrackResult, AlbumResult, ArtistResult } from '../core/types'
import QualityBadge from '@/ui/QualityBadge.vue'
import AlbumActionButtons from './AlbumActionButtons.vue'
import { SOURCE_LABELS, SOURCE_TOOLTIP_TEXT } from '@/utils/sourceInfo'
import { useI18nStore } from '@/app/i18nStore'
import { useSearchResultsActions } from '../shell/useSearchResultsActions'

interface Props {
  results: readonly TrackResult[]
  albums?: readonly AlbumResult[]
  artists?: readonly ArtistResult[]
}

interface Emits {
  (event: 'play', track: TrackResult): void
  (event: 'pause'): void
  (event: 'play-album', albumId: string): void
  (
    event: 'navigate-artist',
    payload: { readonly artistId: string | null; readonly name: string },
  ): void
  (event: 'navigate-album', payload: { readonly albumId: string }): void
  (
    event: 'navigate-tidal-album',
    payload: {
      readonly title: string
      readonly artist: string
      readonly coverArtUrl?: string
      readonly trackUrls: ReadonlyArray<string>
      readonly trackTitles?: ReadonlyArray<string>
    },
  ): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const i18nStore = useI18nStore()
const t = i18nStore.t
const {
  playbackStore,
  selectedTrack,
  coverErrors,
  tidalFallbackCovers,
  trackQueueSuccess,
  trackQueueError,
  albumQueueSuccess,
  albumQueueError,
  playTrackListSuccess,
  playTrackListError,
  addTrackListQueueSuccess,
  addTrackListQueueError,
  artistImageState,
  isTrackPlaying,
  onAlbumCoverError,
  onAlbumCoverLoad,
  handleAddToQueue,
  handleAddAlbumToQueue,
  handlePlayTrackList,
  handlePlayTidalSearchAlbum,
  handleAddTrackListToQueue,
  handleAddTidalSearchAlbumToQueue,
  handleSelect: selectTrack,
} = useSearchResultsActions({ artists: props.artists })

const handlePlay = (track: TrackResult) => {
  emit('play', track)
}

const handlePause = () => {
  emit('pause')
}

const handlePlayAlbum = (albumId: string) => {
  emit('play-album', albumId)
}

const handleNavigateAlbum = (albumId: string): void => {
  emit('navigate-album', { albumId })
}

const handleNavigateTidalAlbum = (album: AlbumResult): void => {
  emit('navigate-tidal-album', {
    title: album.title,
    artist: album.artist,
    coverArtUrl: album.coverArtUrl,
    trackUrls: album.trackUrls ?? [],
    trackTitles: album.trackTitles,
  })
}

const handleArtistClick = (artist: ArtistResult) => {
  emit('navigate-artist', { artistId: artist.artistId, name: artist.name })
}

const handleSelect = (track: TrackResult): void => {
  selectTrack(track, (nextTrack) => emit('play', nextTrack))
}

// TODO(Story 3.x): Implement duration display when LMS metadata query is available
// const formatDuration = (seconds?: number): string => {
//   if (!seconds) return ''
//   const mins = Math.floor(seconds / 60)
//   const secs = seconds % 60
//   return `${mins}:${secs.toString().padStart(2, '0')}`
// }

const getSourceTooltip = (source: string): string => SOURCE_TOOLTIP_TEXT[source] ?? 'Source unknown'

const getAlsoAvailableOn = (result: TrackResult): string => {
  if (!result.availableSources || result.availableSources.length <= 1) return ''
  const otherSources = result.availableSources
    .filter((s) => s.source !== result.source)
    .map((s) => SOURCE_LABELS[s.source] ?? 'Unknown')
  return otherSources.length > 0 ? `Also available on: ${otherSources.join(', ')}` : ''
}

// Pre-compute "also available" text per result to avoid double function call in template (M3 fix)
const alsoAvailableTexts = computed(
  (): Readonly<Record<string, string>> =>
    Object.fromEntries(props.results.map((r) => [r.id, getAlsoAvailableOn(r)])),
)
</script>

<template>
  <div>
    <!-- Artists Section (Story 7.4 — rendered first, above tracks) -->
    <section v-if="artists && artists.length > 0" data-testid="artist-results" class="mb-6">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {{ t('home.artistsSection') }}
      </h2>
      <ul class="space-y-1">
        <li v-for="artist in artists" :key="artist.name" data-testid="artist-result-item">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left transition-all duration-200 hover:border-accent-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent-500"
            :aria-label="t('home.viewArtist') + ' ' + artist.name"
            @click="handleArtistClick(artist)"
          >
            <!-- Artist image: loaded from enrichment API (Fanart.tv), lazy + cached -->
            <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full">
              <img
                v-if="artistImageState.getImage(artist.name)"
                :src="artistImageState.getImage(artist.name)!"
                :alt="artist.name"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full w-full items-center justify-center bg-neutral-200">
                <span class="text-lg text-neutral-500">♪</span>
              </div>
            </div>
            <span data-testid="artist-result-name" class="text-base font-medium text-neutral-900">
              {{ artist.name }}
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Tracks Section -->
    <h2
      v-if="results.length > 0"
      class="text-lg font-semibold text-neutral-900 mb-4"
      data-testid="tracks-section-heading"
    >
      {{ t('home.tracksSection') }}
    </h2>
    <Listbox v-model="selectedTrack" @update:model-value="handleSelect">
      <div data-testid="results-list" class="space-y-2 overflow-x-hidden">
        <ListboxOptions static class="space-y-2" aria-label="Search results">
          <ListboxOption
            v-for="result in results"
            :key="result.id"
            v-slot="{ active, selected }"
            :value="result"
            :data-testid="`result-item-${result.id}`"
          >
            <div
              :class="[
                'flex items-center justify-between rounded-lg border p-4 transition-all duration-200 cursor-pointer',
                active || selected
                  ? 'border-accent-500 bg-accent-50 shadow-md'
                  : 'border-neutral-200 bg-white hover:border-accent-300 hover:shadow-md',
              ]"
            >
              <!-- Track Info -->
              <div class="flex-1">
                <h3 class="text-base font-medium text-neutral-900">
                  {{ result.title }}
                </h3>
                <p class="text-sm text-neutral-600">
                  <button
                    v-if="result.artist"
                    type="button"
                    data-testid="track-artist-link"
                    class="cursor-pointer hover:text-primary-600 hover:underline"
                    @click.stop="
                      emit('navigate-artist', {
                        artistId: result.artistId ?? null,
                        name: result.artist,
                      })
                    "
                  >
                    {{ result.artist }}</button
                  ><span v-else>{{ result.artist }}</span
                  >{{ result.album ? ` • ${result.album}` : '' }}
                </p>
                <!-- Source info: badge (Story 3.3) + tooltip + also-available (Story 3.4) -->
                <div class="mt-1">
                  <span :title="getSourceTooltip(result.source)">
                    <QualityBadge :source="result.source" :quality="result.audioQuality" />
                  </span>
                  <p
                    v-if="alsoAvailableTexts[result.id]"
                    data-testid="also-available"
                    class="mt-0.5 text-xs text-neutral-400"
                  >
                    {{ alsoAvailableTexts[result.id] }}
                  </p>
                </div>
                <!-- TODO(Story 3.x): Add duration display when LMS metadata implemented -->
              </div>

              <!-- Add to Queue Button -->
              <button
                type="button"
                :aria-label="`Add ${result.title} to queue`"
                data-testid="add-to-queue-button"
                class="ml-2 rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
                @click.stop="handleAddToQueue(result)"
              >
                <!-- Success checkmark — shown only after confirmed API success -->
                <svg
                  v-if="trackQueueSuccess.items.value.has(result.id)"
                  class="h-4 w-4 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <!-- Error indicator — shown when addToQueue fails -->
                <svg
                  v-else-if="trackQueueError.items.value.has(result.id)"
                  data-testid="add-to-queue-error"
                  class="h-4 w-4 text-red-500"
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
                <!-- Default plus icon -->
                <svg
                  v-else
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>

              <!-- Play/Pause Button (AC4: Toggle based on playback state) -->
              <button
                v-if="!isTrackPlaying(result)"
                :data-testid="`play-button-${result.id}`"
                type="button"
                class="ml-4 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-out hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 active:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
                :aria-label="`Play ${result.title} by ${result.artist}`"
                :disabled="playbackStore.isLoading"
                @click.stop="handlePlay(result)"
              >
                <!-- Loading Spinner (Issue #9: Loading state) -->
                <svg
                  v-if="playbackStore.isLoading"
                  class="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <!-- Play Icon -->
                <svg
                  v-else
                  class="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span v-if="playbackStore.isLoading">Playing...</span>
              </button>

              <!-- Pause Button (shown when this track is playing) -->
              <button
                v-else
                :data-testid="`pause-button-${result.id}`"
                type="button"
                class="ml-4 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-accent-700 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-out hover:bg-accent-800 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 active:bg-accent-900"
                :aria-label="`Pause ${result.title} by ${result.artist}`"
                @click.stop="handlePause"
              >
                <!-- Pause Icon -->
                <svg
                  class="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              </button>
            </div>
          </ListboxOption>
        </ListboxOptions>
      </div>
    </Listbox>

    <!-- Albums Section -->
    <section
      v-if="albums && albums.length > 0"
      data-testid="albums-list"
      class="mt-8 space-y-2"
      aria-label="Albums"
    >
      <h2 class="text-lg font-semibold text-neutral-900 mb-4">{{ t('home.albumsSection') }}</h2>
      <template v-for="album in albums" :key="album.id">
        <!--
          Unified album card: local albums (albumId defined) are navigable with a Play button;
          streaming albums (albumId undefined) are non-navigable with a source badge.
          The data-testid uses album.id which is the LMS albumId for local albums or the
          lowercase compound "artist::album" key for streaming albums — both safe in attribute selectors.
        -->
        <div
          :data-testid="`album-result-item-${album.id}`"
          v-bind="
            album.albumId || (album.source === 'tidal' && album.trackUrls?.length)
              ? { role: 'button', tabindex: '0' }
              : {}
          "
          :class="[
            'flex items-center gap-4 justify-between rounded-lg border border-neutral-200 bg-white p-4',
            album.albumId || (album.source === 'tidal' && album.trackUrls?.length)
              ? 'transition-all duration-200 hover:border-accent-300 hover:shadow-md cursor-pointer'
              : 'cursor-default',
          ]"
          @click="
            album.albumId
              ? handleNavigateAlbum(album.albumId)
              : album.source === 'tidal' && album.trackUrls?.length
                ? handleNavigateTidalAlbum(album)
                : undefined
          "
          @keydown.enter="
            album.albumId
              ? handleNavigateAlbum(album.albumId)
              : album.source === 'tidal' && album.trackUrls?.length
                ? handleNavigateTidalAlbum(album)
                : undefined
          "
          @keydown.space.prevent="
            album.albumId
              ? handleNavigateAlbum(album.albumId)
              : album.source === 'tidal' && album.trackUrls?.length
                ? handleNavigateTidalAlbum(album)
                : undefined
          "
        >
          <!-- Album Cover: actual image when available, ♪ placeholder when not (AC1-AC3) -->
          <!-- Falls back to Tidal artist image when LMS returns its generic placeholder -->
          <div
            data-testid="album-result-cover"
            class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-neutral-200 overflow-hidden"
          >
            <!-- Tidal fallback: already resolved, show directly -->
            <img
              v-if="tidalFallbackCovers[album.id] && !coverErrors[album.id]"
              :src="tidalFallbackCovers[album.id]"
              :alt="`${album.title} cover art`"
              loading="lazy"
              class="h-full w-full object-cover"
              @error="onAlbumCoverError(album.id)"
            />
            <!-- LMS cover: check on load whether it is a placeholder -->
            <img
              v-else-if="album.coverArtUrl && !coverErrors[album.id]"
              :src="album.coverArtUrl"
              :alt="`${album.title} cover art`"
              loading="lazy"
              class="h-full w-full object-cover"
              @load="onAlbumCoverLoad($event, album)"
              @error="onAlbumCoverError(album.id)"
            />
            <span v-else class="text-lg text-neutral-400">♪</span>
          </div>

          <!-- Album Info -->
          <div data-testid="album-result-info" class="min-w-0 flex-1">
            <h3
              data-testid="album-result-title"
              class="truncate text-base font-medium text-neutral-900"
            >
              {{ album.title }}
            </h3>
            <p class="truncate text-sm text-neutral-600">
              {{ album.artist }}
            </p>
          </div>

          <!-- Play Album + Add to Queue buttons (local albums) -->
          <!-- play-state is always idle for local albums (playAlbum has no transient feedback) -->
          <template v-if="album.albumId">
            <AlbumActionButtons
              :album-id="album.id"
              :album-title="album.title"
              :album-artist="album.artist"
              play-state="idle"
              :queue-state="
                albumQueueSuccess.items.value.has(album.id)
                  ? 'success'
                  : albumQueueError.items.value.has(album.id)
                    ? 'error'
                    : 'idle'
              "
              :show-go-to-artist="!!album.artist"
              @play="handlePlayAlbum(album.albumId)"
              @add-to-queue="handleAddAlbumToQueue(album.albumId, album.id)"
              @go-to-artist="
                emit('navigate-artist', { artistId: album.artistId ?? null, name: album.artist })
              "
            />
          </template>

          <!-- Play + Queue buttons for streaming albums with trackUrls (Story 9.5/9.6) -->
          <template v-else-if="album.trackUrls?.length">
            <AlbumActionButtons
              :album-id="album.id"
              :album-title="album.title"
              :album-artist="album.artist"
              :play-state="
                playTrackListSuccess.items.value.has(album.id)
                  ? 'success'
                  : playTrackListError.items.value.has(album.id)
                    ? 'error'
                    : 'idle'
              "
              :queue-state="
                addTrackListQueueSuccess.items.value.has(album.id)
                  ? 'success'
                  : addTrackListQueueError.items.value.has(album.id)
                    ? 'error'
                    : 'idle'
              "
              :show-go-to-artist="album.source === 'tidal' && !!album.artist"
              @play="
                album.source === 'tidal'
                  ? handlePlayTidalSearchAlbum(album.title, album.artist, album.trackUrls, album.id)
                  : handlePlayTrackList(album.trackUrls, album.id)
              "
              @add-to-queue="
                album.source === 'tidal'
                  ? handleAddTidalSearchAlbumToQueue(
                      album.title,
                      album.artist,
                      album.trackUrls,
                      album.id,
                    )
                  : handleAddTrackListToQueue(album.trackUrls, album.id)
              "
              @go-to-artist="emit('navigate-artist', { artistId: null, name: album.artist })"
            />
          </template>

          <!-- Streaming badge fallback (streaming albums without trackUrls) — shows source label -->
          <span
            v-else
            data-testid="album-streaming-badge"
            class="ml-4 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500"
          >
            {{ SOURCE_LABELS[album.source ?? ''] ?? 'Streaming' }}
          </span>
        </div>
      </template>
    </section>

    <!-- ARIA Live Region for Playback Status Announcements (Issue #20: Accessibility) -->
    <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      <span v-if="playbackStore.isCurrentlyPlaying && playbackStore.currentTrack">
        Now playing: {{ playbackStore.currentTrack.title }} by
        {{ playbackStore.currentTrack.artist }}
      </span>
      <span v-else-if="playbackStore.isPaused && playbackStore.currentTrack">
        Paused: {{ playbackStore.currentTrack.title }}
      </span>
      <span v-else-if="playbackStore.error"> Error: {{ playbackStore.error }} </span>
    </div>
  </div>
</template>
