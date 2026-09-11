import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteLocationNormalized, Router } from 'vue-router'

type SavedPosition = {
  readonly top: number
  readonly queuePath: string
}

// Module scope, not component state: App.vue keys the routed component by
// path, so QueueView is destroyed on the way to a pushed screen and the
// position has to outlive the instance that recorded it.
const savedPosition = ref<SavedPosition | undefined>(undefined)

type QueueScrollMemory = {
  readonly hasSavedPosition: boolean
}

const isTabRoot = (route: RouteLocationNormalized): boolean => (route.meta.depth ?? 1) <= 1

const guardedRouters = new WeakSet<Router>()

// The pushed screen still shows the bottom navigation, so the user can leave it
// for another tab while the queue is unmounted and no component is left to drop
// the position. Landing on any tab other than the queue ends the round trip the
// position was recorded for; staying inside the pushed stack does not.
const forgetWhenAnotherTabIsReached = (router: Router): void => {
  if (guardedRouters.has(router)) {
    return
  }
  guardedRouters.add(router)

  router.afterEach((to) => {
    const saved = savedPosition.value
    if (saved !== undefined && isTabRoot(to) && to.path !== saved.queuePath) {
      savedPosition.value = undefined
    }
  })
}

export const useQueueScrollMemory = (
  container: Ref<HTMLElement | null>,
  isListRendered: () => boolean,
): QueueScrollMemory => {
  const router = useRouter()
  const queuePath = useRoute().path

  forgetWhenAnotherTabIsReached(router)

  // Read and clear: a position belongs to exactly one round trip, and a stale
  // one would keep overriding the arrival scroll for the rest of the session.
  const positionToRestore = savedPosition.value?.top
  savedPosition.value = undefined

  const hasRestored = ref(false)

  watch(
    isListRendered,
    async (isRendered) => {
      if (!isRendered || hasRestored.value || positionToRestore === undefined) {
        return
      }

      hasRestored.value = true
      await nextTick()
      container.value?.scrollTo({ top: positionToRestore })
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    // The route is already the destination here. Only a push is a round trip a
    // user comes back from; a tab switch returns to a queue they want to meet
    // at its current track, not where they left off.
    const isLeavingForAPush = !isTabRoot(router.currentRoute.value)
    savedPosition.value = isLeavingForAPush
      ? { top: container.value?.scrollTop ?? 0, queuePath }
      : undefined
  })

  return { hasSavedPosition: positionToRestore !== undefined }
}
