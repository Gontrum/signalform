<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Listbox, ListboxOptions, ListboxOption } from '@headlessui/vue'
import { formatSeconds } from '@signalform/shared'
import type { TrackResult, AlbumResult, ArtistResult } from '../core/types'
import type { TagSearchMatch } from '@/platform/api/searchApi'
import QualityBadge from '@/ui/QualityBadge.vue'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import AlbumActionButtons from './AlbumActionButtons.vue'
import { getSourceLabel, getSourceTooltip } from '@/utils/sourceInfo'
import { createAlsoAvailableText, createTrackAnnouncement } from '@/domains/playback/core/service'
import { buildCountLabel } from '@/domains/enrichment/core/service'
import { useI18nStore } from '@/app/i18nStore'
import { useSearchResultsActions } from '../shell/useSearchResultsActions'

interface Props {
  results: readonly TrackResult[]
  albums?: readonly AlbumResult[]
  artists?: readonly ArtistResult[]
  tags?: readonly TagSearchMatch[]
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
// Reading `i18nStore.t` per call (rather than capturing it once) is what makes the
// translated computeds below re-evaluate when the language changes.
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)
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

const handleAlbumActivate = (album: AlbumResult): void => {
  if (album.albumId) {
    handleNavigateAlbum(album.albumId)
  } else if (album.source === 'tidal' && album.trackUrls?.length) {
    handleNavigateTidalAlbum(album)
  }
}

// An album card is only interactive (clickable/keyboard-activatable) when it is
// navigable to a local album or playable as a Tidal search result. Non-actionable
// albums (e.g. streaming results without track URLs) must get neither the
// role/tabindex nor the click/keydown handlers.
const isAlbumActionable = (album: AlbumResult): boolean =>
  Boolean(album.albumId) || (album.source === 'tidal' && Boolean(album.trackUrls?.length))

// Bundles role/tabindex together with the click/keydown listeners so a non-actionable
// album gets none of them — a single v-bind keeps static analysis (and readers) able to
// see the interactive role and its handlers as one unit, rather than three independently
// conditioned bindings that only happen to agree at runtime.
const albumInteractionProps = (album: AlbumResult): Readonly<Record<string, unknown>> =>
  isAlbumActionable(album)
    ? {
        role: 'button',
        tabindex: '0',
        onClick: () => handleAlbumActivate(album),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            handleAlbumActivate(album)
          } else if (event.key === ' ') {
            event.preventDefault()
            handleAlbumActivate(album)
          }
        },
      }
    : {}

const handleArtistClick = (artist: ArtistResult) => {
  emit('navigate-artist', { artistId: artist.artistId, name: artist.name })
}

const router = useRouter()

// Unlike artist/album navigation, a tag match has no in-app detail view of
// its own — it opens the global Discogs-backed album list for that tag, so
// this pushes directly rather than emitting for a parent handler to route.
const handleTagClick = (tag: TagSearchMatch): void => {
  void router.push({ name: 'tag-albums', query: { q: tag.query } })
}

const tagAlbumCountLabel = (tag: TagSearchMatch): string => {
  const albumCountOne = t('search.tagAlbumCountOne')
  const albumCountOther = t('search.tagAlbumCountOther')
  return buildCountLabel(tag.albumCount, albumCountOne, albumCountOther, i18nStore.currentLanguage)
}

const handleSelect = (track: TrackResult): void => {
  selectTrack(track, (nextTrack) => emit('play', nextTrack))
}

const sourceTooltip = (source: string): string => getSourceTooltip(t, source)

const viewArtistAriaLabel = (artist: ArtistResult): string =>
  t('home.viewArtist').replace('{name}', artist.name)

// All three row actions are icon-only or icon-plus-generic-word, so the track
// title in the accessible name is what tells the rows apart.
const addToQueueAriaLabel = (result: TrackResult): string =>
  t('home.addTrackToQueue').replace('{title}', result.title)

const playAriaLabel = (result: TrackResult): string =>
  t('home.playTrack').replace('{title}', result.title).replace('{name}', result.artist)

const pauseAriaLabel = (result: TrackResult): string =>
  t('home.pauseTrack').replace('{title}', result.title).replace('{name}', result.artist)

const albumSourceLabel = (source: string | undefined): string =>
  getSourceLabel(t, source, 'source.streaming')

// Keyed by result id so the template builds each sentence once instead of per binding.
const alsoAvailableTexts = computed((): Readonly<Record<string, string>> =>
  Object.fromEntries(props.results.map((r) => [r.id, createAlsoAvailableText(t, r)])),
)

// The Now Playing panel speaks this sentence through the same core builder; a second
// copy of it here is how this one stayed English through a whole translation pass.
const trackAnnouncement = computed((): string =>
  createTrackAnnouncement(t, playbackStore.currentTrack),
)

const pausedAnnouncement = computed((): string =>
  t('nowPlaying.pausedAnnouncement').replace('{title}', playbackStore.currentTrack?.title ?? ''),
)

const errorAnnouncement = computed((): string =>
  t('nowPlaying.errorAnnouncement').replace('{message}', playbackStore.error ?? ''),
)

// Tidal results carry no duration, and LMS reports 0 for tracks it has no length for —
// both must render no element at all rather than a "0:00" placeholder.
const durationLabels = computed((): Readonly<Record<string, string>> =>
  Object.fromEntries(
    props.results
      .filter((r): r is TrackResult & { readonly duration: number } => (r.duration ?? 0) > 0)
      .map((r) => [r.id, formatSeconds(r.duration)]),
  ),
)
</script>

<template>
  <div>
    <section v-if="artists && artists.length > 0" data-testid="artist-results" class="mb-6">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {{ t('home.artistsSection') }}
      </h2>
      <ul class="space-y-1">
        <li v-for="artist in artists" :key="artist.name" data-testid="artist-result-item">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left transition-all duration-200 hover:border-accent-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent-500"
            :aria-label="viewArtistAriaLabel(artist)"
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

    <section v-if="tags && tags.length > 0" data-testid="tag-results" class="mb-6">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {{ t('search.tagsSection') }}
      </h2>
      <ul class="space-y-1">
        <li v-for="tag in tags" :key="tag.query" data-testid="tag-result-item">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left transition-all duration-200 hover:border-accent-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent-500"
            @click="handleTagClick(tag)"
          >
            <span data-testid="tag-result-name" class="text-base font-medium text-neutral-900">
              {{ tag.displayName }}
            </span>
            <span data-testid="tag-result-count" class="text-sm text-neutral-500">
              {{ tagAlbumCountLabel(tag) }}
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
        <ListboxOptions static class="space-y-2" :aria-label="t('home.resultsListLabel')">
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
                    class="cursor-pointer hover:text-accent-600 hover:underline"
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
                <div class="mt-1">
                  <span :title="sourceTooltip(result.source)">
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
              </div>

              <span
                v-if="durationLabels[result.id]"
                data-testid="track-duration"
                class="ml-2 flex-shrink-0 text-sm text-neutral-500"
              >
                {{ durationLabels[result.id] }}
              </span>

              <!-- Add to Queue Button -->
              <button
                type="button"
                :aria-label="addToQueueAriaLabel(result)"
                data-testid="add-to-queue-button"
                class="ml-2 rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
                @click.stop="handleAddToQueue(result)"
              >
                <!-- Success checkmark — shown only after confirmed API success -->
                <svg
                  v-if="trackQueueSuccess.items.value.has(result.id)"
                  class="h-4 w-4 text-success"
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
                  class="h-4 w-4 text-error"
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

              <button
                v-if="!isTrackPlaying(result)"
                :data-testid="`play-button-${result.id}`"
                type="button"
                class="ml-4 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-out hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 active:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
                :aria-label="playAriaLabel(result)"
                :disabled="playbackStore.isLoading"
                @click.stop="handlePlay(result)"
              >
                <LoadingSpinner v-if="playbackStore.isLoading" size="sm" color="current" />
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
                <span v-if="playbackStore.isLoading">{{ t('home.playing') }}</span>
              </button>

              <!-- Pause Button (shown when this track is playing) -->
              <button
                v-else
                :data-testid="`pause-button-${result.id}`"
                type="button"
                class="ml-4 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-accent-700 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-out hover:bg-accent-800 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 active:bg-accent-900"
                :aria-label="pauseAriaLabel(result)"
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
      :aria-label="t('home.albumsSection')"
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
          v-bind="albumInteractionProps(album)"
          :class="[
            'flex items-center gap-4 justify-between rounded-lg border border-neutral-200 bg-white p-4',
            isAlbumActionable(album)
              ? 'transition-all duration-200 hover:border-accent-300 hover:shadow-md cursor-pointer'
              : 'cursor-default',
          ]"
        >
          <!-- Falls back to Tidal artist image when LMS returns its generic placeholder -->
          <div
            data-testid="album-result-cover"
            class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-neutral-200 overflow-hidden"
          >
            <!-- Tidal fallback: already resolved, show directly -->
            <img
              v-if="tidalFallbackCovers[album.id] && !coverErrors[album.id]"
              :src="tidalFallbackCovers[album.id]"
              alt=""
              loading="lazy"
              class="h-full w-full object-cover"
              @error="onAlbumCoverError(album.id)"
            />
            <!-- LMS cover: check on load whether it is a placeholder -->
            <img
              v-else-if="album.coverArtUrl && !coverErrors[album.id]"
              :src="album.coverArtUrl"
              alt=""
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
            {{ albumSourceLabel(album.source) }}
          </span>
        </div>
      </template>
    </section>

    <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      <!-- The track conditions stay: the core builders return '' for a missing track,
           but an empty first branch would still take the chain and silence the error. -->
      <span
        v-if="playbackStore.isCurrentlyPlaying && playbackStore.currentTrack"
        data-testid="playback-announcement"
      >
        {{ trackAnnouncement }}
      </span>
      <span
        v-else-if="playbackStore.isPaused && playbackStore.currentTrack"
        data-testid="playback-announcement"
      >
        {{ pausedAnnouncement }}
      </span>
      <span v-else-if="playbackStore.error" data-testid="playback-announcement">
        {{ errorAnnouncement }}
      </span>
    </div>
  </div>
</template>
