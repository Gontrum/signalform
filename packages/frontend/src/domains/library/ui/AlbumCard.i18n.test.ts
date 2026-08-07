/**
 * AlbumCard — three accessible names, all of them interpolating album data:
 * the navigate region (title *and* artist), the play button and the
 * add-to-queue button.
 *
 * Own file so AlbumCard.test.ts stays about the hover-overlay hit-testing
 * rules it was written to guard.
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AlbumCard from './AlbumCard.vue'
import type { LibraryAlbum } from '@/domains/library/core/types'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

const makeAlbum = (title: string, artist: string, id: string): LibraryAlbum => ({
  id,
  title,
  artist,
  releaseYear: 1973,
  coverArtUrl: `http://localhost:9000/music/${id}/cover.jpg`,
})

const mountCard = (language: Language, album: LibraryAlbum): VueWrapper => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  return mount(AlbumCard, { props: { album } })
}

const labelOf = (wrapper: VueWrapper, testId: string): string | undefined =>
  wrapper.find(`[data-testid="${testId}"]`).attributes('aria-label')

const navigateLabel = (wrapper: VueWrapper): string | undefined =>
  labelOf(wrapper, 'album-navigate-button')

const playLabel = (wrapper: VueWrapper): string | undefined => labelOf(wrapper, 'play-album-button')

const queueLabel = (wrapper: VueWrapper): string | undefined =>
  labelOf(wrapper, 'add-album-to-queue-button')

describe('AlbumCard — translated navigate label', () => {
  it('puts title and artist into the English template in that order', () => {
    expect(navigateLabel(mountCard('en', makeAlbum('Animals', 'Pink Floyd', '1')))).toBe(
      'View Animals by Pink Floyd',
    )
  })

  it('puts title and artist into the German template in that order', () => {
    expect(navigateLabel(mountCard('de', makeAlbum('Animals', 'Pink Floyd', '1')))).toBe(
      'Animals von Pink Floyd anzeigen',
    )
  })

  // Both placeholders are filled from different fields; swapping them would
  // still produce a plausible-looking sentence, so assert the exact order.
  it('does not swap the title and the artist', () => {
    expect(navigateLabel(mountCard('en', makeAlbum('Pink Floyd', 'Animals', '1')))).toBe(
      'View Pink Floyd by Animals',
    )
  })

  it('gives two albums distinct navigate labels', () => {
    expect(navigateLabel(mountCard('de', makeAlbum('The Wall', 'Pink Floyd', '1')))).toBe(
      'The Wall von Pink Floyd anzeigen',
    )
    expect(navigateLabel(mountCard('de', makeAlbum('Mezzanine', 'Massive Attack', '2')))).toBe(
      'Mezzanine von Massive Attack anzeigen',
    )
  })
})

describe('AlbumCard — translated overlay button labels', () => {
  it('names the play and queue buttons in English', () => {
    const wrapper = mountCard('en', makeAlbum('The Wall', 'Pink Floyd', '1'))

    expect(playLabel(wrapper)).toBe('Play album The Wall')
    expect(queueLabel(wrapper)).toBe('Add album The Wall to queue')
  })

  it('names the play and queue buttons in German', () => {
    const wrapper = mountCard('de', makeAlbum('The Wall', 'Pink Floyd', '1'))

    expect(playLabel(wrapper)).toBe('Album The Wall abspielen')
    expect(queueLabel(wrapper)).toBe('Album The Wall zur Warteschlange hinzufügen')
  })

  it('gives two albums distinct German play labels', () => {
    expect(playLabel(mountCard('de', makeAlbum('The Wall', 'Pink Floyd', '1')))).toBe(
      'Album The Wall abspielen',
    )
    expect(playLabel(mountCard('de', makeAlbum('Mezzanine', 'Massive Attack', '2')))).toBe(
      'Album Mezzanine abspielen',
    )
  })

  it('follows a language switch made after mount', async () => {
    const i18nStore = setupTestEnv()
    const wrapper = mount(AlbumCard, { props: { album: makeAlbum('Animals', 'Pink Floyd', '1') } })

    expect(playLabel(wrapper)).toBe('Play album Animals')

    i18nStore.setLanguage('de')
    await nextTick()

    expect(playLabel(wrapper)).toBe('Album Animals abspielen')
    expect(navigateLabel(wrapper)).toBe('Animals von Pink Floyd anzeigen')
  })
})
