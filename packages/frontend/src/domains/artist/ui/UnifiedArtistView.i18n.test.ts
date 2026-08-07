/**
 * UnifiedArtistView — the icon-only "add to queue" button on a top track
 * carries a translated accessible name that names the track.
 *
 * Own file because UnifiedArtistView.test.ts is already 40 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import UnifiedArtistView from './UnifiedArtistView.vue'
import type { ArtistByNameResponse } from '@/platform/api/artistApi'
import { getArtistHeroImage } from '@/platform/api/heroImageApi'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import { clearArtistImageCache } from '@/domains/enrichment/shell/useArtistImage'
import type { ArtistEnrichment } from '@/domains/enrichment/core/types'
import type { Language } from '@/types/i18n'

vi.mock('@/platform/api/artistApi', () => ({
  getArtistDetail: vi.fn(),
  getArtistByName: vi.fn(),
  getArtistTopTracks: vi.fn(),
  getArtistTopAlbums: vi.fn(),
  startArtistRadio: vi.fn(),
}))

vi.mock('@/platform/api/genreRadioApi', () => ({
  startGenreRadio: vi.fn(),
  searchTags: vi.fn(),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addToQueue: vi.fn(),
  addTrackListToQueue: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', async () => {
  const { mockPlaybackApiModule } = await import('@/test-utils')
  return mockPlaybackApiModule()
})

vi.mock('@/platform/api/enrichmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/api/enrichmentApi')>()
  return {
    ...actual,
    getArtistEnrichment: vi.fn(),
    getSimilarArtists: vi.fn(),
  }
})

vi.mock('@/platform/api/heroImageApi', () => ({
  getArtistHeroImage: vi.fn(),
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  resolveAlbum: vi.fn(),
}))

import { getArtistByName, getArtistTopAlbums, getArtistTopTracks } from '@/platform/api/artistApi'
import { getArtistEnrichment, getSimilarArtists } from '@/platform/api/enrichmentApi'
import { resolveAlbum } from '@/platform/api/tidalAlbumsApi'

const artistResponse: ArtistByNameResponse = {
  localAlbums: [
    {
      id: '42',
      albumId: '42',
      title: 'OK Computer',
      artist: 'Radiohead',
      source: 'local',
      coverArtUrl: 'http://localhost:9000/music/42/cover.jpg',
    },
  ],
  tidalAlbums: [],
}

const topTracks = {
  artist: 'Radiohead',
  tracks: [
    {
      id: '1',
      title: 'Paranoid Android',
      artist: 'Radiohead',
      album: 'OK Computer',
      url: 'file:///paranoid-android.flac',
      source: 'local' as const,
      playcount: 1000,
      listeners: 500,
      rank: 1,
    },
    {
      id: '2',
      title: 'Karma Police',
      artist: 'Radiohead',
      album: 'OK Computer',
      url: 'file:///karma-police.flac',
      source: 'local' as const,
      playcount: 900,
      listeners: 400,
      rank: 2,
    },
  ],
}

const mountView = async (language: Language): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const router = await createTestRouter(
    [
      { path: '/artist/unified', name: 'unified-artist', component: UnifiedArtistView },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    '/artist/unified?name=Radiohead',
  )
  const wrapper = mount(UnifiedArtistView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const labelsOf = (wrapper: VueWrapper, testId: string): readonly (string | undefined)[] =>
  wrapper.findAll(`[data-testid="${testId}"]`).map((button) => button.attributes('aria-label'))

const addLabels = (wrapper: VueWrapper): readonly (string | undefined)[] =>
  labelsOf(wrapper, 'top-track-add-to-queue-button')

const playLabels = (wrapper: VueWrapper): readonly (string | undefined)[] =>
  labelsOf(wrapper, 'top-track-play-button')

describe('UnifiedArtistView – top track add-to-queue label', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearArtistImageCache()

    vi.mocked(getArtistByName).mockResolvedValue({ ok: true, value: artistResponse })
    vi.mocked(getArtistTopTracks).mockResolvedValue({ ok: true, value: topTracks })
    vi.mocked(getArtistTopAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No top albums' },
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
    vi.mocked(resolveAlbum).mockResolvedValue({ ok: true, value: { albumId: null } })
  })

  it('names each track in the English label', async () => {
    const wrapper = await mountView('en')

    expect(addLabels(wrapper)).toEqual([
      'Add Paranoid Android to queue',
      'Add Karma Police to queue',
    ])
  })

  it('names each track in the German label', async () => {
    const wrapper = await mountView('de')

    // A hard-coded literal here would keep saying "Add … to queue" in German.
    expect(addLabels(wrapper)).toEqual([
      'Paranoid Android zur Warteschlange hinzufügen',
      'Karma Police zur Warteschlange hinzufügen',
    ])
  })

  it('names each track in the English play label', async () => {
    const wrapper = await mountView('en')

    expect(playLabels(wrapper)).toEqual(['Play Paranoid Android', 'Play Karma Police'])
  })

  // The old label appended the title to a bare "Abspielen", which read
  // "Abspielen Paranoid Android" in German.
  it('puts the track title before the verb in the German play label', async () => {
    const wrapper = await mountView('de')

    expect(playLabels(wrapper)).toEqual(['Paranoid Android abspielen', 'Karma Police abspielen'])
  })
})

const tidalAlbum = {
  id: 'tidal-1',
  title: 'In Rainbows',
  artist: 'Radiohead',
  source: 'tidal' as const,
  coverArtUrl: 'https://resources.tidal.com/images/in-rainbows.jpg',
  trackUrls: ['tidal://1.flc'],
}

describe('UnifiedArtistView – Tidal section heading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearArtistImageCache()

    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: { ...artistResponse, tidalAlbums: [tidalAlbum] },
    })
    vi.mocked(getArtistTopTracks).mockResolvedValue({ ok: true, value: topTracks })
    vi.mocked(getArtistTopAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No top albums' },
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
    vi.mocked(resolveAlbum).mockResolvedValue({ ok: true, value: { albumId: null } })
  })

  const headingOf = (wrapper: VueWrapper): string =>
    wrapper.find('[data-testid="tidal-section"] h2').text()

  it('heads the section in English', async () => {
    expect(headingOf(await mountView('en'))).toBe('On Tidal')
  })

  // "Tidal" is the product name and survives; only the preposition is translated.
  it('heads the section in German while keeping the product name', async () => {
    expect(headingOf(await mountView('de'))).toBe('Bei Tidal')
  })
})

// The language arrives from the server config after the view is set up, so
// these cases mount in English and switch afterwards.
const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const statsOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="enrichment-stats"]').text()

const enrichmentWith = (listeners: number, playcount: number): ArtistEnrichment => ({
  name: 'Radiohead',
  listeners,
  playcount,
  tags: [],
  bio: '',
})

describe('UnifiedArtistView — Last.fm stat line in both languages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearArtistImageCache()

    vi.mocked(getArtistByName).mockResolvedValue({ ok: true, value: artistResponse })
    vi.mocked(getArtistTopTracks).mockResolvedValue({ ok: true, value: topTracks })
    vi.mocked(getArtistTopAlbums).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No top albums' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
    vi.mocked(resolveAlbum).mockResolvedValue({ ok: true, value: { albumId: null } })
  })

  const mountWithStats = async (listeners: number, playcount: number): Promise<VueWrapper> => {
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: enrichmentWith(listeners, playcount),
    })
    const wrapper = await mountView('en')
    await flushPromises()
    return wrapper
  }

  it('names listeners and plays in the plural in both languages', async () => {
    const wrapper = await mountWithStats(42, 7)
    expect(statsOf(wrapper)).toBe('42 listeners · 7 plays')

    await switchTo('de')

    expect(statsOf(wrapper)).toBe('42 Hörer · 7 Wiedergaben')
  })

  // The catalog has no plural rules, so the count picks the key: English needs
  // "1 listener", German needs "1 Wiedergabe" against "7 Wiedergaben".
  it('names a single listener and a single play in both languages', async () => {
    const wrapper = await mountWithStats(1, 1)
    expect(statsOf(wrapper)).toBe('1 listener · 1 play')

    await switchTo('de')

    expect(statsOf(wrapper)).toBe('1 Hörer · 1 Wiedergabe')
  })

  // A well-known artist is where the digits become readable at all, and where a
  // host-formatted number shows up as 1,234,567 in an otherwise German line.
  it('groups the digits the way each language groups them', async () => {
    const wrapper = await mountWithStats(1234567, 7654321)
    expect(statsOf(wrapper)).toBe('1,234,567 listeners · 7,654,321 plays')

    await switchTo('de')

    expect(statsOf(wrapper)).toBe('1.234.567 Hörer · 7.654.321 Wiedergaben')
  })
})
