/**
 * The add-to-queue button's accessible name interpolates the album title into
 * the translated template. Own file so AlbumActionButtons.test.ts stays about
 * sizing and test-ids.
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AlbumActionButtons from './AlbumActionButtons.vue'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

const mountWithTitle = (
  albumTitle: string,
  albumId: string,
  albumArtist = 'Pink Floyd',
): VueWrapper =>
  mount(AlbumActionButtons, {
    props: {
      albumId,
      albumTitle,
      albumArtist,
      playState: 'idle',
      queueState: 'idle',
      showGoToArtist: true,
    },
  })

const mountButtons = (
  language: Language,
  albumTitle: string,
  albumId = '42',
  albumArtist = 'Pink Floyd',
): VueWrapper => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  return mountWithTitle(albumTitle, albumId, albumArtist)
}

const queueLabelOf = (wrapper: VueWrapper, albumId = '42'): string | undefined =>
  wrapper.find(`[data-testid="add-album-to-queue-button-${albumId}"]`).attributes('aria-label')

describe('AlbumActionButtons — translated add-to-queue label', () => {
  it('interpolates the album title into the English template', () => {
    expect(queueLabelOf(mountButtons('en', 'Dark Side of the Moon'))).toBe(
      'Add album Dark Side of the Moon to queue',
    )
  })

  it('interpolates the album title into the German template', () => {
    expect(queueLabelOf(mountButtons('de', 'Dark Side of the Moon'))).toBe(
      'Album Dark Side of the Moon zur Warteschlange hinzufügen',
    )
  })

  it('gives two albums distinct English labels', () => {
    expect(queueLabelOf(mountButtons('en', 'The Wall', '1'), '1')).toBe(
      'Add album The Wall to queue',
    )
    expect(queueLabelOf(mountButtons('en', 'Animals', '2'), '2')).toBe('Add album Animals to queue')
  })

  it('gives two albums distinct German labels', () => {
    expect(queueLabelOf(mountButtons('de', 'The Wall', '1'), '1')).toBe(
      'Album The Wall zur Warteschlange hinzufügen',
    )
    expect(queueLabelOf(mountButtons('de', 'Animals', '2'), '2')).toBe(
      'Album Animals zur Warteschlange hinzufügen',
    )
  })

  it('follows a language switch made after mount', async () => {
    const i18nStore = setupTestEnv()
    const wrapper = mountWithTitle('Wish You Were Here', '42')

    expect(queueLabelOf(wrapper)).toBe('Add album Wish You Were Here to queue')

    i18nStore.setLanguage('de')
    await nextTick()

    expect(queueLabelOf(wrapper)).toBe('Album Wish You Were Here zur Warteschlange hinzufügen')
  })
})

const playLabelOf = (wrapper: VueWrapper, albumId = '42'): string | undefined =>
  wrapper.find(`[data-testid="play-album-button-${albumId}"]`).attributes('aria-label')

const goToArtistLabelOf = (wrapper: VueWrapper, albumId = '42'): string | undefined =>
  wrapper.find(`[data-testid="go-to-artist-button-${albumId}"]`).attributes('aria-label')

describe('AlbumActionButtons — translated play label', () => {
  it('interpolates the album title into the English template', () => {
    expect(playLabelOf(mountButtons('en', 'The Wall'))).toBe('Play album The Wall')
  })

  // The old label appended the title to the "Album abspielen" caption, which
  // read "Album abspielen The Wall" in German.
  it('puts the album title before the verb in German', () => {
    expect(playLabelOf(mountButtons('de', 'The Wall'))).toBe('Album The Wall abspielen')
  })

  it('gives two albums distinct German play labels', () => {
    expect(playLabelOf(mountButtons('de', 'The Wall', '1'), '1')).toBe('Album The Wall abspielen')
    expect(playLabelOf(mountButtons('de', 'Animals', '2'), '2')).toBe('Album Animals abspielen')
  })

  // The visible caption is a separate key and must stay verb-only.
  it('keeps the visible play caption free of the album title', () => {
    const wrapper = mountButtons('de', 'The Wall')

    expect(wrapper.find('[data-testid="play-album-text"]').text()).toBe('Album abspielen')
  })
})

describe('AlbumActionButtons — translated go-to-artist label', () => {
  it('interpolates the artist into the English template', () => {
    expect(goToArtistLabelOf(mountButtons('en', 'Mezzanine', '42', 'Massive Attack'))).toBe(
      'Go to artist Massive Attack',
    )
  })

  it('interpolates the artist into the German template', () => {
    expect(goToArtistLabelOf(mountButtons('de', 'Mezzanine', '42', 'Massive Attack'))).toBe(
      'Zum Künstler Massive Attack',
    )
  })

  it('gives two artists distinct German labels', () => {
    expect(goToArtistLabelOf(mountButtons('de', 'Mezzanine', '1', 'Massive Attack'), '1')).toBe(
      'Zum Künstler Massive Attack',
    )
    expect(goToArtistLabelOf(mountButtons('de', 'The Wall', '2', 'Pink Floyd'), '2')).toBe(
      'Zum Künstler Pink Floyd',
    )
  })

  it('keeps the visible go-to-artist caption free of the artist name', () => {
    const wrapper = mountButtons('de', 'Mezzanine', '42', 'Massive Attack')

    expect(wrapper.find('[data-testid="go-to-artist-button-42"]').text()).toBe('Zum Künstler')
  })
})

const queueCaptionOf = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="add-album-to-queue-text"]').text()

describe('AlbumActionButtons — visible add-to-queue caption', () => {
  const mountLarge = (): VueWrapper =>
    mount(AlbumActionButtons, {
      props: {
        albumId: '42',
        albumTitle: 'Mezzanine',
        albumArtist: 'Massive Attack',
        playState: 'idle',
        queueState: 'idle',
        size: 'large',
      },
    })

  // The "+" is an icon, not a word: it stays put while the caption behind it
  // follows a language switch made after mount.
  it('keeps the plus sign and translates only the caption', async () => {
    const i18nStore = setupTestEnv()
    const wrapper = mountLarge()

    expect(queueCaptionOf(wrapper)).toBe('+ Queue')

    i18nStore.setLanguage('de')
    await nextTick()

    expect(queueCaptionOf(wrapper)).toBe('+ Warteschlange')
  })
})
