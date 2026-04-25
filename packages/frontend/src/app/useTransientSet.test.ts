import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useTransientSet } from '@/app/useTransientSet'

describe('useTransientSet', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with an empty set', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items } = useTransientSet<string>(1500)
      expect(items.value.size).toBe(0)
    })
    scope.stop()
  })

  it('adds a key to the set', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items, add } = useTransientSet<string>(1500)
      add('album-1')
      expect(items.value.has('album-1')).toBe(true)
    })
    scope.stop()
  })

  it('removes the key after the configured duration', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items, add } = useTransientSet<string>(1500)
      add('album-1')

      vi.advanceTimersByTime(1499)
      expect(items.value.has('album-1')).toBe(true)

      vi.advanceTimersByTime(1)
      expect(items.value.has('album-1')).toBe(false)
    })
    scope.stop()
  })

  it('supports multiple concurrent keys with independent timers', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items, add } = useTransientSet<string>(1500)

      add('album-1')
      vi.advanceTimersByTime(500)
      add('album-2')

      // After 1500ms total: album-1 expires, album-2 still has 500ms left
      vi.advanceTimersByTime(1000)
      expect(items.value.has('album-1')).toBe(false)
      expect(items.value.has('album-2')).toBe(true)

      // After 2000ms total: album-2 expires too
      vi.advanceTimersByTime(500)
      expect(items.value.has('album-2')).toBe(false)
      expect(items.value.size).toBe(0)
    })
    scope.stop()
  })

  it('resets the timer when the same key is added again', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items, add } = useTransientSet<string>(1500)

      add('album-1')
      vi.advanceTimersByTime(1000)
      expect(items.value.has('album-1')).toBe(true)

      // Re-add: should reset the timer
      add('album-1')

      // Original timer would have expired at 1500ms, but re-add restarted it
      vi.advanceTimersByTime(1000)
      expect(items.value.has('album-1')).toBe(true)

      // Now it should expire at 2500ms total (1000 + 1500 from re-add)
      vi.advanceTimersByTime(500)
      expect(items.value.has('album-1')).toBe(false)
    })
    scope.stop()
  })

  it('cleans up all timers on scope dispose', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items, add } = useTransientSet<string>(1500)

      add('album-1')
      add('album-2')
      expect(items.value.size).toBe(2)
    })

    // Dispose the scope (simulates component unmount)
    scope.stop()

    // Timers should have been cancelled — advancing time should not cause errors
    vi.advanceTimersByTime(5000)
  })

  it('works with different durations for success and error sets', () => {
    const scope = effectScope()
    scope.run(() => {
      const success = useTransientSet<string>(1500)
      const error = useTransientSet<string>(2000)

      success.add('album-1')
      error.add('album-2')

      vi.advanceTimersByTime(1500)
      expect(success.items.value.has('album-1')).toBe(false)
      expect(error.items.value.has('album-2')).toBe(true)

      vi.advanceTimersByTime(500)
      expect(error.items.value.has('album-2')).toBe(false)
    })
    scope.stop()
  })

  it('has() returns false for keys never added', () => {
    const scope = effectScope()
    scope.run(() => {
      const { items } = useTransientSet<string>(1500)
      expect(items.value.has('nonexistent')).toBe(false)
    })
    scope.stop()
  })
})
