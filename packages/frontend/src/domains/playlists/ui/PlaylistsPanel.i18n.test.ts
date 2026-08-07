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
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'

const playlistsRef: Ref<readonly SavedPlaylist[]> = ref([])
const errorRef = ref(false)
const playlistDirMissingRef = ref(false)

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: playlistsRef,
    isLoading: ref(false),
    isSaving: ref(false),
    error: errorRef,
    playlistDirMissing: playlistDirMissingRef,
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
})
