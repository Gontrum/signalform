/**
 * Translated visible text in search results: the source tooltip, the
 * "also available on" line, the streaming badge and the busy play button.
 *
 * Own file because SearchResultsList.test.ts is already 58 KB. Mirrors that
 * file's mocking approach.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import SearchResultsList from './SearchResultsList.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import type { Language } from '@/types/i18n'
import type { AlbumResult, ArtistResult, TrackResult } from '../core/types'
import type { TagSearchMatch } from '@/platform/api/searchApi'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { useI18nStore } from '@/app/i18nStore'

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    playTrackList: vi.fn().mockResolvedValue(ok(undefined)),
    playTidalSearchAlbum: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

const createRouter = async (): Promise<Router> =>
  createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
  ])

const localTrack: TrackResult = {
  id: 'local-1',
  title: 'Teardrop',
  artist: 'Massive Attack',
  album: 'Mezzanine',
  duration: 330,
  source: 'local',
  url: 'track://local-1',
  availableSources: [
    { source: 'local', url: 'track://local-1' },
    { source: 'qobuz', url: 'track://qobuz-1' },
    { source: 'tidal', url: 'track://tidal-1' },
  ],
}

const streamingAlbum: AlbumResult = {
  id: 'album-1',
  title: 'Mezzanine',
  artist: 'Massive Attack',
  source: 'tidal',
  trackCount: 11,
}

const sourcelessAlbum: AlbumResult = {
  id: 'album-2',
  title: 'Protection',
  artist: 'Massive Attack',
  trackCount: 10,
}

const mountResults = async (
  language: Language,
  props: {
    readonly results?: readonly TrackResult[]
    readonly albums?: readonly AlbumResult[]
    readonly artists?: readonly ArtistResult[]
    readonly tags?: readonly TagSearchMatch[]
  } = {},
): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const wrapper = mount(SearchResultsList, {
    props: {
      results: props.results ?? [],
      albums: props.albums,
      artists: props.artists,
      tags: props.tags,
    },
    global: { plugins: [await createRouter()] },
  })
  await nextTick()
  return wrapper
}

const sourceTooltipOf = (wrapper: VueWrapper, resultId: string): string | undefined =>
  wrapper.find(`[data-testid="result-item-${resultId}"]`).find('span[title]').attributes('title')

const alsoAvailableOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="also-available"]').text()

describe('SearchResultsList — translated source information', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the source tooltip in English', async () => {
    const wrapper = await mountResults('en', { results: [localTrack] })

    expect(sourceTooltipOf(wrapper, 'local-1')).toBe('Playing from Local library')
  })

  it('renders the source tooltip in German', async () => {
    const wrapper = await mountResults('de', { results: [localTrack] })

    expect(sourceTooltipOf(wrapper, 'local-1')).toBe('Wird aus der lokalen Bibliothek abgespielt')
  })

  it('lists the other sources in an English sentence', async () => {
    const wrapper = await mountResults('en', { results: [localTrack] })

    expect(alsoAvailableOf(wrapper)).toBe('Also available on: Qobuz, Tidal')
  })

  it('lists the other sources in a German sentence, not word fragments', async () => {
    const wrapper = await mountResults('de', { results: [localTrack] })

    expect(alsoAvailableOf(wrapper)).toBe('Auch verfügbar auf: Qobuz, Tidal')
  })

  it('translates the label of an alternate source LMS could not name', async () => {
    const withUnknownSource: TrackResult = {
      ...localTrack,
      availableSources: [
        { source: 'local', url: 'track://local-1' },
        { source: 'unknown', url: 'track://mystery-1' },
      ],
    }

    const english = await mountResults('en', { results: [withUnknownSource] })
    expect(alsoAvailableOf(english)).toBe('Also available on: Unknown')

    const german = await mountResults('de', { results: [withUnknownSource] })
    expect(alsoAvailableOf(german)).toBe('Auch verfügbar auf: Unbekannt')
  })

  it('leaves the also-available line out when the track has a single source', async () => {
    const wrapper = await mountResults('de', {
      results: [{ ...localTrack, availableSources: [{ source: 'local', url: 'track://local-1' }] }],
    })

    expect(wrapper.find('[data-testid="also-available"]').exists()).toBe(false)
  })
})

describe('SearchResultsList — translated streaming badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the album source in both languages', async () => {
    const english = await mountResults('en', { albums: [streamingAlbum] })
    expect(english.find('[data-testid="album-streaming-badge"]').text()).toBe('Tidal')

    const german = await mountResults('de', { albums: [streamingAlbum] })
    expect(german.find('[data-testid="album-streaming-badge"]').text()).toBe('Tidal')
  })

  it('falls back to the streaming label when the album carries no source', async () => {
    const english = await mountResults('en', { albums: [sourcelessAlbum] })
    expect(english.find('[data-testid="album-streaming-badge"]').text()).toBe('Streaming')

    const german = await mountResults('de', { albums: [sourcelessAlbum] })
    expect(german.find('[data-testid="album-streaming-badge"]').text()).toBe('Streaming')
  })
})

describe('SearchResultsList — translated busy play button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mountWhileLoading = async (language: Language): Promise<VueWrapper> => {
    const wrapper = await mountResults(language, { results: [localTrack] })
    usePlaybackStore().$patch({ isLoading: true })
    await nextTick()
    return wrapper
  }

  // The button also holds the spinner's own sr-only text, so the label is
  // matched inside the button rather than against its whole text content.
  it('labels the busy play button in English', async () => {
    const label = (await mountWhileLoading('en')).find('[data-testid="play-button-local-1"]').text()

    expect(label).toContain('Playing…')
    expect(label).not.toContain('Wird gestartet')
  })

  it('labels the busy play button in German', async () => {
    const label = (await mountWhileLoading('de')).find('[data-testid="play-button-local-1"]').text()

    expect(label).toContain('Wird gestartet…')
    expect(label).not.toContain('Playing')
  })
})

const secondTrack: TrackResult = {
  id: 'local-2',
  title: 'Angel',
  artist: 'Massive Attack',
  album: 'Mezzanine',
  duration: 380,
  source: 'local',
  url: 'track://local-2',
}

const ariaLabelsOf = (wrapper: VueWrapper, selector: string): readonly (string | undefined)[] =>
  wrapper.findAll(selector).map((element) => element.attributes('aria-label'))

describe('SearchResultsList — translated accessible names', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the results listbox and the album section in English', async () => {
    const wrapper = await mountResults('en', { results: [localTrack], albums: [streamingAlbum] })

    expect(wrapper.find('[data-testid="results-list"] > ul').attributes('aria-label')).toBe(
      'Search results',
    )
    expect(wrapper.find('[data-testid="albums-list"]').attributes('aria-label')).toBe('Albums')
  })

  it('names the results listbox and the album section in German', async () => {
    const wrapper = await mountResults('de', { results: [localTrack], albums: [streamingAlbum] })

    expect(wrapper.find('[data-testid="results-list"] > ul').attributes('aria-label')).toBe(
      'Suchergebnisse',
    )
    expect(wrapper.find('[data-testid="albums-list"]').attributes('aria-label')).toBe('Alben')
  })

  it('names each track in the English add-to-queue label', async () => {
    const wrapper = await mountResults('en', { results: [localTrack, secondTrack] })

    expect(ariaLabelsOf(wrapper, '[data-testid="add-to-queue-button"]')).toEqual([
      'Add Teardrop to queue',
      'Add Angel to queue',
    ])
  })

  it('names each track in the German add-to-queue label', async () => {
    const wrapper = await mountResults('de', { results: [localTrack, secondTrack] })

    expect(ariaLabelsOf(wrapper, '[data-testid="add-to-queue-button"]')).toEqual([
      'Teardrop zur Warteschlange hinzufügen',
      'Angel zur Warteschlange hinzufügen',
    ])
  })

  it('names each track in the English play label', async () => {
    const wrapper = await mountResults('en', { results: [localTrack, secondTrack] })

    expect(ariaLabelsOf(wrapper, 'button[data-testid^="play-button-"]')).toEqual([
      'Play Teardrop by Massive Attack',
      'Play Angel by Massive Attack',
    ])
  })

  it('names each track in the German play label', async () => {
    const wrapper = await mountResults('de', { results: [localTrack, secondTrack] })

    expect(ariaLabelsOf(wrapper, 'button[data-testid^="play-button-"]')).toEqual([
      'Teardrop von Massive Attack abspielen',
      'Angel von Massive Attack abspielen',
    ])
  })

  // The play/pause pair swaps per row, so the pause state needs its own key.
  const pauseLabel = async (language: Language): Promise<string | undefined> => {
    const wrapper = await mountResults(language, { results: [localTrack, secondTrack] })
    await flushPromises()
    usePlaybackStore().$patch({
      currentTrack: {
        id: localTrack.id,
        title: localTrack.title,
        artist: localTrack.artist,
        album: localTrack.album,
        url: localTrack.url,
        source: 'local',
      },
      isPlaying: true,
      isPaused: false,
    })
    await nextTick()

    return wrapper.find('[data-testid="pause-button-local-1"]').attributes('aria-label')
  }

  it('labels the pause button of the playing row in both languages', async () => {
    expect(await pauseLabel('en')).toBe('Pause Teardrop by Massive Attack')
    expect(await pauseLabel('de')).toBe('Teardrop von Massive Attack pausieren')
  })

  const artists: readonly ArtistResult[] = [
    { name: 'Massive Attack', artistId: 'artist-1' },
    { name: 'Portishead', artistId: 'artist-2' },
  ]

  it('names each artist in the English view-artist label', async () => {
    const wrapper = await mountResults('en', { artists })

    expect(ariaLabelsOf(wrapper, '[data-testid="artist-result-item"] button')).toEqual([
      'View artist Massive Attack',
      'View artist Portishead',
    ])
  })

  it('names each artist in the German view-artist label', async () => {
    const wrapper = await mountResults('de', { artists })

    expect(ariaLabelsOf(wrapper, '[data-testid="artist-result-item"] button')).toEqual([
      'Künstler Massive Attack anzeigen',
      'Künstler Portishead anzeigen',
    ])
  })
})

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const announcementOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="playback-announcement"]').text()

const playingTrack = {
  id: localTrack.id,
  title: localTrack.title,
  artist: localTrack.artist,
  album: localTrack.album,
  url: localTrack.url,
  source: 'local',
}

// The aria-live region of this view spoke its own English sentence while the
// Now Playing panel spoke the translated one, so a screen reader heard a
// different language per view. Each case switches the language after mounting,
// the order the app runs in: the language arrives with the server config, long
// after this list has been set up.
describe('SearchResultsList — the spoken playback announcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mountWith = async (state: Readonly<Record<string, unknown>>): Promise<VueWrapper> => {
    const wrapper = await mountResults('en', { results: [localTrack] })
    await flushPromises()
    usePlaybackStore().$patch(state)
    await nextTick()
    return wrapper
  }

  it('announces the running track in both languages', async () => {
    const wrapper = await mountWith({
      currentTrack: playingTrack,
      isPlaying: true,
      isPaused: false,
    })
    expect(announcementOf(wrapper)).toBe('Now playing: Teardrop by Massive Attack')

    await switchTo('de')

    expect(announcementOf(wrapper)).toBe('Läuft jetzt: Teardrop von Massive Attack')
  })

  it('announces a paused track in both languages', async () => {
    const wrapper = await mountWith({
      currentTrack: playingTrack,
      isPlaying: false,
      isPaused: true,
    })
    expect(announcementOf(wrapper)).toBe('Paused: Teardrop')

    await switchTo('de')

    expect(announcementOf(wrapper)).toBe('Pausiert: Teardrop')
  })

  // The message itself still comes out of the store in English — the prefix is
  // all this view owns.
  it('prefixes a playback error in both languages', async () => {
    const wrapper = await mountWith({
      currentTrack: null,
      isPlaying: false,
      isPaused: false,
      error: 'Could not start playback',
    })
    expect(announcementOf(wrapper)).toBe('Error: Could not start playback')

    await switchTo('de')

    expect(announcementOf(wrapper)).toBe('Fehler: Could not start playback')
  })

  it('says nothing while playback is stopped', async () => {
    const wrapper = await mountResults('de', { results: [localTrack] })
    await flushPromises()

    expect(wrapper.find('[data-testid="playback-announcement"]').exists()).toBe(false)
  })

  // A playing state without a track must not take the first branch: an empty
  // announcement there would render nothing and swallow the error below it.
  it('announces the error when playback claims to run without a track', async () => {
    const wrapper = await mountWith({
      currentTrack: null,
      isPlaying: true,
      isPaused: false,
      error: 'Could not start playback',
    })

    expect(announcementOf(wrapper)).toBe('Error: Could not start playback')
  })
})

const tags: readonly TagSearchMatch[] = [
  { query: 'qsound', displayName: 'QSound', albumCount: 1 },
  { query: 'hi-res-audio', displayName: 'Hi-Res Audio', albumCount: 3 },
]

describe('SearchResultsList — translated Tags section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the Tags section heading in both languages', async () => {
    const english = await mountResults('en', { tags })
    expect(english.find('[data-testid="tag-results"] h2').text()).toBe('Tags')

    const german = await mountResults('de', { tags })
    expect(german.find('[data-testid="tag-results"] h2').text()).toBe('Tags')
  })

  it('shows the singular album count in English and German', async () => {
    const english = await mountResults('en', { tags })
    expect(english.findAll('[data-testid="tag-result-count"]')[0]?.text()).toBe('1 album')

    const german = await mountResults('de', { tags })
    expect(german.findAll('[data-testid="tag-result-count"]')[0]?.text()).toBe('1 Album')
  })

  it('shows the plural album count in English and German', async () => {
    const english = await mountResults('en', { tags })
    expect(english.findAll('[data-testid="tag-result-count"]')[1]?.text()).toBe('3 albums')

    const german = await mountResults('de', { tags })
    expect(german.findAll('[data-testid="tag-result-count"]')[1]?.text()).toBe('3 Alben')
  })
})
