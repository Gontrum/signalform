import { computed, ref, type ComputedRef } from 'vue'
import { useWebSocket } from '@/app/useWebSocket'
import type { SystemEventPayload } from '@signalform/shared'

type UseLmsHealthResult = {
  /** True while the backend has told us LMS is unreachable. */
  readonly isLmsDown: ComputedRef<boolean>
}

/**
 * Drives the global "LMS down" banner from the same `system.lmsDisconnected`/
 * `system.lmsReconnected` WebSocket events that `usePlaybackStore` already
 * consumes for `lmsError`/`isLmsDisconnected` (docs/review/06-resilience-lms.md
 * Fix 3).
 *
 * Previously this composable ran an independent, self-rescheduling
 * `GET /health` poller (30s/15s/4s intervals depending on state, plus a
 * `visibilitychange` re-probe) and only flipped `isLmsDown` after two
 * consecutive failed probes, to avoid flapping on a single transient HTTP
 * failure. That debounce is no longer needed: the backend's status poller
 * only emits `system.lmsDisconnected`/`system.lmsReconnected` once per
 * LMS-down/up transition (not per-probe), so the WS event is already a
 * debounced, authoritative signal — replicating a failure-counting threshold
 * on top of it would just add lag without adding safety. Consolidating onto
 * a single event source also guarantees this banner and the playback
 * store's LMS banner appear/disappear in the same tick, instead of
 * potentially disagreeing for a few seconds depending on independent
 * polling cadences.
 *
 * A push-based WS event does not need a pull-based "did I miss anything
 * while backgrounded" re-probe either — `useWebSocket()`'s own
 * `onReconnect` already resyncs relevant state elsewhere in the app after a
 * transport reconnect.
 *
 * Note: `useWebSocket()`'s `on()` has no unregister mechanism yet (see its
 * own doc comment) — this composable is called exactly once, from `App.vue`,
 * which lives for the app's lifetime, so that pre-existing limitation does
 * not matter in practice here (mirrors how `usePlaybackStore` registers its
 * own `system.lmsDisconnected`/`Reconnected` handlers once at store setup).
 */
export const useLmsHealth = (): UseLmsHealthResult => {
  const lmsDown = ref(false)

  const { on } = useWebSocket()

  on('system.lmsDisconnected', (_payload: SystemEventPayload) => {
    lmsDown.value = true
  })

  on('system.lmsReconnected', (_payload: SystemEventPayload) => {
    lmsDown.value = false
  })

  const isLmsDown = computed(() => lmsDown.value)

  return { isLmsDown }
}
