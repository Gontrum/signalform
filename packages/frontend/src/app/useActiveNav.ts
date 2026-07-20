import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'

interface ActiveNav {
  readonly isSearch: ComputedRef<boolean>
  readonly isLibrary: ComputedRef<boolean>
  readonly isQueue: ComputedRef<boolean>
  readonly isSettings: ComputedRef<boolean>
}

/**
 * Composable exposing which primary navigation destination is active for the
 * current route. Search is the fallback for any path that is not library,
 * queue or settings (including nested paths like `/library/...`).
 *
 * @returns {ActiveNav} Reactive active-destination flags
 */
export const useActiveNav = (): ActiveNav => {
  const route = useRoute()

  const isLibrary = computed(() => route.path.startsWith('/library'))
  const isQueue = computed(() => route.path.startsWith('/queue'))
  const isSettings = computed(() => route.path.startsWith('/settings'))
  const isSearch = computed(() => !isLibrary.value && !isQueue.value && !isSettings.value)

  return {
    isSearch,
    isLibrary,
    isQueue,
    isSettings,
  }
}
