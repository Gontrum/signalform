/**
 * PlaylistImportSection — every label of the source switch, the Last.fm form
 * and the result block has to follow a language switch that happens while the
 * section is already open.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { LastFmImportSource } from '@/platform/api/playlistImportApi'
import type { PlaylistImportErrorKind, PlaylistImportResultState } from '../shell/usePlaylistImport'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'

const isImportingRef = ref(false)
const resultRef: Ref<PlaylistImportResultState | undefined> = ref(undefined)
const errorKindRef: Ref<PlaylistImportErrorKind | undefined> = ref(undefined)

vi.mock('../shell/usePlaylistImport', () => ({
  usePlaylistImport: vi.fn(() => ({
    isImporting: isImportingRef,
    result: resultRef,
    errorKind: errorKindRef,
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

const switchToGerman = async (): Promise<void> => {
  useI18nStore().setLanguage('de')
  await nextTick()
}

const textOf = (wrapper: VueWrapper, testId: string): string =>
  wrapper.find(`[data-testid="${testId}"]`).text()

const labelFor = (wrapper: VueWrapper, id: string): string =>
  wrapper.find(`label[for="${id}"]`).text()

const placeholderOf = (wrapper: VueWrapper, testId: string): string | undefined =>
  wrapper.find(`[data-testid="${testId}"]`).attributes('placeholder')

const optionsOf = (wrapper: VueWrapper, testId: string): readonly string[] =>
  wrapper.findAll(`[data-testid="${testId}"] option`).map((option) => option.text())

describe('PlaylistImportSection – a language switch after mount', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isImportingRef.value = false
    resultRef.value = undefined
    errorKindRef.value = undefined
  })

  it('re-renders the heading, the source switch, the hint and the submit label', async () => {
    const wrapper = await openSection()

    expect(wrapper.find('[data-testid="playlist-import-toggle"] span').text()).toBe(
      'Build a playlist',
    )
    expect(wrapper.find('legend').text()).toBe('Where the tracks come from')
    expect(labelFor(wrapper, 'playlist-import-source-paste')).toBe('Paste a list')
    expect(labelFor(wrapper, 'playlist-import-source-lastfm')).toBe('From Last.fm')
    expect(wrapper.find('#playlist-import-body p').text()).toBe(
      'One track per line — "Artist - Title". CSV exports work too: Exportify for Spotify, TuneMyMusic for Apple or YouTube Music.',
    )
    expect(textOf(wrapper, 'playlist-import-submit')).toBe('Find & play')

    await switchToGerman()

    expect(wrapper.find('[data-testid="playlist-import-toggle"] span').text()).toBe(
      'Playlist zusammenstellen',
    )
    expect(wrapper.find('legend').text()).toBe('Woher die Titel kommen')
    expect(labelFor(wrapper, 'playlist-import-source-paste')).toBe('Liste einfügen')
    expect(labelFor(wrapper, 'playlist-import-source-lastfm')).toBe('Von Last.fm')
    expect(wrapper.find('#playlist-import-body p').text()).toBe(
      'Ein Titel pro Zeile — "Interpret - Titel". CSV-Exporte funktionieren auch: Exportify für Spotify, TuneMyMusic für Apple oder YouTube Music.',
    )
    expect(textOf(wrapper, 'playlist-import-submit')).toBe('Suchen & abspielen')
  })

  it('re-renders the Last.fm source select with all five kinds', async () => {
    const wrapper = await openSection()
    await wrapper.find('[data-testid="playlist-import-source-lastfm"]').setValue()

    expect(labelFor(wrapper, 'playlist-import-lastfm-kind')).toBe('Source')
    expect(optionsOf(wrapper, 'playlist-import-lastfm-kind')).toEqual([
      'My top tracks',
      'My loved tracks',
      'Top tracks for a tag',
      'Top tracks by an artist',
      'Recommended for me',
    ])
    expect(labelFor(wrapper, 'playlist-import-lastfm-limit')).toBe('How many tracks')

    await switchToGerman()

    expect(labelFor(wrapper, 'playlist-import-lastfm-kind')).toBe('Quelle')
    expect(optionsOf(wrapper, 'playlist-import-lastfm-kind')).toEqual([
      'Meine Top-Titel',
      'Meine Lieblingstitel',
      'Top-Titel zu einem Tag',
      'Top-Titel eines Interpreten',
      'Für mich empfohlen',
    ])
    expect(labelFor(wrapper, 'playlist-import-lastfm-limit')).toBe('Wie viele Titel')
  })

  it('re-renders the period select with all four ranges', async () => {
    const wrapper = await openSection()
    await chooseLastFm(wrapper, 'top-tracks')

    expect(labelFor(wrapper, 'playlist-import-lastfm-period')).toBe('Period')
    expect(optionsOf(wrapper, 'playlist-import-lastfm-period')).toEqual([
      'Last 7 days',
      'Last month',
      'Last 12 months',
      'All time',
    ])

    await switchToGerman()

    expect(labelFor(wrapper, 'playlist-import-lastfm-period')).toBe('Zeitraum')
    expect(optionsOf(wrapper, 'playlist-import-lastfm-period')).toEqual([
      'Letzte 7 Tage',
      'Letzter Monat',
      'Letzte 12 Monate',
      'Gesamt',
    ])
  })

  it('re-renders the tag and artist fields', async () => {
    const wrapper = await openSection()
    await chooseLastFm(wrapper, 'tag')

    expect(labelFor(wrapper, 'playlist-import-lastfm-tag')).toBe('Tag')
    expect(placeholderOf(wrapper, 'playlist-import-lastfm-tag')).toBe('krautrock')

    await switchToGerman()

    expect(labelFor(wrapper, 'playlist-import-lastfm-tag')).toBe('Tag')
    expect(placeholderOf(wrapper, 'playlist-import-lastfm-tag')).toBe('krautrock')

    await wrapper.find('[data-testid="playlist-import-lastfm-kind"]').setValue('artist')

    expect(labelFor(wrapper, 'playlist-import-lastfm-artist')).toBe('Interpret')
    expect(placeholderOf(wrapper, 'playlist-import-lastfm-artist')).toBe('Radiohead')

    useI18nStore().setLanguage('en')
    await nextTick()

    expect(labelFor(wrapper, 'playlist-import-lastfm-artist')).toBe('Artist')
    expect(placeholderOf(wrapper, 'playlist-import-lastfm-artist')).toBe('Radiohead')
  })

  it('re-renders the save option and its name field', async () => {
    const wrapper = await openSection()
    await wrapper.find('[data-testid="playlist-import-save-toggle"]').setValue(true)

    expect(labelFor(wrapper, 'playlist-import-save-toggle')).toBe('Also save as a playlist')
    expect(labelFor(wrapper, 'playlist-import-save-name')).toBe('Playlist name')
    expect(placeholderOf(wrapper, 'playlist-import-save-name')).toBe('Road trip')

    await switchToGerman()

    expect(labelFor(wrapper, 'playlist-import-save-toggle')).toBe('Auch als Playlist speichern')
    expect(labelFor(wrapper, 'playlist-import-save-name')).toBe('Playlist-Name')
    expect(placeholderOf(wrapper, 'playlist-import-save-name')).toBe('Autofahrt')
  })

  it('fills the count and seconds of the wait estimate in both languages', async () => {
    const wrapper = await openSection()
    await wrapper
      .find('[data-testid="playlist-import-text"]')
      .setValue('Artist A - Song A\nArtist B - Song B')

    isImportingRef.value = true
    await nextTick()

    expect(textOf(wrapper, 'playlist-import-submit')).toBe('Searching…')
    expect(textOf(wrapper, 'playlist-import-estimate')).toBe(
      'Searching 2 tracks — this can take up to 5 seconds.',
    )

    await switchToGerman()

    expect(textOf(wrapper, 'playlist-import-submit')).toBe('Wird gesucht…')
    expect(textOf(wrapper, 'playlist-import-estimate')).toBe(
      'Sucht 2 Titel — das kann bis zu 5 Sekunden dauern.',
    )
  })

  it('fills the imported, total and saved-name placeholders in both languages', async () => {
    resultRef.value = {
      imported: 7,
      missing: ['A', 'B', 'C'],
      total: 10,
      skippedLines: 2,
      savedAs: 'Road trip',
    }
    const wrapper = await openSection()
    await flushPromises()

    expect(wrapper.find('[data-testid="playlist-import-result"] p').text()).toBe(
      '7 of 10 tracks found',
    )
    expect(textOf(wrapper, 'playlist-import-result-playing')).toBe('Playing now.')
    expect(textOf(wrapper, 'playlist-import-result-saved')).toBe('Saved as playlist Road trip.')
    expect(textOf(wrapper, 'playlist-import-result')).toContain('2 lines could not be read')
    expect(textOf(wrapper, 'playlist-import-missing-toggle')).toBe(
      'Show 3 tracks that were not found',
    )

    await switchToGerman()

    expect(wrapper.find('[data-testid="playlist-import-result"] p').text()).toBe(
      '7 von 10 Titeln gefunden',
    )
    expect(textOf(wrapper, 'playlist-import-result-playing')).toBe('Läuft jetzt.')
    expect(textOf(wrapper, 'playlist-import-result-saved')).toBe(
      'Als Playlist Road trip gespeichert.',
    )
    expect(textOf(wrapper, 'playlist-import-result')).toContain('2 Zeilen waren nicht lesbar')
    expect(textOf(wrapper, 'playlist-import-missing-toggle')).toBe(
      '3 nicht gefundene Titel anzeigen',
    )
  })

  it('shows the unreadable-text result in both languages', async () => {
    resultRef.value = { imported: 0, missing: [], total: 0, skippedLines: 2 }
    const wrapper = await openSection()

    expect(wrapper.find('[data-testid="playlist-import-result"] p').text()).toBe(
      'No tracks could be read from this text.',
    )

    await switchToGerman()

    expect(wrapper.find('[data-testid="playlist-import-result"] p').text()).toBe(
      'Aus diesem Text konnten keine Titel gelesen werden.',
    )
  })

  it('shows the nothing-resolved result in both languages', async () => {
    resultRef.value = { imported: 0, missing: ['A', 'B'], total: 2, skippedLines: 0 }
    const wrapper = await openSection()

    expect(wrapper.find('[data-testid="playlist-import-result"] p').text()).toBe(
      'None of these tracks are in your library or on Tidal.',
    )

    await switchToGerman()

    expect(wrapper.find('[data-testid="playlist-import-result"] p').text()).toBe(
      'Keiner dieser Titel ist in deiner Bibliothek oder bei Tidal.',
    )
  })

  it('fills the limit of the truncation note in both languages', async () => {
    const wrapper = await openSection()
    await wrapper
      .find('[data-testid="playlist-import-text"]')
      .setValue(
        Array.from({ length: 120 }, (_, index) => `Artist ${index} - Song ${index}`).join('\n'),
      )

    expect(textOf(wrapper, 'playlist-import-truncated')).toBe(
      'Only the first 100 tracks will be imported.',
    )

    await switchToGerman()

    expect(textOf(wrapper, 'playlist-import-truncated')).toBe(
      'Es werden nur die ersten 100 Titel importiert.',
    )
  })

  it('shows each of the three error messages in both languages', async () => {
    errorKindRef.value = 'failed'
    const wrapper = await openSection()

    expect(textOf(wrapper, 'playlist-import-error')).toBe('The import failed. Please try again.')

    errorKindRef.value = 'lastfm-not-configured'
    await nextTick()
    expect(textOf(wrapper, 'playlist-import-error')).toBe(
      'Last.fm is not set up for this user. Add a Last.fm username in Settings.',
    )

    errorKindRef.value = 'lastfm-unavailable'
    await nextTick()
    expect(textOf(wrapper, 'playlist-import-error')).toBe(
      'Last.fm could not be reached. Please try again.',
    )

    await switchToGerman()
    expect(textOf(wrapper, 'playlist-import-error')).toBe(
      'Last.fm ist nicht erreichbar. Bitte erneut versuchen.',
    )

    errorKindRef.value = 'lastfm-not-configured'
    await nextTick()
    expect(textOf(wrapper, 'playlist-import-error')).toBe(
      'Last.fm ist für diesen Nutzer nicht eingerichtet. Trage in den Einstellungen einen Last.fm-Namen ein.',
    )

    errorKindRef.value = 'failed'
    await nextTick()
    expect(textOf(wrapper, 'playlist-import-error')).toBe(
      'Der Import ist fehlgeschlagen. Bitte erneut versuchen.',
    )
  })

  it('re-renders the textarea placeholder and its accessible name', async () => {
    const wrapper = await openSection()

    expect(placeholderOf(wrapper, 'playlist-import-text')).toBe('Led Zeppelin - Stairway to Heaven')
    expect(wrapper.find('[data-testid="playlist-import-text"]').attributes('aria-label')).toBe(
      'Track list to import',
    )

    await switchToGerman()

    expect(placeholderOf(wrapper, 'playlist-import-text')).toBe('Led Zeppelin - Stairway to Heaven')
    expect(wrapper.find('[data-testid="playlist-import-text"]').attributes('aria-label')).toBe(
      'Zu importierende Titelliste',
    )
  })
})
