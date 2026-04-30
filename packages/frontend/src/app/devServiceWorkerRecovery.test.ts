import { describe, expect, it, vi } from 'vitest'
import {
  clearDevServiceWorkerState,
  isLocalDevOrigin,
  recoverLocalDevServiceWorkers,
} from './devServiceWorkerRecovery'

describe('devServiceWorkerRecovery', () => {
  it('recognizes the local dev origin', () => {
    expect(isLocalDevOrigin({ hostname: 'localhost', port: '3000' })).toBe(true)
    expect(isLocalDevOrigin({ hostname: '127.0.0.1', port: '3000' })).toBe(true)
    expect(isLocalDevOrigin({ hostname: 'localhost', port: '4173' })).toBe(false)
    expect(isLocalDevOrigin({ hostname: 'signalform.local', port: '3000' })).toBe(false)
  })

  it('clears service worker registrations and caches', async () => {
    const unregister = vi.fn().mockResolvedValue(true)
    const deleteCache = vi.fn().mockResolvedValue(true)

    const changed = await clearDevServiceWorkerState({
      hostname: 'localhost',
      port: '3000',
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }, { unregister }] as const),
      },
      caches: {
        keys: vi.fn().mockResolvedValue(['a', 'b'] as const),
        delete: deleteCache,
      },
    })

    expect(changed).toBe(true)
    expect(unregister).toHaveBeenCalledTimes(2)
    expect(deleteCache).toHaveBeenCalledTimes(2)
    expect(deleteCache).toHaveBeenCalledWith('a')
    expect(deleteCache).toHaveBeenCalledWith('b')
  })

  it('does nothing outside local dev hosts', async () => {
    const getRegistrations = vi.fn()
    const cacheKeys = vi.fn()

    const changed = await recoverLocalDevServiceWorkers({
      hostname: 'app.signalform.dev',
      port: '3000',
      serviceWorker: {
        getRegistrations,
      },
      caches: {
        keys: cacheKeys,
        delete: vi.fn(),
      },
    })

    expect(changed).toBe(false)
    expect(getRegistrations).not.toHaveBeenCalled()
    expect(cacheKeys).not.toHaveBeenCalled()
  })

  it('prefers the recovery service worker when stale local dev state exists', async () => {
    const register = vi.fn().mockResolvedValue({ unregister: vi.fn() })

    const changed = await recoverLocalDevServiceWorkers({
      hostname: 'localhost',
      port: '3000',
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: vi.fn() }] as const),
        register,
      },
      caches: {
        keys: vi.fn().mockResolvedValue([] as const),
        delete: vi.fn(),
      },
    })

    expect(changed).toBe(true)
    expect(register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('falls back to clearing state when recovery worker registration fails', async () => {
    const unregister = vi.fn().mockResolvedValue(true)
    const deleteCache = vi.fn().mockResolvedValue(true)

    const changed = await recoverLocalDevServiceWorkers({
      hostname: 'localhost',
      port: '3000',
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }] as const),
        register: vi.fn().mockRejectedValue(new Error('register failed')),
      },
      caches: {
        keys: vi.fn().mockResolvedValue(['runtime-cache'] as const),
        delete: deleteCache,
      },
    })

    expect(changed).toBe(true)
    expect(unregister).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith('runtime-cache')
  })
})
