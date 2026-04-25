import { describe, it, expect } from 'vitest'
import { ok, err, isOk, type Result, type Track } from '@signalform/shared'

describe('Shared Types Integration - Frontend', () => {
  it('imports Result type from shared package', () => {
    const result: Result<number, string> = ok(42)
    expect(isOk(result)).toBe(true)
  })

  it('imports and uses Result helpers', () => {
    const successResult = ok(100)
    const errorResult = err('test error')

    expect(isOk(successResult)).toBe(true)
    expect(isOk(errorResult)).toBe(false)
  })

  it('imports Track type from shared package', () => {
    const track: Track = {
      id: 'test-1',
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 240,
      sources: [],
    }
    expect(track.title).toBe('Test Track')
    expect(track.duration).toBe(240)
  })
})
