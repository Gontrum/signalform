import { describe, it, expect } from 'vitest'
import { WAKE_THROTTLE_MS, shouldTriggerWake } from './service'

describe('shouldTriggerWake', () => {
  it('allows the first wake when no wake has happened yet', () => {
    expect(shouldTriggerWake(0, 1_000_000)).toBe(true)
  })

  it('throttles a wake within the throttle window', () => {
    const lastWakeAt = 1_000_000

    expect(shouldTriggerWake(lastWakeAt, lastWakeAt + WAKE_THROTTLE_MS - 1)).toBe(false)
  })

  it('allows a wake exactly at the throttle boundary', () => {
    const lastWakeAt = 1_000_000

    expect(shouldTriggerWake(lastWakeAt, lastWakeAt + WAKE_THROTTLE_MS)).toBe(true)
  })

  it('allows a wake after the throttle window has passed', () => {
    const lastWakeAt = 1_000_000

    expect(shouldTriggerWake(lastWakeAt, lastWakeAt + WAKE_THROTTLE_MS + 1)).toBe(true)
  })
})
