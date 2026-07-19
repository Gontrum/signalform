import { computed, onMounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { getSleepTimer, setSleepTimer } from '@/platform/api/sleepTimerApi'

type UseSleepTimerResult = {
  readonly remainingSeconds: Ref<number>
  readonly isActive: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
  readonly setTimer: (minutes: number) => Promise<void>
  readonly cancel: () => Promise<void>
}

// ponytail: The server is the single source of truth for the sleep timer. We do
// NOT run a client-side per-second countdown; we only show the remainingSeconds
// value returned by the server and re-fetch it after every set/cancel. A local
// countdown could be added later if ever desired, but is intentionally omitted.
export const useSleepTimer = (): UseSleepTimerResult => {
  const remainingSeconds = ref(0)
  const isActive = computed(() => remainingSeconds.value > 0)

  const refresh = async (): Promise<void> => {
    const result = await getSleepTimer()
    if (result.ok) {
      remainingSeconds.value = result.value
    }
    // On error we intentionally keep the previous value and do not crash.
  }

  const setTimer = async (minutes: number): Promise<void> => {
    const result = await setSleepTimer(minutes * 60)
    if (result.ok) {
      await refresh()
    }
  }

  const cancel = async (): Promise<void> => {
    const result = await setSleepTimer(0)
    if (result.ok) {
      await refresh()
    }
  }

  onMounted(() => {
    void refresh()
  })

  return {
    remainingSeconds,
    isActive,
    refresh,
    setTimer,
    cancel,
  }
}
