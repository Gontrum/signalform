import { describe, expect, it } from 'vitest'
import {
  DEV_SERVICE_WORKER_RECOVERY_SCRIPT,
  shouldServeDevServiceWorkerRecovery,
} from '../../vite.config'

describe('shouldServeDevServiceWorkerRecovery', () => {
  it('returns true when dev PWA is disabled', () => {
    expect(shouldServeDevServiceWorkerRecovery(false)).toBe(true)
  })

  it('returns false when dev PWA is enabled', () => {
    expect(shouldServeDevServiceWorkerRecovery(true)).toBe(false)
  })
})

describe('DEV_SERVICE_WORKER_RECOVERY_SCRIPT', () => {
  it('claims uncontrolled clients before navigating them', () => {
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain('await self.clients.claim()')
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain('includeUncontrolled: true')
  })

  it('navigates offline pages back to the app root', () => {
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain("url.pathname === '/offline.html'")
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain("url.origin + '/'")
  })
})
