import { ref, onScopeDispose, type Ref } from 'vue'

/**
 * Return type of `useTransientSet`.
 *
 * Provides a readonly reactive Set of active keys plus an `add` function
 * that inserts a key and auto-removes it after the configured duration.
 */
interface TransientSet<K extends string> {
  /** Reactive set of currently active keys. */
  readonly items: Ref<ReadonlySet<K>>
  /**
   * Add a key to the set.  It will be automatically removed after
   * `durationMs` milliseconds.  If the same key is added again before
   * it expires, the previous timer is cancelled and a fresh one starts.
   */
  readonly add: (key: K) => void
}

/**
 * Composable for transient set-based UI feedback state.
 *
 * Manages a reactive `Set<K>` where each entry auto-expires after
 * `durationMs`.  Per-key timers prevent race conditions: re-adding
 * a key resets its countdown instead of stacking duplicate timers.
 * All pending timers are cancelled when the owning scope is disposed
 * (component unmount).
 *
 * @example
 * ```ts
 * const success = useTransientSet<string>(1500)
 * const error   = useTransientSet<string>(2000)
 *
 * // In a handler:
 * if (response.ok) { success.add(albumId) }
 * else             { error.add(albumId)   }
 *
 * // In the template:
 * // <span v-if="success.items.value.has(albumId)">✓</span>
 * ```
 *
 * @param durationMs - How long each key stays in the set before auto-removal.
 * @returns A `TransientSet<K>` with reactive `items` and an `add` function.
 */
export const useTransientSet = <K extends string>(durationMs: number): TransientSet<K> => {
  const items = ref<ReadonlySet<K>>(new Set()) as Ref<ReadonlySet<K>>
  const timers = ref<Partial<Record<K, ReturnType<typeof setTimeout>>>>({})

  const add = (key: K): void => {
    // Cancel any existing timer for this key (prevents stale removal)
    const existing = timers.value[key]
    if (existing !== undefined) {
      clearTimeout(existing)
    }

    // Add the key to the reactive set
    items.value = new Set([...items.value, key])

    // Schedule removal
    const timerId = setTimeout(() => {
      const { [key]: _removedTimer, ...remainingTimers } = timers.value
      timers.value = remainingTimers
      items.value = new Set([...items.value].filter((k) => k !== key))
    }, durationMs)

    timers.value = {
      ...timers.value,
      [key]: timerId,
    }
  }

  // Clean up all pending timers when the component/scope is disposed
  onScopeDispose(() => {
    const activeTimers = Object.values(timers.value) as readonly (
      | ReturnType<typeof setTimeout>
      | undefined
    )[]

    activeTimers.forEach((timerId) => {
      if (timerId !== undefined) {
        clearTimeout(timerId)
      }
    })
    timers.value = {}
  })

  return { items, add }
}
