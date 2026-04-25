import { describe, it, expect } from 'vitest'
import { rankByRelevance } from './searchRanking'

describe('rankByRelevance', () => {
  it('ranks title-matching items above non-title-matching items', () => {
    const items = [
      { title: 'Unrelated Song', id: 1 },
      { title: 'Opel Gang', id: 2 },
    ]
    const result = rankByRelevance('opel gang', items, (t) => t.title)
    expect(result[0]).toEqual({ title: 'Opel Gang', id: 2 })
    expect(result[1]).toEqual({ title: 'Unrelated Song', id: 1 })
  })

  it('is case-insensitive (lowercase query matches uppercase title)', () => {
    const items = [
      { title: 'UNRELATED', id: 1 },
      { title: 'OPEL GANG', id: 2 },
    ]
    const result = rankByRelevance('opel gang', items, (t) => t.title)
    expect(result[0]).toEqual({ title: 'OPEL GANG', id: 2 })
    expect(result[1]).toEqual({ title: 'UNRELATED', id: 1 })
  })

  it('preserves original order for items with equal scores (stable sort)', () => {
    const items = [
      { title: 'Alpha', id: 1 },
      { title: 'Beta', id: 2 },
      { title: 'Gamma', id: 3 },
    ]
    const result = rankByRelevance('xyz', items, (t) => t.title)
    expect(result).toEqual([
      { title: 'Alpha', id: 1 },
      { title: 'Beta', id: 2 },
      { title: 'Gamma', id: 3 },
    ])
  })

  it('returns empty array for empty input', () => {
    const result = rankByRelevance<{ readonly title: string }>('test', [], (t) => t.title)
    expect(result).toEqual([])
  })

  it('normalizes hyphens to spaces so "opel gang" matches "Opel-Gang"', () => {
    const items = [
      { title: 'Other Album', id: 1 },
      { title: 'Opel-Gang', id: 2 },
    ]
    const result = rankByRelevance('opel gang', items, (t) => t.title)
    expect(result[0]).toEqual({ title: 'Opel-Gang', id: 2 })
    expect(result[1]).toEqual({ title: 'Other Album', id: 1 })
  })

  it('preserves original order when query matches nothing', () => {
    const items = [
      { title: 'Track A', id: 1 },
      { title: 'Track B', id: 2 },
    ]
    const result = rankByRelevance('zzz', items, (t) => t.title)
    expect(result).toEqual(items)
  })

  it('preserves original order when query matches all titles', () => {
    const items = [
      { title: 'Pink Floyd Track 1', id: 1 },
      { title: 'Pink Floyd Track 2', id: 2 },
      { title: 'Pink Floyd Track 3', id: 3 },
    ]
    const result = rankByRelevance('pink floyd', items, (t) => t.title)
    expect(result).toEqual(items)
  })
})
