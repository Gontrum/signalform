/**
 * AlbumDetailView — the page-header fallback shown while the album title is
 * not known yet. It happens to read the same in both languages, which is
 * exactly why it needs a key rather than a literal: only the key keeps it
 * translatable when that stops being true.
 *
 * Own file because AlbumDetailView.test.ts is already 46 KB. Mirrors
 * AlbumDetailView.tidal-not-found.test.ts's mocking approach.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AlbumDetailView from './AlbumDetailView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import { getMessage } from '@/i18n'
import type { AlbumDetailResponse } from '@/domains/album/core/types'
import type { AlbumEnrichment } from '@/domains/enrichment/core/types'
import type { Language } from '@/types/i18n'

vi.mock('@/platform/api/albumApi', () => ({
  getAlbumDetail: vi.fn(),
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbumTracks: vi.fn(),
  getTidalAlbumDetail: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playTrack: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  playAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  playTidalSearchAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  getVolume: vi.fn().mockResolvedValue({ ok: true, value: 50 }),
  getPlaybackStatus: vi.fn().mockResolvedValue({
    ok: true,
    value: { status: 'stopped', currentTime: 0, currentTrack: null },
  }),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  addAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  addTidalSearchAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}))

vi.mock('@/platform/api/enrichmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/api/enrichmentApi')>()
  return {
    ...actual,
    getAlbumEnrichment: vi.fn().mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    }),
  }
})

const mountWithoutAlbum = async (language: Language): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const { getAlbumDetail } = await import('@/platform/api/albumApi')
  vi.mocked(getAlbumDetail).mockResolvedValue({
    ok: false,
    error: { type: 'NOT_FOUND', message: 'Album not found' },
  })

  const router = await createTestRouter(
    [{ path: '/album/:albumId', component: AlbumDetailView }],
    '/album/42',
  )
  window.history.replaceState({ ...window.history.state }, '')
  const wrapper = mount(AlbumDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const headerTitle = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="page-header"] h1').text()

describe('AlbumDetailView — page header fallback title', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the translated title in English when no album loaded', async () => {
    expect(headerTitle(await mountWithoutAlbum('en'))).toBe('Album')
  })

  // The word is the same in German — what a hard-coded literal would hide is a
  // key that exists only in `en`, which renders as the raw key id here.
  it('falls back to the translated title in German when no album loaded', async () => {
    expect(headerTitle(await mountWithoutAlbum('de'))).toBe('Album')
    expect(getMessage('de', 'album.titleFallback')).not.toBe('album.titleFallback')
  })
})

const albumWithTracks: AlbumDetailResponse = {
  id: '42',
  title: 'Mezzanine',
  artist: 'Massive Attack',
  releaseYear: 1998,
  coverArtUrl: 'http://localhost:9000/music/42/cover.jpg',
  tracks: [
    {
      id: 't1',
      title: 'Angel',
      artist: 'Massive Attack',
      trackNumber: 1,
      duration: 380,
      url: 'file:///angel.flac',
    },
    {
      id: 't2',
      title: 'Teardrop',
      artist: 'Massive Attack',
      trackNumber: 2,
      duration: 330,
      url: 'file:///teardrop.flac',
    },
  ],
}

const mountWithAlbum = async (language: Language): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const { getAlbumDetail } = await import('@/platform/api/albumApi')
  vi.mocked(getAlbumDetail).mockResolvedValue({ ok: true, value: albumWithTracks })

  const router = await createTestRouter(
    [{ path: '/album/:albumId', component: AlbumDetailView }],
    '/album/42',
  )
  window.history.replaceState({ ...window.history.state }, '')
  const wrapper = mount(AlbumDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const labelsOf = (wrapper: VueWrapper, testId: string): readonly (string | undefined)[] =>
  wrapper.findAll(`[data-testid="${testId}"]`).map((button) => button.attributes('aria-label'))

describe('AlbumDetailView — translated track row labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names each track in the English play label', async () => {
    const wrapper = await mountWithAlbum('en')

    expect(labelsOf(wrapper, 'track-play-button')).toEqual(['Play Angel', 'Play Teardrop'])
  })

  it('names each track in the German play label', async () => {
    const wrapper = await mountWithAlbum('de')

    expect(labelsOf(wrapper, 'track-play-button')).toEqual([
      'Angel abspielen',
      'Teardrop abspielen',
    ])
  })

  it('names each track in the English add-to-queue label', async () => {
    const wrapper = await mountWithAlbum('en')

    expect(labelsOf(wrapper, 'track-add-to-queue-button')).toEqual([
      'Add Angel to queue',
      'Add Teardrop to queue',
    ])
  })

  it('names each track in the German add-to-queue label', async () => {
    const wrapper = await mountWithAlbum('de')

    expect(labelsOf(wrapper, 'track-add-to-queue-button')).toEqual([
      'Angel zur Warteschlange hinzufügen',
      'Teardrop zur Warteschlange hinzufügen',
    ])
  })
})

// The language arrives from the server config after the view is set up, so a
// label list built once during setup would keep the mounting language. Every
// case below therefore mounts in English and switches afterwards.
const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const mountAlbum = async (album: AlbumDetailResponse): Promise<VueWrapper> => {
  setupTestEnv()

  const { getAlbumDetail } = await import('@/platform/api/albumApi')
  vi.mocked(getAlbumDetail).mockResolvedValue({ ok: true, value: album })

  const router = await createTestRouter(
    [{ path: '/album/:albumId', component: AlbumDetailView }],
    '/album/42',
  )
  window.history.replaceState({ ...window.history.state }, '')
  const wrapper = mount(AlbumDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const trackCountOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="album-track-count"]').text()

const singleTrackAlbum: AlbumDetailResponse = {
  ...albumWithTracks,
  tracks: albumWithTracks.tracks.slice(0, 1),
}

const boxSetAlbum: AlbumDetailResponse = {
  ...albumWithTracks,
  tracks: Array.from({ length: 1234 }, (_, index) => ({
    id: `t${index}`,
    title: `Track ${index + 1}`,
    artist: 'Massive Attack',
    trackNumber: index + 1,
    duration: 200,
    url: `file:///track-${index}.flac`,
  })),
}

describe('AlbumDetailView — track count in both languages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts several tracks in the plural in both languages', async () => {
    const wrapper = await mountAlbum(albumWithTracks)
    expect(trackCountOf(wrapper)).toBe('2 tracks')

    await switchTo('de')

    expect(trackCountOf(wrapper)).toBe('2 Titel')
  })

  // The catalog has no plural rules: only picking the singular key keeps this
  // from reading "1 tracks". German says "Titel" either way, so a missing
  // choice would still look right there.
  it('counts a lone track in the singular in both languages', async () => {
    const wrapper = await mountAlbum(singleTrackAlbum)
    expect(trackCountOf(wrapper)).toBe('1 track')

    await switchTo('de')

    expect(trackCountOf(wrapper)).toBe('1 Titel')
  })

  it('groups a four-digit track count the way each language groups it', async () => {
    const wrapper = await mountAlbum(boxSetAlbum)
    expect(trackCountOf(wrapper)).toBe('1,234 tracks')

    await switchTo('de')

    expect(trackCountOf(wrapper)).toBe('1.234 Titel')
  })
})

const statsOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="enrichment-stats"]').text()

const enrichmentWith = (listeners: number, playcount: number): AlbumEnrichment => ({
  name: 'Mezzanine',
  listeners,
  playcount,
  tags: [],
  wiki: '',
})

const mountAlbumWithStats = async (listeners: number, playcount: number): Promise<VueWrapper> => {
  const { getAlbumEnrichment } = await import('@/platform/api/enrichmentApi')
  vi.mocked(getAlbumEnrichment).mockResolvedValue({
    ok: true,
    value: enrichmentWith(listeners, playcount),
  })
  const wrapper = await mountAlbum(albumWithTracks)
  await flushPromises()
  return wrapper
}

describe('AlbumDetailView — Last.fm stat line in both languages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names listeners and plays in the plural in both languages', async () => {
    const wrapper = await mountAlbumWithStats(42, 7)
    expect(statsOf(wrapper)).toBe('42 listeners · 7 plays')

    await switchTo('de')

    expect(statsOf(wrapper)).toBe('42 Hörer · 7 Wiedergaben')
  })

  // German splits here where English does too: "Wiedergabe" against
  // "Wiedergaben", while "Hörer" stays put.
  it('names a single listener and a single play in both languages', async () => {
    const wrapper = await mountAlbumWithStats(1, 1)
    expect(statsOf(wrapper)).toBe('1 listener · 1 play')

    await switchTo('de')

    expect(statsOf(wrapper)).toBe('1 Hörer · 1 Wiedergabe')
  })

  // The separator follows the interface language, not the host: a browser set
  // to en-US would otherwise put 1,234,567 into an otherwise German line.
  it('groups the digits the way each language groups them', async () => {
    const wrapper = await mountAlbumWithStats(1234567, 7654321)
    expect(statsOf(wrapper)).toBe('1,234,567 listeners · 7,654,321 plays')

    await switchTo('de')

    expect(statsOf(wrapper)).toBe('1.234.567 Hörer · 7.654.321 Wiedergaben')
  })
})
