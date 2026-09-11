/**
 * The section is a form stacked into a 375px-wide panel: every control has to
 * span the full width with a 44px touch target, and no result line may widen
 * the panel. Moved here from PlaylistsPanel.layout.test.ts with the markup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { LastFmImportSource } from '@/platform/api/playlistImportApi'
import type { PlaylistImportResultState } from '../shell/usePlaylistImport'
import { setupTestEnv } from '@/test-utils'

const resultRef: Ref<PlaylistImportResultState | undefined> = ref(undefined)

vi.mock('../shell/usePlaylistImport', () => ({
  usePlaylistImport: vi.fn(() => ({
    isImporting: ref(false),
    result: resultRef,
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

const chooseLastFm = async (
  wrapper: VueWrapper,
  kind: LastFmImportSource['kind'],
): Promise<void> => {
  await wrapper.find('[data-testid="playlist-import-source-lastfm"]').setValue()
  await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue(kind)
}

const classesOf = (wrapper: VueWrapper, testId: string): readonly string[] =>
  wrapper.find(`[data-testid="${testId}"]`).classes()

describe('PlaylistImportSection – layout', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    resultRef.value = undefined
  })

  it('gives the section toggle a 44px touch target', () => {
    const wrapper = mount(PlaylistImportSection)

    expect(classesOf(wrapper, 'playlist-import-toggle')).toContain('min-h-11')
  })

  it('gives each source option a 44px touch target and a truncating label', async () => {
    const wrapper = await openSection()

    const labels = ['playlist-import-source-paste', 'playlist-import-source-lastfm'].map((id) =>
      wrapper.find(`label[for="${id}"]`),
    )

    expect(labels.map((label) => label.classes().includes('min-h-11'))).toEqual([true, true])
    expect(labels.map((label) => label.find('span').classes().includes('truncate'))).toEqual([
      true,
      true,
    ])
  })

  it('gives the textarea the full width and vertical-only resize', async () => {
    const wrapper = await openSection()

    const textareaClasses = classesOf(wrapper, 'playlist-import-text')
    expect(textareaClasses).toContain('w-full')
    expect(textareaClasses).toContain('resize-y')
    expect(textareaClasses).not.toContain('resize')
  })

  it('gives every Last.fm control the full width and a 44px touch target', async () => {
    const wrapper = await openSection()
    await chooseLastFm(wrapper, 'top-tracks')

    const isFullWidthTarget = (testId: string): boolean =>
      ['min-h-11', 'w-full'].every((className) => classesOf(wrapper, testId).includes(className))

    expect(
      [
        'playlist-import-lastfm-kind',
        'playlist-import-lastfm-period',
        'playlist-import-lastfm-limit',
      ].map(isFullWidthTarget),
    ).toEqual([true, true, true])

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('tag')
    expect(classesOf(wrapper, 'playlist-import-lastfm-tag')).toEqual(
      expect.arrayContaining(['min-h-11', 'w-full']),
    )

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('artist')
    expect(classesOf(wrapper, 'playlist-import-lastfm-artist')).toEqual(
      expect.arrayContaining(['min-h-11', 'w-full']),
    )
  })

  it('gives the save name input the full width and a 44px touch target', async () => {
    const wrapper = await openSection()
    await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)

    expect(classesOf(wrapper, 'playlist-import-save-name')).toEqual(
      expect.arrayContaining(['min-h-11', 'w-full']),
    )
  })

  it('gives the save toggle label a 44px touch target without pushing the row wider', async () => {
    const wrapper = await openSection()

    const label = wrapper.find('label[for="playlist-import-save-toggle"]')
    expect(label.classes()).toEqual(expect.arrayContaining(['min-h-11', 'min-w-0']))
    expect(classesOf(wrapper, 'playlist-import-save-toggle')).toContain('shrink-0')
  })

  // iOS Safari zooms the page when a focused field is under 16px and the
  // viewport meta deliberately leaves zoom enabled. A <select> is opened, never
  // typed into, so it keeps the denser text-sm.
  it('gives every typed-into field a 16px font and leaves the selects at text-sm', async () => {
    const wrapper = await openSection()

    expect(classesOf(wrapper, 'playlist-import-text')).toContain('text-base')

    await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)
    expect(classesOf(wrapper, 'playlist-import-save-name')).toContain('text-base')

    await chooseLastFm(wrapper, 'tag')
    expect(classesOf(wrapper, 'playlist-import-lastfm-tag')).toContain('text-base')
    expect(classesOf(wrapper, 'playlist-import-lastfm-kind')).toContain('text-sm')

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('artist')
    expect(classesOf(wrapper, 'playlist-import-lastfm-artist')).toContain('text-base')

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('top-tracks')
    expect(classesOf(wrapper, 'playlist-import-lastfm-period')).toContain('text-sm')
    expect(classesOf(wrapper, 'playlist-import-lastfm-limit')).toContain('text-sm')
  })

  it('gives the submit button the full width and a 44px touch target', async () => {
    const wrapper = await openSection()

    expect(classesOf(wrapper, 'playlist-import-submit')).toEqual(
      expect.arrayContaining(['min-h-11', 'w-full']),
    )
  })

  it('truncates a long saved playlist name instead of widening the panel', async () => {
    resultRef.value = {
      imported: 2,
      missing: [],
      total: 2,
      skippedLines: 0,
      savedAs: 'Sonntagsplatte fuer die ganz lange Autofahrt Vol. 2',
    }
    const wrapper = await openSection()

    expect(classesOf(wrapper, 'playlist-import-result-saved')).toEqual(
      expect.arrayContaining(['min-w-0', 'truncate']),
    )
  })

  it('truncates a long missing-track entry instead of widening the row', async () => {
    const longMissing = 'Emerson, Lake & Palmer – Karn Evil 9: 1st Impression, Pt. 2'
    resultRef.value = { imported: 1, missing: [longMissing], total: 2, skippedLines: 0 }
    const wrapper = await openSection()
    await wrapper.find('[data-testid="playlist-import-missing-toggle"]').trigger('click')

    expect(classesOf(wrapper, 'playlist-import-missing-row')).toContain('truncate')
  })
})
