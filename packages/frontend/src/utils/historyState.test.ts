import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getHistoryStateValue } from './historyState'

describe('getHistoryStateValue (AC5)', () => {
  // Save and restore the original history state between tests
  const originalReplaceState = window.history.replaceState.bind(window.history)

  beforeEach(() => {
    // Reset state to null before each test
    originalReplaceState(null, '')
  })

  afterEach(() => {
    originalReplaceState(null, '')
  })

  it('returns the string value when key is present in state', () => {
    originalReplaceState({ tidalArtistName: 'Bill Evans' }, '')

    const result = getHistoryStateValue('tidalArtistName')

    expect(result).toBe('Bill Evans')
  })

  it('returns undefined when key is absent from state', () => {
    originalReplaceState({ otherKey: 'something' }, '')

    const result = getHistoryStateValue('tidalArtistName')

    expect(result).toBeUndefined()
  })

  it('returns undefined when state is null', () => {
    originalReplaceState(null, '')

    const result = getHistoryStateValue('tidalArtistName')

    expect(result).toBeUndefined()
  })

  it('returns raw value when key is present but value is not a string (caller must narrow)', () => {
    originalReplaceState({ count: 42 }, '')

    const result = getHistoryStateValue('count')

    expect(result).toBe(42)
  })

  it('returns undefined when state is not an object (e.g. a number)', () => {
    // history.state can technically be any serializable value
    originalReplaceState(42, '')

    const result = getHistoryStateValue('tidalArtistName')

    expect(result).toBeUndefined()
  })
})
