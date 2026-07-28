/**
 * useLmsHealth (docs/review/06-resilience-lms.md Fix 3): now driven directly
 * by the `system.lmsDisconnected`/`system.lmsReconnected` WebSocket events —
 * see the composable's own doc comment for the rationale for dropping the
 * previous independent `GET /health` poller.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

const { websocketOnMock } = vi.hoisted(() => ({
  websocketOnMock: vi.fn<(event: string, handler: (payload: unknown) => void) => void>(),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): { readonly on: typeof websocketOnMock } => ({
    on: websocketOnMock,
  }),
}))

// Import AFTER the mock
import { useLmsHealth } from '@/domains/lms/shell/useLmsHealth'

/** Run the composable inside its own effect scope so onScopeDispose fires on stop(). */
const runInScope = (): {
  readonly scope: EffectScope
  readonly result: ReturnType<typeof useLmsHealth>
} => {
  const scope = effectScope()
  const result = scope.run(() => useLmsHealth())!
  return { scope, result }
}

const emitLmsDisconnected = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.lmsDisconnected',
  )?.[1]
  handler?.({ message: 'LMS connection lost', timestamp: Date.now() })
}

const emitLmsReconnected = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.lmsReconnected',
  )?.[1]
  handler?.({ message: 'LMS connection restored', timestamp: Date.now() })
}

describe('useLmsHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    websocketOnMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with isLmsDown false', () => {
    const { scope, result } = runInScope()

    expect(result.isLmsDown.value).toBe(false)

    scope.stop()
  })

  it('registers handlers for system.lmsDisconnected and system.lmsReconnected', () => {
    const { scope } = runInScope()

    const registeredEvents = websocketOnMock.mock.calls.map(([event]) => event)
    expect(registeredEvents).toContain('system.lmsDisconnected')
    expect(registeredEvents).toContain('system.lmsReconnected')

    scope.stop()
  })

  it('becomes true when system.lmsDisconnected fires', () => {
    const { scope, result } = runInScope()

    emitLmsDisconnected()

    expect(result.isLmsDown.value).toBe(true)

    scope.stop()
  })

  it('becomes false again when system.lmsReconnected fires', () => {
    const { scope, result } = runInScope()

    emitLmsDisconnected()
    expect(result.isLmsDown.value).toBe(true)

    emitLmsReconnected()
    expect(result.isLmsDown.value).toBe(false)

    scope.stop()
  })

  it('does not poll: advancing timers with no WS event does not change state', async () => {
    const { scope, result } = runInScope()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(result.isLmsDown.value).toBe(false)
    // No HTTP-health-probe timers were ever scheduled — only the two
    // WS event handlers were registered, nothing else runs on a timer.
    expect(websocketOnMock).toHaveBeenCalledTimes(2)

    scope.stop()
  })

  it('does not flap back to false on its own after a disconnect, absent a reconnect event or further timer activity', async () => {
    const { scope, result } = runInScope()

    emitLmsDisconnected()
    expect(result.isLmsDown.value).toBe(true)

    await vi.advanceTimersByTimeAsync(120_000)

    expect(result.isLmsDown.value).toBe(true)

    scope.stop()
  })

  it('disposing the owning scope does not throw (no unregister mechanism yet on useWebSocket — pre-existing limitation, not made worse here)', () => {
    const { scope } = runInScope()

    expect(() => scope.stop()).not.toThrow()
  })
})
