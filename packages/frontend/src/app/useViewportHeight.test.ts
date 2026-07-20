import { describe, it, expect, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useViewportHeight } from '@/app/useViewportHeight'

const readAppHeight = (): string => document.documentElement.style.getPropertyValue('--app-height')

describe('useViewportHeight', () => {
  let activeScopes: readonly EffectScope[] = []

  const runInScope = (fn: () => void): EffectScope => {
    const scope = effectScope()
    activeScopes = [...activeScopes, scope]
    scope.run(fn)
    return scope
  }

  afterEach(() => {
    // Stop any scopes still running so their window listeners are removed and
    // cannot leak into the next test.
    activeScopes.forEach((scope) => scope.stop())
    activeScopes = []
    vi.unstubAllGlobals()
    document.documentElement.style.removeProperty('--app-height')
  })

  it('sets --app-height to the current window.innerHeight immediately', () => {
    vi.stubGlobal('innerHeight', 812)

    runInScope(() => useViewportHeight())

    expect(readAppHeight()).toBe('812px')
  })

  it('updates --app-height when the window resizes', () => {
    vi.stubGlobal('innerHeight', 812)
    runInScope(() => useViewportHeight())

    vi.stubGlobal('innerHeight', 640)
    window.dispatchEvent(new Event('resize'))

    expect(readAppHeight()).toBe('640px')
  })

  it('updates --app-height on orientation change', () => {
    vi.stubGlobal('innerHeight', 375)
    runInScope(() => useViewportHeight())

    vi.stubGlobal('innerHeight', 812)
    window.dispatchEvent(new Event('orientationchange'))

    expect(readAppHeight()).toBe('812px')
  })

  it('stops updating once its scope is disposed', () => {
    vi.stubGlobal('innerHeight', 812)
    const scope = runInScope(() => useViewportHeight())
    expect(readAppHeight()).toBe('812px')

    scope.stop()

    vi.stubGlobal('innerHeight', 640)
    window.dispatchEvent(new Event('resize'))

    expect(readAppHeight()).toBe('812px')
  })
})
