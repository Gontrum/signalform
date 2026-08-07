/**
 * AlbumListRow — the list-view counterpart of AlbumCard's overlay buttons.
 * Both share the same two keys, so this file also pins that the row really
 * renders the album-scoped wording and not a track-scoped one.
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AlbumListRow from './AlbumListRow.vue'
import type { LibraryAlbum } from '@/domains/library/core/types'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

const makeAlbum = (title: string, id: string): LibraryAlbum => ({
  id,
  title,
  artist: 'Pink Floyd',
  releaseYear: 1973,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const mountRow = (language: Language, album: LibraryAlbum): VueWrapper => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  return mount(AlbumListRow, { props: { album } })
}

const playLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[data-testid="list-row-play-button"]').attributes('aria-label')

const queueLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[data-testid="list-row-add-to-queue-button"]').attributes('aria-label')

describe('AlbumListRow — translated action labels', () => {
  it('names the play and queue buttons in English', () => {
    const wrapper = mountRow('en', makeAlbum('Wish You Were Here', '1'))

    expect(playLabel(wrapper)).toBe('Play album Wish You Were Here')
    expect(queueLabel(wrapper)).toBe('Add album Wish You Were Here to queue')
  })

  it('names the play and queue buttons in German', () => {
    const wrapper = mountRow('de', makeAlbum('Wish You Were Here', '1'))

    expect(playLabel(wrapper)).toBe('Album Wish You Were Here abspielen')
    expect(queueLabel(wrapper)).toBe('Album Wish You Were Here zur Warteschlange hinzufügen')
  })

  it('gives two albums distinct English labels', () => {
    expect(playLabel(mountRow('en', makeAlbum('The Wall', '1')))).toBe('Play album The Wall')
    expect(playLabel(mountRow('en', makeAlbum('Animals', '2')))).toBe('Play album Animals')
  })

  it('gives two albums distinct German labels', () => {
    expect(queueLabel(mountRow('de', makeAlbum('The Wall', '1')))).toBe(
      'Album The Wall zur Warteschlange hinzufügen',
    )
    expect(queueLabel(mountRow('de', makeAlbum('Animals', '2')))).toBe(
      'Album Animals zur Warteschlange hinzufügen',
    )
  })

  it('follows a language switch made after mount', async () => {
    const i18nStore = setupTestEnv()
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum('Meddle', '1') } })

    expect(playLabel(wrapper)).toBe('Play album Meddle')

    i18nStore.setLanguage('de')
    await nextTick()

    expect(playLabel(wrapper)).toBe('Album Meddle abspielen')
  })
})
