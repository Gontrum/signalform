import { describe, expect, it } from 'vitest'
import { getMessage } from '@/i18n'
import type { SourceTranslator } from '@/utils/sourceInfo'
import { createAlsoAvailableText, createTrackAnnouncement } from './service'
import type { TrackInfo } from './types'

const english: SourceTranslator = (key) => getMessage('en', key)
const german: SourceTranslator = (key) => getMessage('de', key)

const trackWith = (
  source: TrackInfo['source'],
  availableSources: TrackInfo['availableSources'],
): TrackInfo => ({
  id: 'track-1',
  title: 'Blue in Green',
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  url: 'source:track-1',
  source,
  availableSources,
})

const namedTrack = (title: string, artist: string): TrackInfo => ({
  id: 'track-2',
  title,
  artist,
  album: 'L.A. Woman',
  url: 'local:track-2',
})

describe('createTrackAnnouncement', () => {
  it('builds the whole sentence from the catalog in both languages', () => {
    const track = namedTrack('Riders on the Storm', 'The Doors')

    expect(createTrackAnnouncement(english, track)).toBe(
      'Now playing: Riders on the Storm by The Doors',
    )
    expect(createTrackAnnouncement(german, track)).toBe(
      'Läuft jetzt: Riders on the Storm von The Doors',
    )
  })

  it('puts the title and the artist in their own slots, not swapped', () => {
    expect(createTrackAnnouncement(english, namedTrack('Alabama', 'Song'))).toBe(
      'Now playing: Alabama by Song',
    )
    expect(createTrackAnnouncement(english, namedTrack('Song', 'Alabama'))).toBe(
      'Now playing: Song by Alabama',
    )
    expect(createTrackAnnouncement(german, namedTrack('Alabama', 'Song'))).toBe(
      'Läuft jetzt: Alabama von Song',
    )
    expect(createTrackAnnouncement(german, namedTrack('Song', 'Alabama'))).toBe(
      'Läuft jetzt: Song von Alabama',
    )
  })

  it('leaves no placeholder behind when a field is empty', () => {
    const track = namedTrack('', '')

    expect(createTrackAnnouncement(english, track)).toBe('Now playing:  by ')
    expect(createTrackAnnouncement(german, track)).toBe('Läuft jetzt:  von ')
  })

  it('announces nothing without a track', () => {
    expect(createTrackAnnouncement(english, null)).toBe('')
    expect(createTrackAnnouncement(german, null)).toBe('')
  })
})

describe('createAlsoAvailableText', () => {
  it('names the single other source', () => {
    const track = trackWith('local', [
      { source: 'local', url: 'local:1' },
      { source: 'qobuz', url: 'qobuz:1' },
    ])

    expect(createAlsoAvailableText(english, track)).toBe('Also available on: Qobuz')
  })

  it('lists two other sources in the order they arrive', () => {
    const track = trackWith('local', [
      { source: 'tidal', url: 'tidal:1' },
      { source: 'local', url: 'local:1' },
      { source: 'qobuz', url: 'qobuz:1' },
    ])

    expect(createAlsoAvailableText(english, track)).toBe('Also available on: Tidal, Qobuz')
  })

  it('lists three other sources in the order they arrive', () => {
    const track = trackWith('qobuz', [
      { source: 'tidal', url: 'tidal:1' },
      { source: 'unknown', url: 'unknown:1' },
      { source: 'qobuz', url: 'qobuz:1' },
      { source: 'local', url: 'local:1' },
    ])

    expect(createAlsoAvailableText(english, track)).toBe('Also available on: Tidal, Unknown, Local')
  })

  it('builds a different sentence per translator', () => {
    const track = trackWith('local', [
      { source: 'local', url: 'local:1' },
      { source: 'qobuz', url: 'qobuz:1' },
      { source: 'tidal', url: 'tidal:1' },
    ])

    expect(createAlsoAvailableText(english, track)).toBe('Also available on: Qobuz, Tidal')
    expect(createAlsoAvailableText(german, track)).toBe('Auch verfügbar auf: Qobuz, Tidal')
  })

  it('translates an unknown source instead of leaking a key or undefined', () => {
    const track = trackWith('local', [
      { source: 'local', url: 'local:1' },
      { source: 'unknown', url: 'unknown:1' },
    ])

    expect(createAlsoAvailableText(english, track)).toBe('Also available on: Unknown')
    expect(createAlsoAvailableText(german, track)).toBe('Auch verfügbar auf: Unbekannt')
  })

  it('returns an empty text when every entry is the current source', () => {
    const track = trackWith('qobuz', [
      { source: 'qobuz', url: 'qobuz:1' },
      { source: 'qobuz', url: 'qobuz:2' },
    ])

    expect(createAlsoAvailableText(english, track)).toBe('')
    expect(createAlsoAvailableText(german, track)).toBe('')
  })

  it('returns an empty text for a single source, no sources and no track', () => {
    expect(
      createAlsoAvailableText(english, trackWith('qobuz', [{ source: 'qobuz', url: 'q' }])),
    ).toBe('')
    expect(createAlsoAvailableText(english, trackWith('qobuz', undefined))).toBe('')
    expect(createAlsoAvailableText(english, null)).toBe('')
  })
})
