import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'

// Module scope, not component state: App.vue keys the routed component by
// path, so QueueView is destroyed on the way to a pushed screen and the
// position has to outlive the instance that recorded it.
const savedScrollTop = ref(0)

type QueueScrollMemory = {
  readonly hasSavedPosition: boolean
}

export const useQueueScrollMemory = (
  container: Ref<HTMLElement | null>,
  isListRendered: () => boolean,
): QueueScrollMemory => {
  const router = useRouter()

  // Read and clear: a position belongs to exactly one round trip, and a stale
  // one would keep overriding the arrival scroll for the rest of the session.
  const positionToRestore = savedScrollTop.value
  savedScrollTop.value = 0

  const hasRestored = ref(false)

  watch(
    isListRendered,
    async (isRendered) => {
      if (!isRendered || hasRestored.value || positionToRestore === 0) {
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
    const isLeavingForAPush = (router.currentRoute.value.meta.depth ?? 1) > 1
    savedScrollTop.value = isLeavingForAPush ? (container.value?.scrollTop ?? 0) : 0
  })

  return { hasSavedPosition: positionToRestore > 0 }
}
