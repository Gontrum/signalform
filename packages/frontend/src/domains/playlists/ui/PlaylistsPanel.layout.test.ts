import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import { setupTestEnv } from '@/test-utils'

const playlistsRef: Ref<readonly SavedPlaylist[]> = ref([])

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: playlistsRef,
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

import PlaylistsPanel from './PlaylistsPanel.vue'

// Long enough that four labelled text buttons next to it would leave nothing
// of it on a 390px phone — that was the bug this file guards.
const longName = 'Sonntagsplatte fuer die lange Fahrt'

const twoPlaylists: readonly SavedPlaylist[] = [
  { id: 'a', name: longName },
  { id: 'b', name: 'Evening' },
]

const rowActionTestIds = [
  'playlist-tracks-toggle',
  'playlist-rename-button',
  'playlist-load-button',
  'playlist-delete-button',
] as const

describe('PlaylistsPanel – row layout', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    playlistsRef.value = twoPlaylists
  })

  it('renders the playlist name as the only text in its row', () => {
    const wrapper = mount(PlaylistsPanel)

    const rows = wrapper.findAll('[data-testid="playlist-row"]')
    expect(rows[0]?.find('[data-testid="playlist-name"]').text()).toBe(longName)
    // Equality, not toContain: any visible button label would show up here and
    // would be competing with the name for the width of the row.
    expect(rows[0]?.text()).toBe(longName)
    expect(rows[1]?.text()).toBe('Evening')
  })

  it('gives the name the flexible column and the actions the fixed one', () => {
    const wrapper = mount(PlaylistsPanel)

    const nameClasses = wrapper.find('[data-testid="playlist-name"]').classes()
    expect(nameClasses).toContain('flex-1')
    expect(nameClasses).toContain('min-w-0')
    expect(nameClasses).toContain('truncate')
    // shrink-0 on the name would push the actions out of the container
    // instead; the name is the part that may shorten, never disappear.
    expect(nameClasses).not.toContain('shrink-0')
  })

  it('labels every row action without rendering visible text', () => {
    const wrapper = mount(PlaylistsPanel)

    const firstRow = wrapper.findAll('[data-testid="playlist-row"]')[0]
    const actions = rowActionTestIds.map((testId) => firstRow?.find(`[data-testid="${testId}"]`))

    expect(actions.map((button) => button?.exists())).toEqual([true, true, true, true])
    expect(actions.map((button) => button?.text())).toEqual(['', '', '', ''])
    expect(actions.every((button) => Boolean(button?.attributes('aria-label')))).toBe(true)
    // 44px touch target — the icon buttons carry no padding of their own.
    expect(
      actions.every(
        (button) =>
          button?.classes().includes('min-h-11') === true && button.classes().includes('min-w-11'),
      ),
    ).toBe(true)
  })

  it('names the playlist in every row action label', () => {
    const wrapper = mount(PlaylistsPanel)

    const rows = wrapper.findAll('[data-testid="playlist-row"]')
    const labelsOf = (rowIndex: number): readonly (string | undefined)[] =>
      rowActionTestIds.map((testId) =>
        rows[rowIndex]?.find(`[data-testid="${testId}"]`).attributes('aria-label'),
      )

    // Exact strings, not just "contains the name": a label reading only "Load"
    // is what a screen reader hears four times over in a list of playlists.
    expect(labelsOf(0)).toEqual([
      `Show tracks of playlist ${longName}`,
      `Rename playlist ${longName}`,
      `Load playlist ${longName}`,
      `Delete playlist ${longName}`,
    ])
    expect(labelsOf(1)).toEqual([
      'Show tracks of playlist Evening',
      'Rename playlist Evening',
      'Load playlist Evening',
      'Delete playlist Evening',
    ])
  })

  it('keeps the rename editor to input plus two icon buttons', async () => {
    const wrapper = mount(PlaylistsPanel)

    await wrapper.findAll('[data-testid="playlist-rename-button"]')[0]?.trigger('click')
    await flushPromises()

    const editingRow = wrapper.findAll('[data-testid="playlist-row"]')[0]
    const input = editingRow?.find('[data-testid="playlist-rename-input"]')
    expect(input?.classes()).toContain('flex-1')
    expect(input?.classes()).toContain('min-w-0')

    const editorButtons = ['playlist-rename-confirm', 'playlist-rename-cancel'].map((testId) =>
      editingRow?.find(`[data-testid="${testId}"]`),
    )
    expect(editorButtons.map((button) => button?.text())).toEqual(['', ''])
    expect(editorButtons.every((button) => Boolean(button?.attributes('aria-label')))).toBe(true)
    expect(editorButtons.every((button) => button?.classes().includes('min-w-11') === true)).toBe(
      true,
    )
    // The editor replaces the four actions rather than joining them.
    expect(editingRow?.find('[data-testid="playlist-load-button"]').exists()).toBe(false)
  })
})
