import { describe, it, expect } from 'vitest'
import { getMessage, type MessageKey } from '@/i18n'
import type { Language } from '@/types/i18n'
import { getSourceLabel, getSourceTooltip } from './sourceInfo'

const translatorFor =
  (language: Language) =>
  (key: MessageKey): string =>
    getMessage(language, key)

const en = translatorFor('en')
const de = translatorFor('de')

describe('getSourceLabel', () => {
  it('translates the label of every known source', () => {
    expect(['local', 'qobuz', 'tidal', 'unknown'].map((s) => getSourceLabel(en, s))).toEqual([
      'Local',
      'Qobuz',
      'Tidal',
      'Unknown',
    ])
    expect(['local', 'qobuz', 'tidal', 'unknown'].map((s) => getSourceLabel(de, s))).toEqual([
      'Lokal',
      'Qobuz',
      'Tidal',
      'Unbekannt',
    ])
  })

  it('keeps Qobuz and Tidal as product names in German', () => {
    expect(getSourceLabel(de, 'qobuz')).toBe('Qobuz')
    expect(getSourceLabel(de, 'tidal')).toBe('Tidal')
  })

  it('falls back to the unknown label for a source it does not know', () => {
    expect(getSourceLabel(en, 'spotify')).toBe('Unknown')
    expect(getSourceLabel(de, 'spotify')).toBe('Unbekannt')
  })

  it('falls back to the unknown label when no source is given at all', () => {
    expect(getSourceLabel(en, undefined)).toBe('Unknown')
    expect(getSourceLabel(de, undefined)).toBe('Unbekannt')
  })

  it('uses the caller-supplied fallback key instead of the unknown label', () => {
    expect(getSourceLabel(en, undefined, 'source.streaming')).toBe('Streaming')
    expect(getSourceLabel(de, undefined, 'source.streaming')).toBe('Streaming')
  })

  it('prefers the known label over the caller-supplied fallback', () => {
    expect(getSourceLabel(de, 'local', 'source.streaming')).toBe('Lokal')
  })
})

describe('getSourceTooltip', () => {
  it('translates the tooltip of every known source', () => {
    expect(['local', 'qobuz', 'tidal', 'unknown'].map((s) => getSourceTooltip(en, s))).toEqual([
      'Playing from Local library',
      'Streaming from Qobuz',
      'Streaming from Tidal',
      'Source unknown',
    ])
    expect(['local', 'qobuz', 'tidal', 'unknown'].map((s) => getSourceTooltip(de, s))).toEqual([
      'Wird aus der lokalen Bibliothek abgespielt',
      'Wird von Qobuz gestreamt',
      'Wird von Tidal gestreamt',
      'Quelle unbekannt',
    ])
  })

  it('falls back to the unknown tooltip for a source it does not know', () => {
    expect(getSourceTooltip(en, 'spotify')).toBe('Source unknown')
    expect(getSourceTooltip(de, 'spotify')).toBe('Quelle unbekannt')
  })

  it('falls back to the unknown tooltip when no source is given at all', () => {
    expect(getSourceTooltip(en, undefined)).toBe('Source unknown')
    expect(getSourceTooltip(de, undefined)).toBe('Quelle unbekannt')
  })
})
