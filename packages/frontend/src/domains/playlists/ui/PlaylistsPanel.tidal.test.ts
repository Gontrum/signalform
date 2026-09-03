import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import type { TidalPlaylist, TidalPlaylistTrack } from '@/platform/api/tidalPlaylistsApi'
import { setupTestEnv } from '@/test-utils'

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: ref<readonly SavedPlaylist[]>([]),
    isLoading: ref(false),
    isSaving: ref(false),
    error: ref(false),
    playlistDirMissing: ref(false),
    playlistGone: ref(false),
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

const playMock = vi.fn<(id: string) => Promise<void>>()
const toggleTracksMock = vi.fn<(id: string) => Promise<void>>()
const loadMoreTracksMock = vi.fn<() => Promise<void>>()

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
    play: playMock,
    toggleTracks: toggleTracksMock,
    loadMoreTracks: loadMoreTracksMock,
  })),
}))

import PlaylistsPanel from './PlaylistsPanel.vue'

const twoPlaylists: readonly TidalPlaylist[] = [
  { id: '3.0', name: 'Rock Classics', coverArtUrl: 'http://192.168.178.39:9000/imageproxy/a.jpg' },
  { id: '3.1', name: 'Chill', coverArtUrl: '' },
]

const threeTracks: readonly TidalPlaylistTrack[] = [
  {
    id: '3.0.5',
    position: 5,
    title: 'Stairway to Heaven',
    url: 'tidal://36336297.flc',
    coverArtUrl: 'art5',
    duration: 482,
  },
  {
    id: '3.0.6',
    position: 6,
    title: 'Satisfaction',
    url: 'tidal://5693554.flc',
    coverArtUrl: 'art6',
  },
  {
    id: '3.0.7',
    position: 7,
    title: 'Layla',
    url: 'tidal://5816049.flc',
    coverArtUrl: 'art7',
    duration: 428,
  },
]

describe('PlaylistsPanel – Tidal playlists', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
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

  it('renders the Tidal section', () => {
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="tidal-playlists-section"]').exists()).toBe(true)
  })

  it('renders one row per Tidal playlist', () => {
    tidalPlaylistsRef.value = twoPlaylists
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.findAll('[data-testid="tidal-playlist-row"]')).toHaveLength(2)
  })

  it('renders an absolute cover image with an empty alt for a playlist that has one', () => {
    tidalPlaylistsRef.value = twoPlaylists
    const wrapper = mount(PlaylistsPanel)

    const rows = wrapper.findAll('[data-testid="tidal-playlist-row"]')
    const img = rows[0]?.find('img')
    expect(img?.exists()).toBe(true)
    expect(img?.attributes('src')).toBe('http://192.168.178.39:9000/imageproxy/a.jpg')
    expect(img?.attributes('alt')).toBe('')
  })

  it('renders a placeholder instead of an image for a playlist without a cover', () => {
    tidalPlaylistsRef.value = twoPlaylists
    const wrapper = mount(PlaylistsPanel)

    const rows = wrapper.findAll('[data-testid="tidal-playlist-row"]')
    expect(rows[1]?.find('img').exists()).toBe(false)
    expect(rows[1]?.find('[aria-hidden="true"]').exists()).toBe(true)
  })

  it('asks the composable to play the clicked playlist', async () => {
    tidalPlaylistsRef.value = twoPlaylists
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="tidal-playlist-play"]')[1]?.trigger('click')
    await flushPromises()

    expect(playMock).toHaveBeenCalledWith('3.1')
  })

  it('disables every play button while one playlist is starting', async () => {
    tidalPlaylistsRef.value = twoPlaylists
    const wrapper = mount(PlaylistsPanel)

    tidalPlayingIdRef.value = '3.0'
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('[data-testid="tidal-playlist-play"]')
    expect(buttons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('flips aria-expanded and shows the track list on toggle', async () => {
    tidalPlaylistsRef.value = twoPlaylists
    toggleTracksMock.mockImplementation(async (id: string) => {
      tidalExpandedIdRef.value = id
      tidalTracksRef.value = threeTracks
      tidalTrackCountRef.value = 449
    })
    const wrapper = mount(PlaylistsPanel)

    const toggle = wrapper.findAll('[data-testid="tidal-playlist-tracks-toggle"]')[0]
    expect(toggle?.attributes('aria-expanded')).toBe('false')

    await toggle?.trigger('click')
    await flushPromises()

    expect(toggleTracksMock).toHaveBeenCalledWith('3.0')
    const toggles = wrapper.findAll('[data-testid="tidal-playlist-tracks-toggle"]')
    expect(toggles[0]?.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="tidal-playlist-track-row"]')).toHaveLength(3)
  })

  it('shows the track count only after expanding', async () => {
    tidalPlaylistsRef.value = twoPlaylists
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="tidal-playlist-count"]').exists()).toBe(false)

    tidalExpandedIdRef.value = '3.0'
    tidalTrackCountRef.value = 449
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="tidal-playlist-row"]')
    expect(rows[0]?.find('[data-testid="tidal-playlist-count"]').text()).toBe('449 tracks')
    expect(rows[1]?.find('[data-testid="tidal-playlist-count"]').exists()).toBe(false)
  })

  it('renders no duration cell for a track without one', async () => {
    tidalPlaylistsRef.value = twoPlaylists
    tidalExpandedIdRef.value = '3.0'
    tidalTracksRef.value = threeTracks
    const wrapper = mount(PlaylistsPanel)
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="tidal-playlist-track-row"]')
    expect(rows[0]?.find('[data-testid="tidal-playlist-track-duration"]').exists()).toBe(true)
    expect(rows[1]?.find('[data-testid="tidal-playlist-track-duration"]').exists()).toBe(false)
    expect(rows[1]?.text()).not.toContain('0:00')
  })

  it('shows the error state and never the empty state at the same time', () => {
    tidalErrorRef.value = true
    tidalPlaylistsRef.value = []
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="tidal-playlists-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tidal-playlists-empty"]').exists()).toBe(false)
  })

  it('shows the empty state when there is no error and no playlists', () => {
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="tidal-playlists-empty"]').exists()).toBe(true)
  })
})
