/**
 * TagAlbumsView — translated visible text: page title, source badge,
 * "load more", empty state and the Discogs-unreachable error text.
 *
 * Mirrors AlbumDetailView.i18n.test.ts's mocking approach.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { ok, err } from '@signalform/shared'
import TagAlbumsView from './TagAlbumsView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Language } from '@/types/i18n'
import type { TagAlbumsPage, TagsApiError } from '@/platform/api/tagsApi'

const { mockGetTagAlbumsPage, mockResolveAlbum } = vi.hoisted(() => ({
  mockGetTagAlbumsPage: vi.fn(),
  mockResolveAlbum: vi.fn(),
}))

vi.mock('@/platform/api/tagsApi', () => ({
  getTagAlbumsPage: mockGetTagAlbumsPage,
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  resolveAlbum: mockResolveAlbum,
}))

const createRouter = async (): Promise<Router> =>
  createTestRouter(
    [
      { path: '/tags', name: 'tag-albums', component: TagAlbumsView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    '/tags?q=qsound',
  )

const mountView = async (language: Language): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)
  const wrapper = mount(TagAlbumsView, { global: { plugins: [await createRouter()] } })
  await flushPromises()
  return wrapper
}

const onePage: TagAlbumsPage = {
  albums: [
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
  ],
  hasMore: true,
  totalCandidates: 75,
}

const discogsError: TagsApiError = {
  type: 'SERVER_ERROR',
  status: 503,
  message: 'Discogs unreachable',
  code: 'DISCOGS_UNREACHABLE',
}

describe('TagAlbumsView — translated visible text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveAlbum.mockResolvedValue(ok({ albumId: null }))
  })

  it('shows the page title in both languages', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(onePage))

    expect((await mountView('en')).find('[data-testid="page-header"] h1').text()).toBe(
      'Tag: qsound',
    )
    expect((await mountView('de')).find('[data-testid="page-header"] h1').text()).toBe(
      'Tag: qsound',
    )
  })

  it('labels the source badges in both languages', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(onePage))

    const english = await mountView('en')
    expect(
      english.findAll('[data-testid="tag-album-source-badge"]').map((badge) => badge.text()),
    ).toEqual(['Local', 'Tidal'])

    const german = await mountView('de')
    expect(
      german.findAll('[data-testid="tag-album-source-badge"]').map((badge) => badge.text()),
    ).toEqual(['Lokal', 'Tidal'])
  })

  it('labels the card for screen readers in both languages, for either source', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(onePage))

    const english = await mountView('en')
    expect(
      english
        .findAll('[data-testid="tag-album-card"]')
        .map((card) => card.attributes('aria-label')),
    ).toEqual(['View The Immaculate Collection by Madonna', 'View The Soul Cages by Sting'])

    const german = await mountView('de')
    expect(
      german.findAll('[data-testid="tag-album-card"]').map((card) => card.attributes('aria-label')),
    ).toEqual([
      'The Immaculate Collection von Madonna anzeigen',
      'The Soul Cages von Sting anzeigen',
    ])
  })

  it('labels the load-more button in both languages', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok(onePage))

    expect((await mountView('en')).find('[data-testid="tag-albums-load-more"]').text()).toBe(
      'Load more',
    )
    expect((await mountView('de')).find('[data-testid="tag-albums-load-more"]').text()).toBe(
      'Mehr laden',
    )
  })

  it('shows the empty state text in both languages', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(ok({ albums: [], hasMore: false, totalCandidates: 0 }))

    const english = await mountView('en')
    expect(english.find('[data-testid="empty-state"]').text()).toContain('No albums found')

    const german = await mountView('de')
    expect(german.find('[data-testid="empty-state"]').text()).toContain('Keine Alben gefunden')
  })

  it('shows the Discogs-unreachable error text in both languages', async () => {
    mockGetTagAlbumsPage.mockResolvedValue(err(discogsError))

    expect((await mountView('en')).find('[data-testid="error-state"]').text()).toBe(
      'Discogs is unreachable — please try again.',
    )
    expect((await mountView('de')).find('[data-testid="error-state"]').text()).toBe(
      'Discogs nicht erreichbar — bitte erneut versuchen.',
    )
  })
})
