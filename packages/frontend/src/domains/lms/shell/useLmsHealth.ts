import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import { fetchLmsHealth } from '@/platform/api/healthApi'
import { shouldShowLmsDownBanner } from '@/domains/lms/core/service'

/** Poll interval while the LMS is reachable. */
const HEALTHY_POLL_INTERVAL_MS = 30_000
/** Faster poll interval while the LMS is down, so recovery is noticed quickly. */
const DOWN_POLL_INTERVAL_MS = 15_000

type UseLmsHealthResult = {
  /** True once the LMS has failed enough consecutive probes (see core). */
  readonly isLmsDown: ComputedRef<boolean>
  /** Exposed for tests; number of consecutive failed probes. */
  readonly consecutiveFailures: Ref<number>
}

/**
 * Continuously probes backend health to drive the global "LMS down" banner.
 *
 * A probe counts as a failure when {@link fetchLmsHealth} returns `null`
 * (network error / unparseable body) or reports `lmsConnected === false`.
 * A successful probe resets the failure counter to zero. The banner threshold
 * itself lives in the functional core (`shouldShowLmsDownBanner`).
 *
 * Polling runs immediately on activation, then on a self-rescheduling timer:
 * every 30s while healthy, every 15s while down. Overlapping requests are
 * skipped via an in-flight guard, and a probe fires immediately whenever the
 * document becomes visible again. All timers and listeners are torn down when
 * the owning scope is disposed (component unmount).
 */
export const useLmsHealth = (): UseLmsHealthResult => {
  const consecutiveFailures = ref(0)
  const isLmsDown = computed(() => shouldShowLmsDownBanner(consecutiveFailures.value))

  const timeoutId = ref<ReturnType<typeof setTimeout> | null>(null)
  const isProbing = ref(false)
  const disposed = ref(false)

  const probe = async (): Promise<void> => {
    // Skip if a probe is already in flight — never stack parallel requests.
    if (isProbing.value) {
      return
    }
    isProbing.value = true
    try {
      const result = await fetchLmsHealth()
      if (result !== null && result.lmsConnected) {
        consecutiveFailures.value = 0
      } else {
        consecutiveFailures.value += 1
      }
    } finally {
      isProbing.value = false
    }
  }

  const clearPending = (): void => {
    if (timeoutId.value !== null) {
      clearTimeout(timeoutId.value)
      timeoutId.value = null
    }
  }

  const scheduleNext = (): void => {
    if (disposed.value) {
      return
    }
    const delay = isLmsDown.value ? DOWN_POLL_INTERVAL_MS : HEALTHY_POLL_INTERVAL_MS
    timeoutId.value = setTimeout(() => void tick(), delay)
  }

  const tick = async (): Promise<void> => {
    await probe()
    scheduleNext()
  }

  const probeNow = (): void => {
    clearPending()
    void tick()
  }

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      probeNow()
    }
  }

  // Probe immediately on activation, then let the timer take over.
  void tick()
  document.addEventListener('visibilitychange', handleVisibilityChange)

  onScopeDispose(() => {
    disposed.value = true
    clearPending()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { isLmsDown, consecutiveFailures }
}
