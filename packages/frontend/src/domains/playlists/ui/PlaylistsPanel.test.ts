import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import { setupTestEnv } from '@/test-utils'

const saveMock = vi.fn<(name: string) => Promise<void>>()
const loadMock = vi.fn<(id: string) => Promise<void>>()
const removeMock = vi.fn<(id: string) => Promise<void>>()
const playlistsRef: Ref<readonly SavedPlaylist[]> = ref([])
const isSavingRef = ref(false)
const errorRef = ref(false)

vi.mock('../shell/usePlaylists', () => ({
  usePlaylists: vi.fn(() => ({
    playlists: playlistsRef,
    isLoading: ref(false),
    isSaving: isSavingRef,
    error: errorRef,
    fetchList: vi.fn(),
    save: saveMock,
    load: loadMock,
    remove: removeMock,
  })),
}))

import PlaylistsPanel from './PlaylistsPanel.vue'

describe('PlaylistsPanel', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    playlistsRef.value = []
    isSavingRef.value = false
    errorRef.value = false
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

  describe('delete with double-tap confirmation', () => {
    const twoPlaylists: readonly SavedPlaylist[] = [
      { id: 'a', name: 'One' },
      { id: 'b', name: 'Two' },
    ]

    it('renders a delete button per playlist with the normal label', () => {
      playlistsRef.value = twoPlaylists
      const wrapper = mount(PlaylistsPanel)

      const deleteButtons = wrapper.findAll('[data-testid="playlist-delete-button"]')
      expect(deleteButtons).toHaveLength(2)
      expect(deleteButtons[0]?.text()).toBe('Delete')
    })

    it('names the playlist in the accessible label of each delete button', () => {
      playlistsRef.value = twoPlaylists
      const wrapper = mount(PlaylistsPanel)

      const deleteButtons = wrapper.findAll('[data-testid="playlist-delete-button"]')
      // The visible text is identical on every row, so the accessible name is
      // the only thing telling a screen-reader user which playlist is meant.
      expect(deleteButtons[0]?.attributes('aria-label')).toBe('Delete playlist One')
      expect(deleteButtons[1]?.attributes('aria-label')).toBe('Delete playlist Two')
    })

    it('arms the row on the first click without calling the API', async () => {
      playlistsRef.value = twoPlaylists
      const wrapper = mount(PlaylistsPanel)

      const deleteButtons = wrapper.findAll('[data-testid="playlist-delete-button"]')
      await deleteButtons[0]?.trigger('click')
      await flushPromises()

      expect(removeMock).not.toHaveBeenCalled()
      const armed = wrapper.findAll('[data-testid="playlist-delete-button"]')
      expect(armed[0]?.text()).toBe('Tap again to delete')
      expect(armed[0]?.attributes('aria-label')).toBe('Tap again to delete playlist One')
      expect(armed[1]?.text()).toBe('Delete')
      expect(armed[1]?.attributes('aria-label')).toBe('Delete playlist Two')
    })

    it('deletes on the second click of the same row', async () => {
      playlistsRef.value = twoPlaylists
      const wrapper = mount(PlaylistsPanel)

      const deleteButton = wrapper.findAll('[data-testid="playlist-delete-button"]')[1]
      await deleteButton?.trigger('click')
      await deleteButton?.trigger('click')
      await flushPromises()

      expect(removeMock).toHaveBeenCalledTimes(1)
      expect(removeMock).toHaveBeenCalledWith('b')
    })

    it('does not delete row A when row B is clicked after arming A', async () => {
      playlistsRef.value = twoPlaylists
      const wrapper = mount(PlaylistsPanel)

      const buttons = wrapper.findAll('[data-testid="playlist-delete-button"]')
      await buttons[0]?.trigger('click')
      await buttons[1]?.trigger('click')
      await flushPromises()

      expect(removeMock).not.toHaveBeenCalled()
      const afterSwitch = wrapper.findAll('[data-testid="playlist-delete-button"]')
      expect(afterSwitch[0]?.text()).toBe('Delete')
      expect(afterSwitch[1]?.text()).toBe('Tap again to delete')

      // The second tap on B must delete B — never the previously armed A.
      await afterSwitch[1]?.trigger('click')
      await flushPromises()
      expect(removeMock).toHaveBeenCalledTimes(1)
      expect(removeMock).toHaveBeenCalledWith('b')
    })

    it('disarms the row after 3 seconds so the next click only re-arms', async () => {
      vi.useFakeTimers()
      try {
        playlistsRef.value = twoPlaylists
        const wrapper = mount(PlaylistsPanel)

        await wrapper.findAll('[data-testid="playlist-delete-button"]')[0]?.trigger('click')
        expect(wrapper.findAll('[data-testid="playlist-delete-button"]')[0]?.text()).toBe(
          'Tap again to delete',
        )

        vi.advanceTimersByTime(3000)
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll('[data-testid="playlist-delete-button"]')[0]?.text()).toBe('Delete')

        await wrapper.findAll('[data-testid="playlist-delete-button"]')[0]?.trigger('click')
        expect(removeMock).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('cancels the pending disarm timer on unmount', async () => {
      vi.useFakeTimers()
      try {
        playlistsRef.value = twoPlaylists
        const wrapper = mount(PlaylistsPanel)

        await wrapper.findAll('[data-testid="playlist-delete-button"]')[0]?.trigger('click')
        expect(vi.getTimerCount()).toBe(1)

        wrapper.unmount()

        // Without the onUnmounted cleanup the timer survives the component and
        // its callback still touches the (now dead) state 3s later.
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(3000)
        expect(vi.getTimerCount()).toBe(0)
        expect(removeMock).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('shows an inline error message when the delete fails', async () => {
      playlistsRef.value = twoPlaylists
      removeMock.mockImplementation(async () => {
        errorRef.value = true
      })
      const wrapper = mount(PlaylistsPanel)
      expect(wrapper.find('[data-testid="playlists-error"]').exists()).toBe(false)

      const deleteButton = wrapper.findAll('[data-testid="playlist-delete-button"]')[0]
      await deleteButton?.trigger('click')
      await deleteButton?.trigger('click')
      await flushPromises()

      const message = wrapper.find('[data-testid="playlists-error"]')
      expect(message.exists()).toBe(true)
      expect(message.text()).toBe('Something went wrong. Please try again.')
    })
  })
})
