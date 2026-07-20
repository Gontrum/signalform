import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/platform/api/healthApi', () => ({
  fetchLmsHealth: vi.fn(),
}))

// Import AFTER the mock
import { useLmsHealth } from '@/domains/lms/shell/useLmsHealth'
import { fetchLmsHealth } from '@/platform/api/healthApi'

const mockFetchLmsHealth = vi.mocked(fetchLmsHealth)

const HEALTHY_INTERVAL_MS = 30_000
const DOWN_INTERVAL_MS = 15_000
const FAILING_RETRY_INTERVAL_MS = 4_000

/** Run the composable inside its own effect scope so onScopeDispose fires on stop(). */
const runInScope = (): {
  readonly scope: EffectScope
  readonly result: ReturnType<typeof useLmsHealth>
} => {
  const scope = effectScope()
  const result = scope.run(() => useLmsHealth())!
  return { scope, result }
}

describe('useLmsHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetchLmsHealth.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays up after a single failed probe', async () => {
    mockFetchLmsHealth.mockResolvedValue(null)

    const { scope, result } = runInScope()
    await flushPromises() // initial probe resolves

    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)
    expect(result.consecutiveFailures.value).toBe(1)
    expect(result.isLmsDown.value).toBe(false)

    scope.stop()
  })

  it('goes down after two consecutive failed probes', async () => {
    mockFetchLmsHealth.mockResolvedValue({ lmsConnected: false })

    const { scope, result } = runInScope()
    await flushPromises() // first probe -> 1 failure, still up

    expect(result.isLmsDown.value).toBe(false)

    // One failure already -> next probe scheduled after the fast retry interval,
    // not the 30s healthy interval, so the second failure lands quickly.
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS)

    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(2)
    expect(result.consecutiveFailures.value).toBe(2)
    expect(result.isLmsDown.value).toBe(true)

    scope.stop()
  })

  it('schedules the second probe after the fast retry interval, not the healthy one', async () => {
    mockFetchLmsHealth.mockResolvedValue(null)

    const { scope, result } = runInScope()
    await flushPromises() // first probe -> 1 failure

    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)
    expect(result.consecutiveFailures.value).toBe(1)

    // Not yet due just before the fast retry interval elapses.
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS - 1)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)

    // Second failed probe arrives ~4s in, well before the 30s healthy interval.
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(2)
    expect(result.consecutiveFailures.value).toBe(2)
    expect(result.isLmsDown.value).toBe(true)

    scope.stop()
  })

  it('uses the down interval once the banner is on, not the fast retry interval', async () => {
    mockFetchLmsHealth.mockResolvedValue({ lmsConnected: false })

    const { scope, result } = runInScope()
    await flushPromises() // 1st failure
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS) // 2nd failure -> down

    expect(result.isLmsDown.value).toBe(true)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(2)

    // Down now: the fast retry cadence no longer applies.
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(2)

    // Next probe only after the full down interval has elapsed.
    await vi.advanceTimersByTimeAsync(DOWN_INTERVAL_MS - FAILING_RETRY_INTERVAL_MS)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(3)

    scope.stop()
  })

  it('recovers and resets the counter after a successful probe', async () => {
    mockFetchLmsHealth
      .mockResolvedValueOnce({ lmsConnected: false })
      .mockResolvedValueOnce({ lmsConnected: false })
      .mockResolvedValue({ lmsConnected: true })

    const { scope, result } = runInScope()
    await flushPromises() // 1st failure
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS) // 2nd failure -> down

    expect(result.isLmsDown.value).toBe(true)

    // Down view -> next probe scheduled after the faster down interval.
    await vi.advanceTimersByTimeAsync(DOWN_INTERVAL_MS) // success

    expect(result.consecutiveFailures.value).toBe(0)
    expect(result.isLmsDown.value).toBe(false)

    scope.stop()
  })

  it('returns to the healthy interval after a successful probe resets the counter', async () => {
    mockFetchLmsHealth
      .mockResolvedValueOnce(null) // 1st failure
      .mockResolvedValue({ lmsConnected: true }) // recovers thereafter

    const { scope, result } = runInScope()
    await flushPromises() // 1st failure
    expect(result.consecutiveFailures.value).toBe(1)

    // Fast retry -> successful probe resets the counter to zero.
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS)
    expect(result.consecutiveFailures.value).toBe(0)
    const callsAfterRecovery = mockFetchLmsHealth.mock.calls.length

    // Back to healthy: no probe during the former fast-retry window...
    await vi.advanceTimersByTimeAsync(FAILING_RETRY_INTERVAL_MS)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(callsAfterRecovery)

    // ...the next probe fires only after the full 30s healthy interval.
    await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS - FAILING_RETRY_INTERVAL_MS)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(callsAfterRecovery + 1)

    scope.stop()
  })

  it('probes immediately when the document becomes visible', async () => {
    mockFetchLmsHealth.mockResolvedValue({ lmsConnected: true })

    const { scope } = runInScope()
    await flushPromises() // initial probe
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(2)

    scope.stop()
  })

  it('stops polling and removes the listener after dispose', async () => {
    mockFetchLmsHealth.mockResolvedValue({ lmsConnected: true })

    const { scope } = runInScope()
    await flushPromises() // initial probe
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)

    scope.stop()

    // No further scheduled probes after unmount.
    await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS * 3)
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)

    // The visibility listener is gone too.
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(mockFetchLmsHealth).toHaveBeenCalledTimes(1)
  })
})
