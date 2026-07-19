import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import { setupTestEnv } from '@/test-utils'

const saveMock = vi.fn<(name: string) => Promise<void>>()
const loadMock = vi.fn<(id: string) => Promise<void>>()
const playlistsRef: Ref<readonly SavedPlaylist[]> = ref([])
const isSavingRef = ref(false)

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: playlistsRef,
    isLoading: ref(false),
    isSaving: isSavingRef,
    error: ref(false),
    fetchList: vi.fn(),
    save: saveMock,
    load: loadMock,
  })),
}))

import PlaylistsPanel from './PlaylistsPanel.vue'

describe('PlaylistsPanel', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    playlistsRef.value = []
    isSavingRef.value = false
  })

  it('renders the panel, name input and save button', () => {
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="playlists-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="playlist-name-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="playlist-save-button"]').exists()).toBe(true)
  })

  it('disables the save button when the name is empty', async () => {
    const wrapper = mount(PlaylistsPanel)

    const button = wrapper.find('[data-testid="playlist-save-button"]')
    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="playlist-name-input"]').setValue('My mix')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('calls save with the entered name and clears the input on click', async () => {
    const wrapper = mount(PlaylistsPanel)

    const input = wrapper.find('[data-testid="playlist-name-input"]')
    await input.setValue('My mix')
    await wrapper.find('[data-testid="playlist-save-button"]').trigger('click')
    await flushPromises()

    expect(saveMock).toHaveBeenCalledWith('My mix')
    expect(input.element).toBeInstanceOf(HTMLInputElement)
    if (!(input.element instanceof HTMLInputElement)) {
      return
    }
    expect(input.element.value).toBe('')
  })

  it('shows the empty state when there are no playlists', () => {
    const wrapper = mount(PlaylistsPanel)

    expect(wrapper.find('[data-testid="playlists-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="playlist-load-button"]')).toHaveLength(0)
  })

  it('renders a load button per playlist and calls load(id) on click', async () => {
    playlistsRef.value = [
      { id: 'a', name: 'One' },
      { id: 'b', name: 'Two' },
    ]
    const wrapper = mount(PlaylistsPanel)

    const loadButtons = wrapper.findAll('[data-testid="playlist-load-button"]')
    expect(loadButtons).toHaveLength(2)

    await loadButtons[1]?.trigger('click')
    expect(loadMock).toHaveBeenCalledWith('b')
  })
})
