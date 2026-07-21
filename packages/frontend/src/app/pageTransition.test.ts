import { describe, it, expect } from 'vitest'
import { getTransitionName } from './pageTransition'

describe('getTransitionName', () => {
  it('returns "push" when navigating to a deeper route', () => {
    expect(getTransitionName(1, 2)).toBe('push')
  })

  it('returns "pop" when navigating to a shallower route', () => {
    expect(getTransitionName(2, 1)).toBe('pop')
  })

  it('returns "" when navigating between routes at the same depth', () => {
    expect(getTransitionName(1, 1)).toBe('')
  })

  it('returns "" when the from depth is undefined', () => {
    expect(getTransitionName(undefined, 2)).toBe('')
  })

  it('returns "" when the to depth is undefined', () => {
    expect(getTransitionName(1, undefined)).toBe('')
  })

  it('returns "" when both depths are undefined', () => {
    expect(getTransitionName(undefined, undefined)).toBe('')
  })
})
