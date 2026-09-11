import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { LastFmImportSource } from '@/platform/api/playlistImportApi'
import type { PlaylistImportErrorKind, PlaylistImportResultState } from '../shell/usePlaylistImport'
import { setupTestEnv } from '@/test-utils'

const isImportingRef = ref(false)
const resultRef: Ref<PlaylistImportResultState | undefined> = ref(undefined)
const errorKindRef: Ref<PlaylistImportErrorKind | undefined> = ref(undefined)
const submitTextMock = vi.fn<(text: string, name?: string) => Promise<void>>()
const submitLastFmMock =
  vi.fn<(source: LastFmImportSource, limit: number, name?: string) => Promise<void>>()

vi.mock('../shell/usePlaylistImport', () => ({
  usePlaylistImport: vi.fn(() => ({
    isImporting: isImportingRef,
    result: resultRef,
    errorKind: errorKindRef,
    submitText: submitTextMock,
    submitLastFm: submitLastFmMock,
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

const exists = (wrapper: VueWrapper, testId: string): boolean =>
  wrapper.find(`[data-testid="${testId}"]`).exists()

const isSubmitDisabled = (wrapper: VueWrapper): boolean =>
  wrapper.find('[data-testid="playlist-import-submit"]').attributes('disabled') !== undefined

const pastedTracks = (count: number): string =>
  Array.from({ length: count }, (_, index) => `Artist ${index} - Song ${index}`).join('\n')

describe('PlaylistImportSection', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isImportingRef.value = false
    resultRef.value = undefined
    errorKindRef.value = undefined
  })

  it('starts collapsed', () => {
    const wrapper = mount(PlaylistImportSection)

    expect(wrapper.find('[data-testid="playlist-import-toggle"]').attributes('aria-expanded')).toBe(
      'false',
    )
    expect(exists(wrapper, 'playlist-import-text')).toBe(false)
  })

  it('opens on toggle click', async () => {
    const wrapper = await openSection()

    expect(wrapper.find('[data-testid="playlist-import-toggle"]').attributes('aria-expanded')).toBe(
      'true',
    )
    expect(exists(wrapper, 'playlist-import-source-paste')).toBe(true)
    expect(exists(wrapper, 'playlist-import-source-lastfm')).toBe(true)
  })

  it('starts on the paste source with no Last.fm controls', async () => {
    const wrapper = await openSection()

    expect(
      wrapper.find<HTMLInputElement>('[data-testid="playlist-import-source-paste"]').element
        .checked,
    ).toBe(true)
    expect(exists(wrapper, 'playlist-import-text')).toBe(true)
    expect(exists(wrapper, 'playlist-import-lastfm-kind')).toBe(false)
    expect(exists(wrapper, 'playlist-import-lastfm-limit')).toBe(false)
  })

  it('replaces the textarea with the Last.fm controls when the Last.fm source is picked', async () => {
    const wrapper = await openSection()

    await wrapper.find('[data-testid="playlist-import-source-lastfm"]').setValue()

    expect(exists(wrapper, 'playlist-import-text')).toBe(false)
    expect(exists(wrapper, 'playlist-import-lastfm-kind')).toBe(true)
    expect(exists(wrapper, 'playlist-import-lastfm-limit')).toBe(true)
  })

  it('shows the period select only for the top-tracks kind', async () => {
    const wrapper = await openSection()
    await wrapper.find('[data-testid="playlist-import-source-lastfm"]').setValue()

    const hasPeriodFor = async (kind: LastFmImportSource['kind']): Promise<boolean> => {
      await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue(kind)
      return exists(wrapper, 'playlist-import-lastfm-period')
    }

    expect(exists(wrapper, 'playlist-import-lastfm-period')).toBe(true)
    expect(await hasPeriodFor('loved')).toBe(false)
    expect(await hasPeriodFor('tag')).toBe(false)
    expect(await hasPeriodFor('artist')).toBe(false)
    expect(await hasPeriodFor('recommended')).toBe(false)
    expect(await hasPeriodFor('top-tracks')).toBe(true)
  })

  it('shows the tag input only for the tag kind and the artist input only for the artist kind', async () => {
    const wrapper = await openSection()

    await chooseLastFm(wrapper, 'tag')
    expect(exists(wrapper, 'playlist-import-lastfm-tag')).toBe(true)
    expect(exists(wrapper, 'playlist-import-lastfm-artist')).toBe(false)

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('artist')
    expect(exists(wrapper, 'playlist-import-lastfm-tag')).toBe(false)
    expect(exists(wrapper, 'playlist-import-lastfm-artist')).toBe(true)

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('loved')
    expect(exists(wrapper, 'playlist-import-lastfm-tag')).toBe(false)
    expect(exists(wrapper, 'playlist-import-lastfm-artist')).toBe(false)
  })

  it('shows the name field only when the save option is checked', async () => {
    const wrapper = await openSection()

    expect(exists(wrapper, 'playlist-import-save-name')).toBe(false)

    await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)

    expect(exists(wrapper, 'playlist-import-save-name')).toBe(true)
  })

  describe('the submit button', () => {
    it('is disabled until the pasted text parses to at least one track', async () => {
      const wrapper = await openSection()

      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-text"]').setValue('  \n ')
      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-text"]').setValue('just some prose')
      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-text"]').setValue('Artist A - Song A')
      expect(isSubmitDisabled(wrapper)).toBe(false)
    })

    it('is disabled while the tag is blank', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'tag')

      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-lastfm-tag"]').setValue('   ')
      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-lastfm-tag"]').setValue('krautrock')
      expect(isSubmitDisabled(wrapper)).toBe(false)
    })

    it('is disabled while the artist is blank', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'artist')

      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-lastfm-artist"]').setValue('Radiohead')
      expect(isSubmitDisabled(wrapper)).toBe(false)
    })

    it('needs no extra input for a Last.fm kind that carries none', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'loved')

      expect(isSubmitDisabled(wrapper)).toBe(false)
    })

    it('is disabled while the save option is checked and the name is blank', async () => {
      const wrapper = await openSection()
      await wrapper.find('[data-testid="playlist-import-text"]').setValue('Artist A - Song A')
      await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)

      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-save-name"]').setValue('  ')
      expect(isSubmitDisabled(wrapper)).toBe(true)

      await wrapper.find('[data-testid="playlist-import-save-name"]').setValue('Road trip')
      expect(isSubmitDisabled(wrapper)).toBe(false)
    })

    it('is disabled while an import is running', async () => {
      const wrapper = await openSection()
      await wrapper.find('[data-testid="playlist-import-text"]').setValue('Artist A - Song A')

      isImportingRef.value = true
      await nextTick()

      expect(isSubmitDisabled(wrapper)).toBe(true)
    })
  })

  describe('submitting a pasted list', () => {
    it('passes the text and no name when the save option is off', async () => {
      const wrapper = await openSection()
      await wrapper
        .find('[data-testid="playlist-import-text"]')
        .setValue('Artist A - Song A\nArtist B - Song B')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitTextMock).toHaveBeenCalledWith('Artist A - Song A\nArtist B - Song B', undefined)
      expect(submitLastFmMock).not.toHaveBeenCalled()
    })

    it('passes the trimmed name when the save option is on', async () => {
      const wrapper = await openSection()
      await wrapper.find('[data-testid="playlist-import-text"]').setValue('Artist A - Song A')
      await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)
      await wrapper.find('[data-testid="playlist-import-save-name"]').setValue('  Road trip  ')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitTextMock).toHaveBeenCalledWith('Artist A - Song A', 'Road trip')
    })
  })

  describe('submitting a Last.fm source', () => {
    it('sends the top-tracks source with the chosen period and count', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'top-tracks')
      await wrapper.find('[data-testid="playlist-import-lastfm-period"]').setValue('1month')
      await wrapper.find('[data-testid="playlist-import-lastfm-limit"]').setValue('100')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitLastFmMock).toHaveBeenCalledWith(
        { kind: 'top-tracks', period: '1month' },
        100,
        undefined,
      )
      expect(submitLastFmMock.mock.calls[0]?.[0]).toEqual({ kind: 'top-tracks', period: '1month' })
    })

    it('sends the tag source with the trimmed tag and no period', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'tag')
      await wrapper.find('[data-testid="playlist-import-lastfm-tag"]').setValue('  krautrock  ')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitLastFmMock.mock.calls[0]?.[0]).toEqual({ kind: 'tag', tag: 'krautrock' })
      expect(submitLastFmMock.mock.calls[0]?.[1]).toBe(50)
    })

    it('sends the artist source with the trimmed artist and no tag', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'artist')
      await wrapper.find('[data-testid="playlist-import-lastfm-artist"]').setValue(' Radiohead ')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitLastFmMock.mock.calls[0]?.[0]).toEqual({ kind: 'artist', artist: 'Radiohead' })
    })

    it('sends a bare source for the kinds that carry no field', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'loved')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitLastFmMock.mock.calls[0]?.[0]).toEqual({ kind: 'loved' })

      await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('recommended')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitLastFmMock.mock.calls[1]?.[0]).toEqual({ kind: 'recommended' })
    })

    it('passes the trimmed name when the save option is on', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'loved')
      await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)
      await wrapper.find('[data-testid="playlist-import-save-name"]').setValue(' Loved ones ')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(submitLastFmMock).toHaveBeenCalledWith({ kind: 'loved' }, 50, 'Loved ones')
    })
  })

  describe('the wait estimate', () => {
    it('counts the tracks the text parses to, not its raw lines', async () => {
      const wrapper = await openSection()
      await wrapper
        .find('[data-testid="playlist-import-text"]')
        .setValue('Artist A - Song A\n\n   \nnot a track line\nArtist B - Song B\n\n')

      isImportingRef.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="playlist-import-estimate"]').text()).toBe(
        'Searching 2 tracks — this can take up to 5 seconds.',
      )
    })

    it('scales the seconds with the number of pasted tracks', async () => {
      const wrapper = await openSection()
      await wrapper.find('[data-testid="playlist-import-text"]').setValue(pastedTracks(40))

      isImportingRef.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="playlist-import-estimate"]').text()).toBe(
        'Searching 40 tracks — this can take up to 20 seconds.',
      )
    })

    it('uses the chosen count in Last.fm mode', async () => {
      const wrapper = await openSection()
      await chooseLastFm(wrapper, 'loved')
      await wrapper.find('[data-testid="playlist-import-lastfm-limit"]').setValue('100')

      isImportingRef.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="playlist-import-estimate"]').text()).toBe(
        'Searching 100 tracks — this can take up to 50 seconds.',
      )
    })

    it('announces itself as a status region', async () => {
      isImportingRef.value = true
      const wrapper = await openSection()

      expect(wrapper.find('[data-testid="playlist-import-estimate"]').attributes('role')).toBe(
        'status',
      )
    })
  })

  describe('the error block', () => {
    it('names the Last.fm setup as the fix when Last.fm is not configured', async () => {
      errorKindRef.value = 'lastfm-not-configured'
      const wrapper = await openSection()

      const error = wrapper.find('[data-testid="playlist-import-error"]')
      expect(error.attributes('role')).toBe('alert')
      expect(error.text()).toBe(
        'Last.fm is not set up for this user. Add a Last.fm username in Settings.',
      )
    })

    it('offers a retry when Last.fm is unreachable', async () => {
      errorKindRef.value = 'lastfm-unavailable'
      const wrapper = await openSection()

      expect(wrapper.find('[data-testid="playlist-import-error"]').text()).toBe(
        'Last.fm could not be reached. Please try again.',
      )
    })

    it('falls back to the generic failure message', async () => {
      errorKindRef.value = 'failed'
      const wrapper = await openSection()

      expect(wrapper.find('[data-testid="playlist-import-error"]').text()).toBe(
        'The import failed. Please try again.',
      )
    })
  })

  describe('the result block', () => {
    it('shows the found numbers and the playing line', async () => {
      resultRef.value = { imported: 7, missing: ['A', 'B', 'C'], total: 10, skippedLines: 0 }
      const wrapper = await openSection()

      const result = wrapper.find('[data-testid="playlist-import-result"]')
      expect(result.attributes('role')).toBe('status')
      expect(result.text()).toContain('7 of 10 tracks found')
      expect(wrapper.find('[data-testid="playlist-import-result-playing"]').text()).toBe(
        'Playing now.',
      )
    })

    it('shows the skipped-lines count', async () => {
      resultRef.value = { imported: 7, missing: [], total: 10, skippedLines: 2 }
      const wrapper = await openSection()

      expect(wrapper.find('[data-testid="playlist-import-result"]').text()).toContain(
        '2 lines could not be read',
      )
    })

    it('names the saved playlist and emits saved when a name was used', async () => {
      submitTextMock.mockImplementation(async () => {
        resultRef.value = {
          imported: 2,
          missing: [],
          total: 2,
          skippedLines: 0,
          savedAs: 'Road trip',
        }
      })
      const wrapper = await openSection()
      await wrapper.find('[data-testid="playlist-import-text"]').setValue('Artist A - Song A')
      await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)
      await wrapper.find('[data-testid="playlist-import-save-name"]').setValue('Road trip')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="playlist-import-result-saved"]').text()).toBe(
        'Saved as playlist Road trip.',
      )
      expect(wrapper.emitted('saved')).toHaveLength(1)
    })

    it('emits nothing and shows no saved line when the import was not saved', async () => {
      submitTextMock.mockImplementation(async () => {
        resultRef.value = { imported: 2, missing: [], total: 2, skippedLines: 0 }
      })
      const wrapper = await openSection()
      await wrapper.find('[data-testid="playlist-import-text"]').setValue('Artist A - Song A')
      await wrapper.find('[data-testid="playlist-import-submit"]').trigger('click')
      await flushPromises()

      expect(exists(wrapper, 'playlist-import-result-saved')).toBe(false)
      expect(wrapper.emitted('saved')).toBeUndefined()
    })

    it('blames the library, not the text, when tracks parsed but none resolved', async () => {
      resultRef.value = { imported: 0, missing: ['A'], total: 1, skippedLines: 0 }
      const wrapper = await openSection()

      const result = wrapper.find('[data-testid="playlist-import-result"]')
      expect(result.text()).toContain('None of these tracks are in your library or on Tidal.')
      expect(result.text()).not.toContain('No tracks could be read from this text.')
      expect(result.text()).not.toContain('of 1')
      expect(exists(wrapper, 'playlist-import-result-playing')).toBe(false)
    })

    it('blames the text when nothing parsed and nothing is missing', async () => {
      resultRef.value = { imported: 0, missing: [], total: 0, skippedLines: 3 }
      const wrapper = await openSection()

      const result = wrapper.find('[data-testid="playlist-import-result"]')
      expect(result.text()).toContain('No tracks could be read from this text.')
      expect(result.text()).not.toContain('None of these tracks are in your library')
      expect(exists(wrapper, 'playlist-import-result-playing')).toBe(false)
    })

    it('keeps the missing list collapsed until its toggle is clicked', async () => {
      resultRef.value = {
        imported: 82,
        missing: Array.from({ length: 18 }, (_, index) => `Missing Track ${index}`),
        total: 100,
        skippedLines: 0,
      }
      const wrapper = await openSection()

      expect(wrapper.find('[data-testid="playlist-import-missing-toggle"]').text()).toBe(
        'Show 18 tracks that were not found',
      )
      expect(exists(wrapper, 'playlist-import-missing')).toBe(false)

      await wrapper.find('[data-testid="playlist-import-missing-toggle"]').trigger('click')

      expect(wrapper.findAll('[data-testid="playlist-import-missing-row"]')).toHaveLength(18)
      expect(wrapper.find('[data-testid="playlist-import-missing-toggle"]').text()).toBe(
        'Hide the tracks that were not found',
      )
    })

    it('does not offer the missing toggle when nothing is missing', async () => {
      resultRef.value = { imported: 5, missing: [], total: 5, skippedLines: 0 }
      const wrapper = await openSection()

      expect(exists(wrapper, 'playlist-import-missing-toggle')).toBe(false)
    })
  })
})
