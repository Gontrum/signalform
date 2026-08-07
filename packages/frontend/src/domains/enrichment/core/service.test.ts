import { describe, expect, it } from 'vitest'
import { getMessage, type MessageKey } from '@/i18n'
import { buildCountLabel, pluralByCount } from './service'

type Language = 'en' | 'de'

const label = (language: Language, count: number, one: MessageKey, other: MessageKey): string =>
  pluralByCount(count, getMessage(language, one), getMessage(language, other)).replace(
    '{count}',
    String(count),
  )

const listeners = (language: Language, count: number): string =>
  label(language, count, 'enrichment.listenersOne', 'enrichment.listenersOther')

const plays = (language: Language, count: number): string =>
  label(language, count, 'enrichment.playsOne', 'enrichment.playsOther')

describe('pluralByCount', () => {
  it('takes the singular form for exactly one', () => {
    expect(pluralByCount(1, 'one', 'other')).toBe('one')
  })

  it('takes the plural form for more than one', () => {
    expect(pluralByCount(2, 'one', 'other')).toBe('other')
  })

  it('takes the plural form for none at all', () => {
    expect(pluralByCount(0, 'one', 'other')).toBe('other')
  })

  it('does not treat a large count as a special case', () => {
    expect(pluralByCount(1234567, 'one', 'other')).toBe('other')
  })
})

describe('pluralByCount for the enrichment stats', () => {
  it('names a single listener and a single play in both languages', () => {
    expect(listeners('en', 1)).toBe('1 listener')
    expect(plays('en', 1)).toBe('1 play')
    expect(listeners('de', 1)).toBe('1 Hörer')
    expect(plays('de', 1)).toBe('1 Wiedergabe')
  })

  it('names several listeners and plays in both languages', () => {
    expect(listeners('en', 42)).toBe('42 listeners')
    expect(plays('en', 7)).toBe('7 plays')
    expect(listeners('de', 42)).toBe('42 Hörer')
    expect(plays('de', 7)).toBe('7 Wiedergaben')
  })

  it('names none in the plural in both languages', () => {
    expect(listeners('en', 0)).toBe('0 listeners')
    expect(plays('en', 0)).toBe('0 plays')
    expect(listeners('de', 0)).toBe('0 Hörer')
    expect(plays('de', 0)).toBe('0 Wiedergaben')
  })

  // German spells both listener forms alike, so a wrong pick shows up in the
  // English catalog only — which is why the split cannot be read off the text.
  it('splits the German plays where it cannot split the German listeners', () => {
    expect(listeners('de', 1).replace('1', '42')).toBe(listeners('de', 42))
    expect(plays('de', 1).replace('1', '7')).not.toBe(plays('de', 7))
  })
})

const countLabel = (
  language: Language,
  count: number,
  one: MessageKey,
  other: MessageKey,
  locale?: string,
): string => buildCountLabel(count, getMessage(language, one), getMessage(language, other), locale)

const listenerCount = (language: Language, count: number, locale?: string): string =>
  countLabel(language, count, 'enrichment.listenersOne', 'enrichment.listenersOther', locale)

const playCount = (language: Language, count: number, locale?: string): string =>
  countLabel(language, count, 'enrichment.playsOne', 'enrichment.playsOther', locale)

const trackCount = (language: Language, count: number, locale?: string): string =>
  countLabel(language, count, 'album.trackCountOne', 'album.trackCountOther', locale)

describe('buildCountLabel', () => {
  it('names a single listener and a single play in both languages', () => {
    expect(listenerCount('en', 1)).toBe('1 listener')
    expect(playCount('en', 1)).toBe('1 play')
    expect(listenerCount('de', 1)).toBe('1 Hörer')
    expect(playCount('de', 1)).toBe('1 Wiedergabe')
  })

  it('names several listeners and plays in both languages', () => {
    expect(listenerCount('en', 42)).toBe('42 listeners')
    expect(playCount('en', 7)).toBe('7 plays')
    expect(listenerCount('de', 42)).toBe('42 Hörer')
    expect(playCount('de', 7)).toBe('7 Wiedergaben')
  })

  it('names none in the plural in both languages', () => {
    expect(listenerCount('en', 0)).toBe('0 listeners')
    expect(playCount('en', 0)).toBe('0 plays')
    expect(listenerCount('de', 0)).toBe('0 Hörer')
    expect(playCount('de', 0)).toBe('0 Wiedergaben')
  })

  it('groups the thousands the way the given locale spells them', () => {
    expect(listenerCount('en', 1234567, 'en-US')).toBe('1,234,567 listeners')
    expect(playCount('de', 1234567, 'de-DE')).toBe('1.234.567 Wiedergaben')
  })

  it('groups a four-digit count as well, where the separator first appears', () => {
    expect(playCount('en', 1000, 'en-US')).toBe('1,000 plays')
    expect(playCount('en', 999, 'en-US')).toBe('999 plays')
  })

  it('leaves no placeholder behind and repeats no count', () => {
    expect(listenerCount('en', 2048, 'de-DE')).toBe('2.048 listeners')
  })

  it('spells the track count with the same grouping as the stats', () => {
    expect(trackCount('en', 1)).toBe('1 track')
    expect(trackCount('en', 12)).toBe('12 tracks')
    expect(trackCount('de', 12)).toBe('12 Titel')
    expect(trackCount('en', 1234, 'en-US')).toBe('1,234 tracks')
  })
})
