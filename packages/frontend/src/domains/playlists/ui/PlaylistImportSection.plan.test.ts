/**
 * The section reads its numbers from core/import-form. These cases cover the
 * wiring and what the user ends up seeing — the arithmetic itself is unit
 * tested in core/import-form.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { setupTestEnv } from '@/test-utils'

const isImportingRef = ref(false)

vi.mock('../shell/usePlaylistImport', () => ({
  usePlaylistImport: vi.fn(() => ({
    isImporting: isImportingRef,
    result: ref(undefined),
    errorKind: ref(undefined),
    submitText: vi.fn(),
    submitLastFm: vi.fn(),
  })),
}))

import PlaylistImportSection from './PlaylistImportSection.vue'

const openSection = async (): Promise<VueWrapper> => {
  const wrapper = mount(PlaylistImportSection)
  await wrapper.find('[data-testid="playlist-import-toggle"]').trigger('click')
  return wrapper
}

const pastedTracks = (count: number): string =>
  Array.from({ length: count }, (_, index) => `Artist ${index} - Song ${index}`).join('\n')

const paste = async (wrapper: VueWrapper, text: string): Promise<void> => {
  await wrapper.find('[data-testid="playlist-import-text"]').setValue(text)
}

const exists = (wrapper: VueWrapper, testId: string): boolean =>
  wrapper.find(`[data-testid="${testId}"]`).exists()

describe('PlaylistImportSection – the import plan', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isImportingRef.value = false
  })

  it('binds both source radios into one radio group', async () => {
    const wrapper = await openSection()

    const names = ['playlist-import-source-paste', 'playlist-import-source-lastfm'].map((testId) =>
      wrapper.find(`[data-testid="${testId}"]`).attributes('name'),
    )

    expect(names[0]).toBe('playlist-import-source')
    expect(names[1]).toBe(names[0])
  })

  it('says nothing about truncation for a paste under the limit', async () => {
    const wrapper = await openSection()
    await paste(wrapper, pastedTracks(100))

    expect(exists(wrapper, 'playlist-import-truncated')).toBe(false)
  })

  it('warns before submitting that a paste over the limit will be cut', async () => {
    const wrapper = await openSection()
    await paste(wrapper, pastedTracks(101))

    expect(wrapper.find('[data-testid="playlist-import-truncated"]').text()).toBe(
      'Only the first 100 tracks will be imported.',
    )
  })

  it('never shows the truncation note in Last.fm mode', async () => {
    const wrapper = await openSection()
    await paste(wrapper, pastedTracks(300))
    await wrapper.find('[data-testid="playlist-import-source-lastfm"]').setValue()

    expect(exists(wrapper, 'playlist-import-truncated')).toBe(false)
  })

  it('estimates the capped count, not the pasted count, for an oversized paste', async () => {
    const wrapper = await openSection()
    await paste(wrapper, pastedTracks(300))

    isImportingRef.value = true
    await nextTick()

    expect(wrapper.find('[data-testid="playlist-import-estimate"]').text()).toBe(
      'Searching 100 tracks — this can take up to 50 seconds.',
    )
  })

  it('estimates the track count of an M3U body, not its line count', async () => {
    const wrapper = await openSection()
    await paste(
      wrapper,
      [
        '#EXTM3U',
        '#EXTINF:249,Radiohead - Creep',
        '/music/creep.flac',
        '#EXTINF:213,Pixies - Debaser',
        '/music/debaser.flac',
      ].join('\n'),
    )

    isImportingRef.value = true
    await nextTick()

    expect(wrapper.find('[data-testid="playlist-import-estimate"]').text()).toBe(
      'Searching 2 tracks — this can take up to 5 seconds.',
    )
  })
})
