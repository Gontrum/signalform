<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/ui/PageHeader.vue'
import LoadingSpinner from '@/ui/LoadingSpinner.vue'
import EmptyState from '@/ui/EmptyState.vue'
import { useI18nStore } from '@/app/i18nStore'
import type { MessageKey } from '@/i18n'
import type { TagAlbum } from '@/platform/api/tagsApi'
import { useTagAlbums, type TagAlbumsErrorKind } from '../shell/useTagAlbums'

const i18nStore = useI18nStore()
const t = (key: MessageKey): string => i18nStore.t(key)

const {
  query,
  status,
  errorKind,
  albums,
  hasMore,
  isLoadingMore,
  resolvingKey,
  loadMore,
  handleAlbumClick,
} = useTagAlbums()

const title = computed(() => t('tags.title').replace('{query}', query.value))

const ERROR_KEYS: Record<TagAlbumsErrorKind, MessageKey> = {
  discogs: 'tags.errorDiscogs',
  other: 'tags.errorGeneric',
}

const errorMessage = computed(() =>
  errorKind.value === null ? '' : t(ERROR_KEYS[errorKind.value]),
)

// TagAlbum carries no id of its own (it is a Discogs candidate, not a library
// row) — artist+title is unique within one page, and the index guards the
// unlikely case of Discogs sending the same release twice.
const albumKey = (album: TagAlbum, index: number): string =>
  `${album.artist}::${album.title}::${index}`

const sourceBadge = (album: TagAlbum): string =>
  album.source === 'local' ? t('tags.badgeLocal') : t('tags.badgeTidal')

const navigateAriaLabel = (album: TagAlbum): string =>
  t('library.viewAlbum').replace('{title}', album.title).replace('{name}', album.artist)
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-white" data-testid="tag-albums-view">
    <PageHeader :title="title" :show-back="true" />

    <div class="px-4 py-4 sm:px-6">
      <div
        v-if="status === 'loading'"
        data-testid="loading-state"
        class="flex justify-center py-20"
      >
        <LoadingSpinner size="lg" color="accent-400" />
      </div>

      <div
        v-else-if="status === 'error'"
        data-testid="error-state"
        class="py-20 text-center text-neutral-500"
      >
        <p class="text-lg">{{ errorMessage }}</p>
      </div>

      <div v-else-if="albums.length === 0" data-testid="empty-state" class="py-20">
        <EmptyState :title="t('tags.emptyTitle')" :subtitle="t('tags.emptyDescription')">
          <template #icon>
            <svg
              class="h-12 w-12 md:h-14 md:w-14 lg:h-20 lg:w-20 text-neutral-400"
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

      <div v-else>
        <ul data-testid="tag-albums-grid" class="grid grid-cols-2 gap-6 lg:grid-cols-3 lg:gap-8">
          <li
            v-for="(album, index) in albums"
            :key="albumKey(album, index)"
            data-testid="tag-album-item"
          >
            <button
              type="button"
              data-testid="tag-album-card"
              :aria-label="navigateAriaLabel(album)"
              :aria-busy="resolvingKey === albumKey(album, index)"
              :disabled="resolvingKey === albumKey(album, index)"
              class="block w-full rounded-lg text-left cursor-pointer hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-wait"
              @click="handleAlbumClick(album, albumKey(album, index))"
            >
              <div
                data-testid="tag-album-cover"
                class="relative mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-100"
              >
                <img
                  :src="album.coverArtUrl"
                  alt=""
                  loading="lazy"
                  class="h-full w-full object-cover"
                  :class="resolvingKey === albumKey(album, index) ? 'opacity-50' : ''"
                />
                <span
                  v-if="resolvingKey === albumKey(album, index)"
                  data-testid="tag-album-resolving"
                  class="absolute inset-0 flex items-center justify-center"
                >
                  <LoadingSpinner size="sm" color="accent-400" :announce="false" />
                </span>
              </div>

              <p
                data-testid="tag-album-title"
                class="truncate text-sm font-medium text-neutral-900"
              >
                {{ album.title }}
              </p>
              <p data-testid="tag-album-artist" class="truncate text-sm text-neutral-600">
                {{ album.artist }}
              </p>
              <p v-if="album.year" data-testid="tag-album-year" class="text-xs text-neutral-500">
                {{ album.year }}
              </p>
            </button>

            <div class="mt-1 flex min-h-5 flex-wrap gap-1">
              <span
                data-testid="tag-album-source-badge"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="
                  album.source === 'local'
                    ? 'bg-accent-50 text-accent-700'
                    : 'bg-neutral-100 text-neutral-500'
                "
              >
                {{ sourceBadge(album) }}
              </span>
            </div>
          </li>
        </ul>

        <div v-if="hasMore" class="mt-6 flex justify-center">
          <button
            type="button"
            data-testid="tag-albums-load-more"
            :disabled="isLoadingMore"
            class="min-h-11 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            @click="loadMore"
          >
            {{ isLoadingMore ? t('home.loading') : t('tags.loadMore') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
