import { describe, it, expect } from 'vitest'
import { WAKE_THROTTLE_MS, shouldShowLmsDownBanner, shouldTriggerWake } from './service'

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

describe('shouldShowLmsDownBanner', () => {
  it('does not show the banner with no failures', () => {
    expect(shouldShowLmsDownBanner(0)).toBe(false)
  })

  it('does not show the banner after a single failure', () => {
    expect(shouldShowLmsDownBanner(1)).toBe(false)
  })

  it('shows the banner after two consecutive failures', () => {
    expect(shouldShowLmsDownBanner(2)).toBe(true)
  })

  it('shows the banner for more than two consecutive failures', () => {
    expect(shouldShowLmsDownBanner(5)).toBe(true)
  })

  it('does not show the banner for negative values', () => {
    expect(shouldShowLmsDownBanner(-1)).toBe(false)
  })

  it('does not show the banner for NaN', () => {
    expect(shouldShowLmsDownBanner(Number.NaN)).toBe(false)
  })
})
