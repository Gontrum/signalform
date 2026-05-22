import { describe, it, expect } from 'vitest'
import { shouldShowTidalWarning, mapSearchErrorMessage } from './service'
import type { SearchResultsResponse } from './types'

describe('shouldShowTidalWarning', () => {
  it('returns true when tidalAvailable is false', () => {
    const response = givenResponseWithTidalAvailable(false)

    const result = shouldShowTidalWarning(response)

    expect(result).toBe(true)
  })

  it('returns false when tidalAvailable is true', () => {
    const response = givenResponseWithTidalAvailable(true)

    const result = shouldShowTidalWarning(response)

    expect(result).toBe(false)
  })

  it('returns false when tidalAvailable is undefined', () => {
    const response = givenResponseWithTidalAvailable(undefined)

    const result = shouldShowTidalWarning(response)

    expect(result).toBe(false)
  })

  it('returns false when response is null', () => {
    const result = shouldShowTidalWarning(null)

    expect(result).toBe(false)
  })

  // === GIVEN ===

  const givenResponseWithTidalAvailable = (
    tidalAvailable: boolean | undefined,
  ): SearchResultsResponse => ({
    tracks: [],
    albums: [],
    artists: [],
    query: 'test',
    totalResults: 0,
    tidalAvailable,
  })
})

describe('mapSearchErrorMessage', () => {
  it('maps TIMEOUT_ERROR to user-friendly message', () => {
    expect(mapSearchErrorMessage({ type: 'TIMEOUT_ERROR', message: '' })).toBe(
      'Request timed out - music server may be slow',
    )
  })

  it('maps NETWORK_ERROR to user-friendly message', () => {
    expect(mapSearchErrorMessage({ type: 'NETWORK_ERROR', message: '' })).toBe(
      'Cannot connect to server',
    )
  })

  it('maps SERVER_ERROR with LMS message', () => {
    expect(
      mapSearchErrorMessage({ type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' }),
    ).toBe('Music server not reachable')
  })
})
