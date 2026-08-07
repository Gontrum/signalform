import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { PlaylistTrack, SavedPlaylist } from '@/platform/api/playlistsApi'
import { setupTestEnv } from '@/test-utils'

const toggleTracksMock = vi.fn<(id: string) => Promise<void>>()
const loadMoreTracksMock = vi.fn<() => Promise<void>>()
const removeTrackMock = vi.fn<(index: number) => Promise<void>>()

const playlistsRef: Ref<readonly SavedPlaylist[]> = ref([])
const errorRef = ref(false)
const expandedIdRef = ref<string | undefined>(undefined)
const tracksRef: Ref<readonly PlaylistTrack[]> = ref([])
const isTracksLoadingRef = ref(false)
const isRemovingTrackRef = ref(false)
const hasMoreTracksRef = ref(false)

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: playlistsRef,
    isLoading: ref(false),
    isSaving: ref(false),
    error: errorRef,
    playlistDirMissing: ref(false),
    playlistGone: ref(false),
    expandedId: expandedIdRef,
    tracks: tracksRef,
    isTracksLoading: isTracksLoadingRef,
    isRemovingTrack: isRemovingTrackRef,
    hasMoreTracks: hasMoreTracksRef,
    fetchList: vi.fn(),
    save: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    toggleTracks: toggleTracksMock,
    loadMoreTracks: loadMoreTracksMock,
    removeTrack: removeTrackMock,
  })),
}))

import PlaylistsPanel from './PlaylistsPanel.vue'

const twoPlaylists: readonly SavedPlaylist[] = [
  { id: 'a', name: 'Morning' },
  { id: 'b', name: 'Evening' },
]

// Deliberately not alphabetical, and the positions start at 5: array position
// and playlist index must not coincide, or sending the array position passes.
const threeTracks: readonly PlaylistTrack[] = [
  { index: 5, title: 'Zoo Station', artist: 'U2', album: 'Achtung Baby', duration: 276 },
  { index: 6, title: 'Anthem', artist: 'Leonard Cohen', album: 'The Future' },
  { index: 7, title: 'Bad', artist: 'U2', album: 'The Unforgettable Fire', duration: 366 },
]

describe('PlaylistsPanel – track list', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    playlistsRef.value = twoPlaylists
    errorRef.value = false
    expandedIdRef.value = undefined
    tracksRef.value = []
    isTracksLoadingRef.value = false
    isRemovingTrackRef.value = false
    hasMoreTracksRef.value = false
  })

  // Stands in for the composable: the click opens whichever row was clicked
  // and the server page arrives with it.
  const expandWith = (expandedTracks: readonly PlaylistTrack[]): void => {
    toggleTracksMock.mockImplementation(async (id: string) => {
      expandedIdRef.value = id
      tracksRef.value = expandedTracks
    })
  }

  it('renders a collapsed tracks toggle per playlist', () => {
    const wrapper = mount(PlaylistsPanel)

    const toggles = wrapper.findAll('[data-testid="playlist-tracks-toggle"]')
    expect(toggles).toHaveLength(2)
    expect(toggles[0]?.attributes('aria-expanded')).toBe('false')
    expect(toggles[0]?.attributes('aria-label')).toBe('Show tracks of playlist Morning')
    expect(toggles[1]?.attributes('aria-label')).toBe('Show tracks of playlist Evening')
    expect(wrapper.find('[data-testid="playlist-tracks"]').exists()).toBe(false)
  })

  it('asks the composable to expand the clicked playlist', async () => {
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[1]?.trigger('click')
    await flushPromises()

    expect(toggleTracksMock).toHaveBeenCalledWith('b')
  })

  it('shows the tracks of the expanded playlist in server order', async () => {
    expandWith(threeTracks)
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
    await flushPromises()

    const titles = wrapper
      .findAll('[data-testid="playlist-track-title"]')
      .map((node) => node.text())
    // Alphabetical would be Anthem, Bad, Zoo Station — the server order wins.
    expect(titles).toEqual(['Zoo Station', 'Anthem', 'Bad'])
    const artists = wrapper
      .findAll('[data-testid="playlist-track-artist"]')
      .map((node) => node.text())
    expect(artists).toEqual(['U2', 'Leonard Cohen', 'U2'])
  })

  it('renders the panel only under the expanded row', async () => {
    expandWith(threeTracks)
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[1]?.trigger('click')
    await flushPromises()

    const panels = wrapper.findAll('[data-testid="playlist-tracks"]')
    expect(panels).toHaveLength(1)
    const rows = wrapper.findAll('[data-testid="playlist-row"]')
    expect(rows[0]?.find('[data-testid="playlist-tracks"]').exists()).toBe(false)
    expect(rows[1]?.find('[data-testid="playlist-tracks"]').exists()).toBe(true)
  })

  it('marks the expanded toggle and points it at the panel', async () => {
    expandWith(threeTracks)
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
    await flushPromises()

    const toggles = wrapper.findAll('[data-testid="playlist-tracks-toggle"]')
    expect(toggles[0]?.attributes('aria-expanded')).toBe('true')
    expect(toggles[0]?.attributes('aria-label')).toBe('Hide tracks of playlist Morning')
    expect(toggles[1]?.attributes('aria-expanded')).toBe('false')
    expect(toggles[0]?.attributes('aria-controls')).toBe(
      wrapper.find('[data-testid="playlist-tracks"]').attributes('id'),
    )
  })

  it('shows the duration only for tracks that have one', async () => {
    expandWith(threeTracks)
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="playlist-track-row"]')
    expect(rows[0]?.find('[data-testid="playlist-track-duration"]').text()).toBe('4:36')
    // A missing duration must not surface as 0:00.
    expect(rows[1]?.find('[data-testid="playlist-track-duration"]').exists()).toBe(false)
    expect(rows[1]?.text()).not.toContain('0:00')
    expect(rows[2]?.find('[data-testid="playlist-track-duration"]').text()).toBe('6:06')
  })

  it('shows a message instead of a blank panel for an empty playlist', async () => {
    expandWith([])
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="playlist-tracks-empty"]').text()).toBe(
      'This playlist has no tracks',
    )
    expect(wrapper.findAll('[data-testid="playlist-track-row"]')).toHaveLength(0)
  })

  it('shows a loading message while the first page is on its way', async () => {
    toggleTracksMock.mockImplementation(async (id: string) => {
      expandedIdRef.value = id
      isTracksLoadingRef.value = true
    })
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="playlist-tracks-loading"]').exists()).toBe(true)
    // The empty-playlist message would be a lie while the page is loading.
    expect(wrapper.find('[data-testid="playlist-tracks-empty"]').exists()).toBe(false)
  })

  describe('removing a track', () => {
    it('sends the playlist index of the clicked track, not its array position', async () => {
      expandWith(threeTracks)
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      await wrapper.findAll('[data-testid="playlist-track-remove"]')[1]?.trigger('click')
      await flushPromises()

      expect(removeTrackMock).toHaveBeenCalledWith(6)
    })

    it('sends index 0 for a track that sits first in the playlist', async () => {
      expandWith([
        { index: 0, title: 'Teardrop', artist: 'Massive Attack', album: 'Mezzanine' },
        { index: 1, title: 'Angel', artist: 'Massive Attack', album: 'Mezzanine' },
      ])
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      await wrapper.findAll('[data-testid="playlist-track-remove"]')[0]?.trigger('click')
      await flushPromises()

      expect(removeTrackMock).toHaveBeenCalledWith(0)
    })

    it('names track and playlist in the accessible label of each remove button', async () => {
      expandWith(threeTracks)
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[1]?.trigger('click')
      await flushPromises()

      const buttons = wrapper.findAll('[data-testid="playlist-track-remove"]')
      expect(buttons[0]?.attributes('aria-label')).toBe('Remove Zoo Station from playlist Evening')
      expect(buttons[2]?.attributes('aria-label')).toBe('Remove Bad from playlist Evening')
    })

    it('disables every remove button while one removal is in flight', async () => {
      expandWith(threeTracks)
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      isRemovingTrackRef.value = true
      await wrapper.vm.$nextTick()

      const buttons = wrapper.findAll('[data-testid="playlist-track-remove"]')
      expect(buttons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    })

    it('moves focus to the track that took over the index', async () => {
      expandWith(threeTracks)
      removeTrackMock.mockImplementation(async () => {
        tracksRef.value = [
          { index: 5, title: 'Zoo Station', artist: 'U2', album: 'Achtung Baby', duration: 276 },
          { index: 6, title: 'Bad', artist: 'U2', album: 'The Unforgettable Fire', duration: 366 },
        ]
      })
      const wrapper = mount(PlaylistsPanel, { attachTo: document.body })
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      await wrapper.findAll('[data-testid="playlist-track-remove"]')[1]?.trigger('click')
      await flushPromises()

      // The clicked button is gone after the reload — without this a keyboard
      // user lands on <body>.
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Remove Bad from playlist Morning',
      )

      wrapper.unmount()
    })

    it('falls back to the tracks toggle when the last track was removed', async () => {
      expandWith([{ index: 0, title: 'Teardrop', artist: 'Massive Attack', album: 'Mezzanine' }])
      removeTrackMock.mockImplementation(async () => {
        tracksRef.value = []
      })
      const wrapper = mount(PlaylistsPanel, { attachTo: document.body })
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      await wrapper.find('[data-testid="playlist-track-remove"]').trigger('click')
      await flushPromises()

      expect(document.activeElement?.getAttribute('data-testid')).toBe('playlist-tracks-toggle')
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Hide tracks of playlist Morning',
      )

      wrapper.unmount()
    })

    it('shows the failure in the existing error element', async () => {
      expandWith(threeTracks)
      removeTrackMock.mockImplementation(async () => {
        errorRef.value = true
      })
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="playlists-error"]').exists()).toBe(false)

      await wrapper.findAll('[data-testid="playlist-track-remove"]')[0]?.trigger('click')
      await flushPromises()

      const messages = wrapper.findAll('[data-testid="playlists-error"]')
      expect(messages).toHaveLength(1)
      expect(messages[0]?.text()).toBe('Something went wrong. Please try again.')
    })
  })

  describe('paging', () => {
    it('offers no load-more button when the server sent the whole playlist', async () => {
      expandWith(threeTracks)
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="playlist-tracks-more"]').exists()).toBe(false)
    })

    it('asks for the next page when more tracks exist', async () => {
      expandWith(threeTracks)
      hasMoreTracksRef.value = true
      const wrapper = mount(PlaylistsPanel)
      await wrapper.findAll('[data-testid="playlist-tracks-toggle"]')[0]?.trigger('click')
      await flushPromises()

      await wrapper.find('[data-testid="playlist-tracks-more"]').trigger('click')
      await flushPromises()

      expect(loadMoreTracksMock).toHaveBeenCalledTimes(1)
    })
  })
})
