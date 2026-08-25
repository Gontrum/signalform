/**
 * TagAlbumGrid — translated visible text: source badges, "load more", the
 * empty state and the Discogs-unreachable error text.
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TagAlbumGrid from './TagAlbumGrid.vue'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'
import type { TagAlbum } from '@/platform/api/tagsApi'
import type { TagAlbumsErrorKind } from '../core/error'

const albums: readonly TagAlbum[] = [
  {
    artist: 'Madonna',
    title: 'The Immaculate Collection',
    year: 1990,
    coverArtUrl: '/api/playback/cover?src=madonna',
    source: 'local',
    albumId: '883',
  },
  {
    artist: 'Sting',
    title: 'The Soul Cages',
    year: 1991,
    coverArtUrl: '/api/playback/cover?src=sting',
    source: 'tidal',
  },
]

type GridOverrides = {
  readonly status?: 'loading' | 'success' | 'error'
  readonly errorKind?: TagAlbumsErrorKind | null
  readonly albums?: readonly TagAlbum[]
}

const mountGrid = (language: Language, overrides: GridOverrides = {}): VueWrapper => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)
  return mount(TagAlbumGrid, {
    props: {
      status: overrides.status ?? 'success',
      errorKind: overrides.errorKind ?? null,
      albums: overrides.albums ?? albums,
      hasMore: true,
      isLoadingMore: false,
      resolvingKey: null,
    },
  })
}

describe('TagAlbumGrid — translated visible text', () => {
  it('labels the source badges in both languages', () => {
    expect(
      mountGrid('en')
        .findAll('[data-testid="tag-album-source-badge"]')
        .map((badge) => badge.text()),
    ).toEqual(['Local', 'Tidal'])
    expect(
      mountGrid('de')
        .findAll('[data-testid="tag-album-source-badge"]')
        .map((badge) => badge.text()),
    ).toEqual(['Lokal', 'Tidal'])
  })

  it('labels the card for screen readers in both languages, for either source', () => {
    expect(
      mountGrid('en')
        .findAll('[data-testid="tag-album-card"]')
        .map((card) => card.attributes('aria-label')),
    ).toEqual(['View The Immaculate Collection by Madonna', 'View The Soul Cages by Sting'])
    expect(
      mountGrid('de')
        .findAll('[data-testid="tag-album-card"]')
        .map((card) => card.attributes('aria-label')),
    ).toEqual([
      'The Immaculate Collection von Madonna anzeigen',
      'The Soul Cages von Sting anzeigen',
    ])
  })

  it('labels the load-more button in both languages', () => {
    expect(mountGrid('en').get('[data-testid="tag-albums-load-more"]').text()).toBe('Load more')
    expect(mountGrid('de').get('[data-testid="tag-albums-load-more"]').text()).toBe('Mehr laden')
  })

  it('shows the empty state text in both languages', () => {
    expect(mountGrid('en', { albums: [] }).get('[data-testid="empty-state"]').text()).toContain(
      'No albums found',
    )
    expect(mountGrid('de', { albums: [] }).get('[data-testid="empty-state"]').text()).toContain(
      'Keine Alben gefunden',
    )
  })

  it('shows the Discogs-unreachable error text in both languages', () => {
    const errorProps: GridOverrides = { status: 'error', errorKind: 'discogs', albums: [] }

    expect(mountGrid('en', errorProps).get('[data-testid="error-state"]').text()).toBe(
      'Discogs is unreachable — please try again.',
    )
    expect(mountGrid('de', errorProps).get('[data-testid="error-state"]').text()).toBe(
      'Discogs nicht erreichbar — bitte erneut versuchen.',
    )
  })
})
