import { describe, expect, it } from 'vitest'
import { shouldServeDevServiceWorkerRecovery } from '../../vite.config'

describe('shouldServeDevServiceWorkerRecovery', () => {
  it('returns true when dev PWA is disabled', () => {
    expect(shouldServeDevServiceWorkerRecovery(false)).toBe(true)
  })

  it('returns false when dev PWA is enabled', () => {
    expect(shouldServeDevServiceWorkerRecovery(true)).toBe(false)
  })
})
