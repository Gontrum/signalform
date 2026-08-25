/**
 * TagAlbumGrid — the presentational half of the tag filter: it renders what
 * `useTagAlbums` hands it and emits back. The composable's own behaviour lives
 * in ../shell/useTagAlbums.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TagAlbumGrid from './TagAlbumGrid.vue'
import { setupTestEnv } from '@/test-utils'
import type { TagAlbum } from '@/platform/api/tagsApi'
import type { TagAlbumsErrorKind } from '../core/error'

const localAlbum: TagAlbum = {
  artist: 'Madonna',
  title: 'The Immaculate Collection',
  year: 1990,
  coverArtUrl: '/api/playback/cover?src=madonna',
  source: 'local',
  albumId: '883',
}

const tidalAlbum: TagAlbum = {
  artist: 'Sting',
  title: 'The Soul Cages',
  year: 1991,
  coverArtUrl: '/api/playback/cover?src=sting',
  source: 'tidal',
}

type GridProps = {
  readonly status: 'loading' | 'success' | 'error'
  readonly errorKind: TagAlbumsErrorKind | null
  readonly albums: readonly TagAlbum[]
  readonly hasMore: boolean
  readonly isLoadingMore: boolean
  readonly resolvingKey: string | null
}

const defaultProps: GridProps = {
  status: 'success',
  errorKind: null,
  albums: [localAlbum, tidalAlbum],
  hasMore: false,
  isLoadingMore: false,
  resolvingKey: null,
}

const mountGrid = (overrides: Partial<GridProps> = {}): VueWrapper =>
  mount(TagAlbumGrid, { props: { ...defaultProps, ...overrides } })

describe('TagAlbumGrid', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  it('renders the concrete album values', () => {
    const wrapper = mountGrid()

    expect(wrapper.findAll('[data-testid="tag-album-title"]').map((el) => el.text())).toEqual([
      'The Immaculate Collection',
      'The Soul Cages',
    ])
    expect(wrapper.findAll('[data-testid="tag-album-artist"]').map((el) => el.text())).toEqual([
      'Madonna',
      'Sting',
    ])
    expect(wrapper.findAll('[data-testid="tag-album-year"]').map((el) => el.text())).toEqual([
      '1990',
      '1991',
    ])
  })

  it('renders a cover image for every album, from both sources', () => {
    const wrapper = mountGrid()

    expect(
      wrapper.findAll('[data-testid="tag-album-cover"] img').map((img) => img.attributes('src')),
    ).toEqual(['/api/playback/cover?src=madonna', '/api/playback/cover?src=sting'])
  })

  it('makes every card a button, whatever its source', () => {
    const cards = mountGrid().findAll('[data-testid="tag-album-card"]')

    expect(cards.map((card) => card.element.tagName)).toEqual(['BUTTON', 'BUTTON'])
  })

  it('labels the source badge per source and keeps it non-interactive', () => {
    const badges = mountGrid().findAll('[data-testid="tag-album-source-badge"]')

    expect(badges.map((badge) => badge.text())).toEqual(['Local', 'Tidal'])
    expect(badges.map((badge) => badge.element.tagName)).toEqual(['SPAN', 'SPAN'])
  })

  it('gives both sources the same navigation aria-label shape', () => {
    const cards = mountGrid().findAll('[data-testid="tag-album-card"]')

    expect(cards.map((card) => card.attributes('aria-label'))).toEqual([
      'View The Immaculate Collection by Madonna',
      'View The Soul Cages by Sting',
    ])
  })

  it('emits album-click with the clicked album and its key', async () => {
    const wrapper = mountGrid()

    await wrapper.findAll('[data-testid="tag-album-card"]')[1]?.trigger('click')

    expect(wrapper.emitted('album-click')).toEqual([[tidalAlbum, 'Sting::The Soul Cages::1']])
  })

  it('marks the resolving card as busy and disables it', () => {
    const wrapper = mountGrid({ resolvingKey: 'Sting::The Soul Cages::1' })

    const cards = wrapper.findAll('[data-testid="tag-album-card"]')
    expect(cards.map((card) => card.attributes('aria-busy'))).toEqual(['false', 'true'])
    expect(cards[0]?.attributes('disabled')).toBeUndefined()
    expect(cards[1]?.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[data-testid="tag-album-resolving"]')).toHaveLength(1)
  })

  it('shows the load-more button only while more candidates remain', async () => {
    expect(mountGrid().find('[data-testid="tag-albums-load-more"]').exists()).toBe(false)

    const wrapper = mountGrid({ hasMore: true })
    const button = wrapper.get('[data-testid="tag-albums-load-more"]')
    await button.trigger('click')

    expect(wrapper.emitted('load-more')).toHaveLength(1)
  })

  it('disables the load-more button while the next page is in flight', () => {
    const wrapper = mountGrid({ hasMore: true, isLoadingMore: true })

    const button = wrapper.get('[data-testid="tag-albums-load-more"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toBe('Loading…')
  })

  it('shows the loading state instead of the grid', () => {
    const wrapper = mountGrid({ status: 'loading', albums: [] })

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })

  it('shows the Discogs error message instead of the grid', () => {
    const wrapper = mountGrid({ status: 'error', errorKind: 'discogs', albums: [] })

    expect(wrapper.find('[data-testid="error-state"]').text()).toBe(
      'Discogs is unreachable — please try again.',
    )
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })

  it('shows the generic error message for any other failure', () => {
    const wrapper = mountGrid({ status: 'error', errorKind: 'other', albums: [] })

    expect(wrapper.find('[data-testid="error-state"]').text()).toBe(
      'This could not be loaded — please try again.',
    )
  })

  it('shows the empty state when the page carries no album', () => {
    const wrapper = mountGrid({ albums: [] })

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })
})
