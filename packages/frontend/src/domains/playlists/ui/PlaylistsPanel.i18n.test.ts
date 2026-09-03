/**
 * PlaylistsPanel — the visible button labels and the icon-only row actions are
 * translated, and they have to follow a language switch that happens while the
 * panel is already open.
 *
 * Own file because PlaylistsPanel.test.ts is already 19 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import type { TidalPlaylist, TidalPlaylistTrack } from '@/platform/api/tidalPlaylistsApi'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'

const playlistsRef: Ref<readonly SavedPlaylist[]> = ref([])
const errorRef = ref(false)
const playlistDirMissingRef = ref(false)
const playlistGoneRef = ref(false)

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: playlistsRef,
    isLoading: ref(false),
    isSaving: ref(false),
    error: errorRef,
    playlistDirMissing: playlistDirMissingRef,
    playlistGone: playlistGoneRef,
    expandedId: ref(undefined),
    tracks: ref([]),
    isTracksLoading: ref(false),
    isRemovingTrack: ref(false),
    hasMoreTracks: ref(false),
    fetchList: vi.fn(),
    save: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    toggleTracks: vi.fn(),
    loadMoreTracks: vi.fn(),
    removeTrack: vi.fn(),
  })),
}))

const tidalPlaylistsRef: Ref<readonly TidalPlaylist[]> = ref([])
const tidalIsLoadingRef = ref(false)
const tidalErrorRef = ref(false)
const tidalPlayingIdRef = ref<string | undefined>(undefined)
const tidalExpandedIdRef = ref<string | undefined>(undefined)
const tidalTracksRef: Ref<readonly TidalPlaylistTrack[]> = ref([])
const tidalTrackCountRef = ref<number | undefined>(undefined)
const tidalIsTracksLoadingRef = ref(false)
const tidalHasMoreTracksRef = ref(false)

vi.mock('../shell/useTidalPlaylists', () => ({
  useTidalPlaylists: vi.fn(() => ({
    playlists: tidalPlaylistsRef,
    isLoading: tidalIsLoadingRef,
    error: tidalErrorRef,
    playingId: tidalPlayingIdRef,
    expandedId: tidalExpandedIdRef,
    tracks: tidalTracksRef,
    trackCount: tidalTrackCountRef,
    isTracksLoading: tidalIsTracksLoadingRef,
    hasMoreTracks: tidalHasMoreTracksRef,
    fetchList: vi.fn(),
    play: vi.fn(),
    toggleTracks: vi.fn(),
    loadMoreTracks: vi.fn(),
  })),
}))

import PlaylistsPanel from './PlaylistsPanel.vue'

const labelOf = (wrapper: ReturnType<typeof mount>, testId: string): string | undefined =>
  wrapper.find(`[data-testid="${testId}"]`).attributes('aria-label')

describe('PlaylistsPanel – a language switch after mount', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    playlistsRef.value = [{ id: 'a', name: 'Sonntagsplatte' }]
    errorRef.value = false
    playlistDirMissingRef.value = false
    playlistGoneRef.value = false
    tidalPlaylistsRef.value = []
    tidalIsLoadingRef.value = false
    tidalErrorRef.value = false
    tidalPlayingIdRef.value = undefined
    tidalExpandedIdRef.value = undefined
    tidalTracksRef.value = []
    tidalTrackCountRef.value = undefined
    tidalIsTracksLoadingRef.value = false
    tidalHasMoreTracksRef.value = false
  })

  // A translator captured at mount (`const t = i18nStore.t`) is what this
  // guards: the panel keeps rendering, so nothing else would show the freeze.
  it('re-renders the save button and the empty hint in the new language', async () => {
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="playlist-save-button"]').text()).toBe('Save queue')

    useI18nStore().setLanguage('de')
    await nextTick()

    expect(wrapper.find('[data-testid="playlist-save-button"]').text()).toBe('Queue speichern')
    expect(wrapper.find('[data-testid="playlist-name-input"]').attributes('placeholder')).toBe(
      'Playlist-Name',
    )
  })

  // These labels are built in named helpers that call t() and fill {name} —
  // the part most likely to keep an old translation around.
  it('re-renders the row action labels with the playlist name in the new language', async () => {
    const wrapper = mount(PlaylistsPanel)

    expect(labelOf(wrapper, 'playlist-rename-button')).toBe('Rename playlist Sonntagsplatte')
    expect(labelOf(wrapper, 'playlist-load-button')).toBe('Load playlist Sonntagsplatte')
    expect(labelOf(wrapper, 'playlist-tracks-toggle')).toBe(
      'Show tracks of playlist Sonntagsplatte',
    )

    useI18nStore().setLanguage('de')
    await nextTick()

    expect(labelOf(wrapper, 'playlist-rename-button')).toBe('Playlist Sonntagsplatte umbenennen')
    expect(labelOf(wrapper, 'playlist-load-button')).toBe('Playlist Sonntagsplatte laden')
    expect(labelOf(wrapper, 'playlist-tracks-toggle')).toBe(
      'Titel der Playlist Sonntagsplatte anzeigen',
    )
  })

  it('re-renders the delete label in the new language while the delete is armed', async () => {
    const wrapper = mount(PlaylistsPanel)

    await wrapper.find('[data-testid="playlist-delete-button"]').trigger('click')

    expect(labelOf(wrapper, 'playlist-delete-button')).toBe(
      'Tap again to delete playlist Sonntagsplatte',
    )

    useI18nStore().setLanguage('de')
    await nextTick()

    expect(labelOf(wrapper, 'playlist-delete-button')).toBe(
      'Zum Löschen der Playlist Sonntagsplatte erneut tippen',
    )
    expect(wrapper.find('[data-testid="playlist-delete-confirm"]').text()).toBe(
      'Zum Löschen erneut tippen',
    )
  })

  // "Something went wrong" sends the user looking at a server that is running
  // fine. The folder is a setting in LMS, and the message has to say so.
  describe('the missing playlist folder', () => {
    it('explains what to set instead of reporting a generic failure', async () => {
      errorRef.value = true
      playlistDirMissingRef.value = true

      const wrapper = mount(PlaylistsPanel)

      expect(wrapper.find('[data-testid="playlists-error"]').text()).toBe(
        'Lyrion Music Server has no playlist folder configured, so it cannot save playlists. Set a playlist folder in the LMS settings.',
      )

      useI18nStore().setLanguage('de')
      await nextTick()

      expect(wrapper.find('[data-testid="playlists-error"]').text()).toBe(
        'Im Lyrion Music Server ist kein Playlist-Ordner konfiguriert, deshalb kann er keine Playlists speichern. Bitte in den LMS-Einstellungen einen Playlist-Ordner festlegen.',
      )
    })

    it('keeps the generic message for an ordinary server failure', async () => {
      errorRef.value = true

      const wrapper = mount(PlaylistsPanel)

      expect(wrapper.find('[data-testid="playlists-error"]').text()).toBe(
        'Something went wrong. Please try again.',
      )

      useI18nStore().setLanguage('de')
      await nextTick()

      expect(wrapper.find('[data-testid="playlists-error"]').text()).toBe(
        'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
      )
    })
  })

  // "Please try again" is a dead end here: the playlist is gone, so retrying
  // the same write cannot succeed.
  describe('a playlist that is gone from the server', () => {
    it('says the playlist is gone without claiming a refresh happened', async () => {
      errorRef.value = true
      playlistGoneRef.value = true

      const wrapper = mount(PlaylistsPanel)

      expect(wrapper.find('[data-testid="playlists-error"]').text()).toBe(
        'This playlist no longer exists on Lyrion Music Server. Your list was out of date.',
      )

      useI18nStore().setLanguage('de')
      await nextTick()

      expect(wrapper.find('[data-testid="playlists-error"]').text()).toBe(
        'Diese Playlist gibt es im Lyrion Music Server nicht mehr. Die Liste war nicht mehr aktuell.',
      )
    })
  })

  describe('the Tidal playlists section', () => {
    it('re-renders the heading and each state message in the new language', async () => {
      tidalIsLoadingRef.value = true
      const loadingWrapper = mount(PlaylistsPanel)
      expect(loadingWrapper.find('[data-testid="tidal-playlists-loading"]').text()).toBe(
        'Loading Tidal playlists…',
      )
      useI18nStore().setLanguage('de')
      await nextTick()
      expect(loadingWrapper.find('[data-testid="tidal-playlists-loading"]').text()).toBe(
        'Tidal-Playlists werden geladen…',
      )
      useI18nStore().setLanguage('en')

      tidalIsLoadingRef.value = false
      tidalErrorRef.value = true
      const errorWrapper = mount(PlaylistsPanel)
      expect(errorWrapper.find('[data-testid="tidal-playlists-error"]').text()).toBe(
        'Tidal playlists could not be loaded.',
      )
      useI18nStore().setLanguage('de')
      await nextTick()
      expect(errorWrapper.find('[data-testid="tidal-playlists-error"]').text()).toBe(
        'Tidal-Playlists konnten nicht geladen werden.',
      )
      useI18nStore().setLanguage('en')

      tidalErrorRef.value = false
      const emptyWrapper = mount(PlaylistsPanel)
      expect(emptyWrapper.find('[data-testid="tidal-playlists-empty"]').text()).toBe(
        'No Tidal playlists found',
      )
      useI18nStore().setLanguage('de')
      await nextTick()
      expect(emptyWrapper.find('[data-testid="tidal-playlists-empty"]').text()).toBe(
        'Keine Tidal-Playlists gefunden',
      )

      tidalPlaylistsRef.value = [{ id: '3.0', name: 'Rock Classics', coverArtUrl: '' }]
      const headingWrapper = mount(PlaylistsPanel)
      expect(headingWrapper.find('h3').text()).toBe('Bei Tidal')
      useI18nStore().setLanguage('en')
      await nextTick()
      expect(headingWrapper.find('h3').text()).toBe('On Tidal')
    })

    it('re-renders the play button label with the playlist name, and while starting', async () => {
      tidalPlaylistsRef.value = [{ id: '3.0', name: 'Rock Classics', coverArtUrl: '' }]
      const wrapper = mount(PlaylistsPanel)

      expect(wrapper.find('[data-testid="tidal-playlist-play"]').attributes('aria-label')).toBe(
        'Play Tidal playlist Rock Classics',
      )

      useI18nStore().setLanguage('de')
      await nextTick()
      expect(wrapper.find('[data-testid="tidal-playlist-play"]').attributes('aria-label')).toBe(
        'Tidal-Playlist Rock Classics abspielen',
      )

      tidalPlayingIdRef.value = '3.0'
      await nextTick()
      expect(wrapper.find('[data-testid="tidal-playlist-play"]').attributes('aria-label')).toBe(
        'Tidal-Playlist Rock Classics wird gestartet',
      )

      useI18nStore().setLanguage('en')
      await nextTick()
      expect(wrapper.find('[data-testid="tidal-playlist-play"]').attributes('aria-label')).toBe(
        'Starting Tidal playlist Rock Classics',
      )
    })

    it('re-renders the tracks toggle label before and after expanding', async () => {
      tidalPlaylistsRef.value = [{ id: '3.0', name: 'Rock Classics', coverArtUrl: '' }]
      const wrapper = mount(PlaylistsPanel)

      expect(
        wrapper.find('[data-testid="tidal-playlist-tracks-toggle"]').attributes('aria-label'),
      ).toBe('Show tracks of Tidal playlist Rock Classics')

      useI18nStore().setLanguage('de')
      await nextTick()
      expect(
        wrapper.find('[data-testid="tidal-playlist-tracks-toggle"]').attributes('aria-label'),
      ).toBe('Titel der Tidal-Playlist Rock Classics anzeigen')

      tidalExpandedIdRef.value = '3.0'
      await nextTick()
      expect(
        wrapper.find('[data-testid="tidal-playlist-tracks-toggle"]').attributes('aria-label'),
      ).toBe('Titel der Tidal-Playlist Rock Classics ausblenden')

      useI18nStore().setLanguage('en')
      await nextTick()
      expect(
        wrapper.find('[data-testid="tidal-playlist-tracks-toggle"]').attributes('aria-label'),
      ).toBe('Hide tracks of Tidal playlist Rock Classics')
    })

    it('re-renders the expanded track panel messages and the count in the new language', async () => {
      tidalPlaylistsRef.value = [{ id: '3.0', name: 'Rock Classics', coverArtUrl: '' }]
      tidalExpandedIdRef.value = '3.0'
      tidalIsTracksLoadingRef.value = true
      const loadingWrapper = mount(PlaylistsPanel)
      expect(loadingWrapper.find('[data-testid="tidal-playlist-tracks-loading"]').text()).toBe(
        'Loading tracks…',
      )
      useI18nStore().setLanguage('de')
      await nextTick()
      expect(loadingWrapper.find('[data-testid="tidal-playlist-tracks-loading"]').text()).toBe(
        'Titel werden geladen…',
      )
      useI18nStore().setLanguage('en')

      tidalIsTracksLoadingRef.value = false
      const emptyWrapper = mount(PlaylistsPanel)
      expect(emptyWrapper.find('[data-testid="tidal-playlist-tracks-empty"]').text()).toBe(
        'This playlist has no tracks',
      )
      useI18nStore().setLanguage('de')
      await nextTick()
      expect(emptyWrapper.find('[data-testid="tidal-playlist-tracks-empty"]').text()).toBe(
        'Diese Playlist enthält keine Titel',
      )
      useI18nStore().setLanguage('en')

      tidalTracksRef.value = [
        { id: 't5', position: 5, title: 'Stairway to Heaven', url: 'tidal://5', coverArtUrl: '' },
      ]
      tidalHasMoreTracksRef.value = true
      tidalTrackCountRef.value = 449
      const listWrapper = mount(PlaylistsPanel)
      expect(listWrapper.find('[data-testid="tidal-playlist-tracks-more"]').text()).toBe(
        'Show more tracks',
      )
      expect(listWrapper.find('[data-testid="tidal-playlist-count"]').text()).toBe('449 tracks')

      useI18nStore().setLanguage('de')
      await nextTick()
      expect(listWrapper.find('[data-testid="tidal-playlist-tracks-more"]').text()).toBe(
        'Weitere Titel anzeigen',
      )
      expect(listWrapper.find('[data-testid="tidal-playlist-count"]').text()).toBe('449 Titel')
    })
  })
})
