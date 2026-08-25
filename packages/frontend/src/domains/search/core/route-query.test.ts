import { describe, it, expect } from 'vitest'
import { buildSearchRouteQuery } from './route-query'

describe('buildSearchRouteQuery', () => {
  it('carries the text and marks full results when only text is set', () => {
    const query = buildSearchRouteQuery({ text: 'sting' })

    expect(query).toEqual({ q: 'sting', full: 'true' })
    expect(Object.keys(query).sort()).toEqual(['full', 'q'])
  })

  it('marks full results when only a tag is set', () => {
    const query = buildSearchRouteQuery({ text: '', tagId: 'sacd' })

    expect(query).toEqual({ tag: 'sacd', full: 'true' })
    expect(Object.keys(query).sort()).toEqual(['full', 'tag'])
  })

  it('carries both coordinates when text and tag are set', () => {
    const query = buildSearchRouteQuery({ text: 'sting', tagId: 'sacd' })

    expect(query).toEqual({ q: 'sting', tag: 'sacd', full: 'true' })
  })

  it('returns an empty query when neither text nor tag is set', () => {
    const query = buildSearchRouteQuery({ text: '' })

    expect(query).toEqual({})
    expect(Object.keys(query)).toEqual([])
  })

  it('returns an empty query for whitespace-only text without a tag', () => {
    const query = buildSearchRouteQuery({ text: '   ' })

    expect(query).toEqual({})
    expect(Object.keys(query)).toEqual([])
  })

  it('keeps the tag and full flag for whitespace-only text with a tag', () => {
    const query = buildSearchRouteQuery({ text: '  \t ', tagId: 'sacd' })

    expect(query).toEqual({ tag: 'sacd', full: 'true' })
    expect(Object.keys(query).sort()).toEqual(['full', 'tag'])
  })

  it('trims surrounding whitespace from the text', () => {
    const query = buildSearchRouteQuery({ text: '  sting  ' })

    expect(query).toEqual({ q: 'sting', full: 'true' })
  })

  it('treats an empty tag id as absent', () => {
    const query = buildSearchRouteQuery({ text: '', tagId: '' })

    expect(query).toEqual({})
    expect(Object.keys(query)).toEqual([])
  })

  it('treats an empty tag id as absent while keeping the text', () => {
    const query = buildSearchRouteQuery({ text: 'sting', tagId: '' })

    expect(query).toEqual({ q: 'sting', full: 'true' })
    expect(Object.keys(query).sort()).toEqual(['full', 'q'])
  })
})
