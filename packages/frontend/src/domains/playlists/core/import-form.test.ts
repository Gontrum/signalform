import { describe, expect, it } from 'vitest'
import {
  PASTE_IMPORT_LIMIT,
  importName,
  isImportSubmittable,
  planImport,
  toLastFmSource,
  type ImportFormState,
} from './import-form'

const baseState: ImportFormState = {
  sourceMode: 'paste',
  text: '',
  lastFmKind: 'top-tracks',
  period: 'overall',
  tag: '',
  artist: '',
  limit: 50,
  saveEnabled: false,
  saveName: '',
}

const stateWith = (overrides: Partial<ImportFormState>): ImportFormState => ({
  ...baseState,
  ...overrides,
})

const nonEmptyLineCount = (text: string): number =>
  text.split('\n').filter((line) => line.trim() !== '').length

const plainLines = (count: number): string =>
  Array.from({ length: count }, (_, index) => `Artist ${index + 1} - Title ${index + 1}`).join('\n')

describe('planImport', () => {
  it('counts parsable plain lines and ignores blank, whitespace-only and separator-less lines', () => {
    const text = [
      '',
      '   ',
      'Portishead - Glory Box',
      '',
      'no separator on this line',
      'Massive Attack - Teardrop',
      '\t',
      "Air - La Femme d'Argent",
    ].join('\n')

    expect(nonEmptyLineCount(text)).toBe(4)
    expect(planImport(stateWith({ text })).candidateCount).toBe(3)
  })

  it('counts m3u entries once, not the #EXTINF and url line of each entry', () => {
    const text = [
      '#EXTM3U',
      '#EXTINF:312,Led Zeppelin - Stairway to Heaven',
      '/music/led-zeppelin/stairway.flac',
      '#EXTINF:180,Daft Punk - One More Time',
      '/music/daft-punk/one-more-time.flac',
      '#EXTINF:245,Portishead - Glory Box',
      '/music/portishead/glory-box.flac',
    ].join('\n')

    expect(nonEmptyLineCount(text)).toBe(7)
    expect(planImport(stateWith({ text })).candidateCount).toBe(3)
  })

  it('skips the csv header row when counting candidates', () => {
    const text = [
      'Artist,Track name,Album',
      'Radiohead,Karma Police,OK Computer',
      'Daft Punk,One More Time,Discovery',
      'Portishead,Glory Box,Dummy',
      "Air,La Femme d'Argent,Moon Safari",
    ].join('\n')

    expect(nonEmptyLineCount(text)).toBe(5)
    expect(planImport(stateWith({ text })).candidateCount).toBe(4)
  })

  it('caps the candidate count at the paste limit and reports the truncation', () => {
    const text = plainLines(120)

    expect(planImport(stateWith({ text }))).toEqual({
      candidateCount: 100,
      truncated: true,
      estimatedSeconds: 50,
    })
  })

  it('does not report truncation at exactly the paste limit', () => {
    const text = plainLines(PASTE_IMPORT_LIMIT)

    expect(planImport(stateWith({ text }))).toEqual({
      candidateCount: 100,
      truncated: false,
      estimatedSeconds: 50,
    })
  })

  it('uses the requested limit as the candidate count in last.fm mode and never truncates', () => {
    const plan = planImport(stateWith({ sourceMode: 'lastfm', limit: 25, text: plainLines(120) }))

    expect(plan).toEqual({ candidateCount: 25, truncated: false, estimatedSeconds: 13 })
  })

  it('estimates half a second per candidate', () => {
    expect(planImport(stateWith({ sourceMode: 'lastfm', limit: 50 })).estimatedSeconds).toBe(25)
  })

  it('never estimates below the five second floor for a tiny candidate count', () => {
    expect(planImport(stateWith({ text: plainLines(2) })).estimatedSeconds).toBe(5)
  })

  it('returns a zero candidate count for text that parses to nothing', () => {
    expect(planImport(stateWith({ text: 'hello world\nno separator here either' }))).toEqual({
      candidateCount: 0,
      truncated: false,
      estimatedSeconds: 5,
    })
  })
})

describe('isImportSubmittable', () => {
  it('is false for blank paste text', () => {
    expect(isImportSubmittable(stateWith({ text: '   \n\n' }))).toBe(false)
  })

  it('is false for non-blank paste text that parses to zero tracks', () => {
    expect(isImportSubmittable(stateWith({ text: 'hello world\nno separator here either' }))).toBe(
      false,
    )
  })

  it('is true for a single parsable paste line', () => {
    expect(isImportSubmittable(stateWith({ text: 'Portishead - Glory Box' }))).toBe(true)
  })

  it('is false for the tag kind with a whitespace-only tag', () => {
    expect(
      isImportSubmittable(stateWith({ sourceMode: 'lastfm', lastFmKind: 'tag', tag: '   ' })),
    ).toBe(false)
  })

  it('is true for the tag kind with a tag', () => {
    expect(
      isImportSubmittable(stateWith({ sourceMode: 'lastfm', lastFmKind: 'tag', tag: 'trip hop' })),
    ).toBe(true)
  })

  it('is false for the artist kind with a whitespace-only artist', () => {
    expect(
      isImportSubmittable(stateWith({ sourceMode: 'lastfm', lastFmKind: 'artist', artist: ' ' })),
    ).toBe(false)
  })

  it('is true for the artist kind with an artist', () => {
    expect(
      isImportSubmittable(
        stateWith({ sourceMode: 'lastfm', lastFmKind: 'artist', artist: 'Portishead' }),
      ),
    ).toBe(true)
  })

  it('is true for a last.fm kind that needs no extra input', () => {
    expect(isImportSubmittable(stateWith({ sourceMode: 'lastfm', lastFmKind: 'loved' }))).toBe(true)
  })

  it('is false when saving is enabled with a blank name', () => {
    expect(
      isImportSubmittable(
        stateWith({ text: 'Portishead - Glory Box', saveEnabled: true, saveName: '  ' }),
      ),
    ).toBe(false)
  })

  it('is true when saving is enabled with a name', () => {
    expect(
      isImportSubmittable(
        stateWith({ text: 'Portishead - Glory Box', saveEnabled: true, saveName: 'Evening' }),
      ),
    ).toBe(true)
  })
})

describe('toLastFmSource', () => {
  it('carries the period for top tracks', () => {
    expect(toLastFmSource(stateWith({ lastFmKind: 'top-tracks', period: '1month' }))).toStrictEqual(
      {
        kind: 'top-tracks',
        period: '1month',
      },
    )
  })

  it('carries nothing but the kind for loved', () => {
    expect(
      toLastFmSource(stateWith({ lastFmKind: 'loved', period: '7day', tag: 'jazz' })),
    ).toStrictEqual({ kind: 'loved' })
  })

  it('carries nothing but the kind for recommended', () => {
    expect(
      toLastFmSource(stateWith({ lastFmKind: 'recommended', artist: 'Portishead' })),
    ).toStrictEqual({ kind: 'recommended' })
  })

  it('carries the trimmed tag for the tag kind', () => {
    expect(
      toLastFmSource(stateWith({ lastFmKind: 'tag', tag: '  trip hop  ', artist: 'Air' })),
    ).toStrictEqual({ kind: 'tag', tag: 'trip hop' })
  })

  it('carries the trimmed artist for the artist kind', () => {
    expect(
      toLastFmSource(stateWith({ lastFmKind: 'artist', artist: '  Portishead ', tag: 'jazz' })),
    ).toStrictEqual({ kind: 'artist', artist: 'Portishead' })
  })
})

describe('importName', () => {
  it('is undefined while saving is disabled even with a name typed', () => {
    expect(importName(stateWith({ saveEnabled: false, saveName: 'Evening' }))).toBeUndefined()
  })

  it('is undefined while saving is enabled with a whitespace-only name', () => {
    expect(importName(stateWith({ saveEnabled: true, saveName: '   ' }))).toBeUndefined()
  })

  it('is the trimmed name while saving is enabled', () => {
    expect(importName(stateWith({ saveEnabled: true, saveName: '  Evening Set  ' }))).toBe(
      'Evening Set',
    )
  })
})
