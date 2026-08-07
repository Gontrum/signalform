import { describe, expect, it } from 'vitest'
import { getMessage } from '@/i18n'
import { buildFilterSummary, filterAdjustedMessageKey, filterControlPresentation } from './service'
import type { FilterField } from './types'

const summary = (parts: Partial<Parameters<typeof buildFilterSummary>[0]> = {}): string =>
  buildFilterSummary({
    sortLabel: 'Artist A–Z',
    noFilterLabel: 'All albums',
    ...parts,
  })

describe('buildFilterSummary', () => {
  it('says that nothing is filtered instead of naming the sort alone', () => {
    expect(summary()).toBe('Artist A–Z · All albums')
  })

  it('keeps the sort first and appends the decade', () => {
    expect(summary({ decadeLabel: '90s' })).toBe('Artist A–Z · 90s')
  })

  it('keeps the sort first and appends the genre', () => {
    expect(summary({ genreName: 'Rock' })).toBe('Artist A–Z · Rock')
  })

  it('orders sort, decade and genre in that order, whatever the argument order', () => {
    expect(summary({ genreName: 'Rock', decadeLabel: '2010s', sortLabel: 'Newest' })).toBe(
      'Newest · 2010s · Rock',
    )
  })

  it('drops the "nothing filtered" wording as soon as one filter is active', () => {
    expect(summary({ genreName: 'Rock' })).not.toContain('All albums')
  })

  it('treats an empty genre name as no genre at all', () => {
    expect(summary({ genreName: '' })).toBe('Artist A–Z · All albums')
  })

  it('treats an empty decade label as no decade at all', () => {
    expect(summary({ decadeLabel: '', genreName: 'Rock' })).toBe('Artist A–Z · Rock')
  })

  it('names a genre whose decade neighbour is missing without a stray separator', () => {
    expect(summary({ decadeLabel: undefined, genreName: 'Ambient' })).toBe('Artist A–Z · Ambient')
  })

  it('translates every part of the line, including the "nothing filtered" wording', () => {
    expect(buildFilterSummary({ sortLabel: 'Künstler A–Z', noFilterLabel: 'Alle Alben' })).toBe(
      'Künstler A–Z · Alle Alben',
    )
  })
})

describe('filterControlPresentation', () => {
  it('gives a phone the sheet and no chip rows', () => {
    expect(filterControlPresentation({ isPhone: true, albumControls: true })).toEqual({
      chips: false,
      sheet: true,
    })
  })

  it('gives anything wider the chip rows and no sheet', () => {
    expect(filterControlPresentation({ isPhone: false, albumControls: true })).toEqual({
      chips: true,
      sheet: false,
    })
  })

  it('shows neither where the album controls have no counterpart in the query', () => {
    expect(filterControlPresentation({ isPhone: true, albumControls: false })).toEqual({
      chips: false,
      sheet: false,
    })
    expect(filterControlPresentation({ isPhone: false, albumControls: false })).toEqual({
      chips: false,
      sheet: false,
    })
  })

  it('never offers both controls for the same viewport', () => {
    const both = [true, false].map((isPhone) =>
      filterControlPresentation({ isPhone, albumControls: true }),
    )

    expect(both.every((presentation) => !(presentation.chips && presentation.sheet))).toBe(true)
  })
})

describe('filterAdjustedMessageKey', () => {
  const english = (adjusted: FilterField): string =>
    getMessage('en', filterAdjustedMessageKey(adjusted))
  const german = (adjusted: FilterField): string =>
    getMessage('de', filterAdjustedMessageKey(adjusted))

  it('says the decade gave way, in both languages', () => {
    expect(english('decade')).toBe(
      'Decade filter cleared — "Recently added" covers the whole library',
    )
    expect(german('decade')).toBe(
      'Dekaden-Filter entfernt – „Kürzlich hinzugefügt" gilt für die ganze Bibliothek',
    )
  })

  it('says the sort gave way, in both languages', () => {
    expect(english('sort')).toBe('Sorted by artist — "Recently added" ignores decades')
    expect(german('sort')).toBe(
      'Nach Künstler sortiert – „Kürzlich hinzugefügt" kennt keine Dekaden',
    )
  })

  it("never explains the one field with the other field's sentence", () => {
    expect(english('decade')).not.toBe(english('sort'))
    expect(german('decade')).not.toBe(german('sort'))
  })
})
