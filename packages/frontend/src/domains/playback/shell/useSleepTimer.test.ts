import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { ok, err } from '@signalform/shared'

vi.mock('@/platform/api/sleepTimerApi', () => ({
  setSleepTimer: vi.fn(),
  getSleepTimer: vi.fn(),
}))

// Import AFTER mocks
import { useSleepTimer } from '@/domains/playback/shell/useSleepTimer'
import { setSleepTimer, getSleepTimer } from '@/platform/api/sleepTimerApi'

const mockSetSleepTimer = vi.mocked(setSleepTimer)
const mockGetSleepTimer = vi.mocked(getSleepTimer)

const networkError = {
  type: 'NETWORK_ERROR',
  message: 'boom',
} as const

const mountComposable = async (): Promise<{
  readonly result: ReturnType<typeof useSleepTimer>
}> => {
  let result: ReturnType<typeof useSleepTimer> | undefined
  const TestComponent = defineComponent({
    setup(): () => VNode {
      result = useSleepTimer()
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  // setup() runs synchronously on mount, so result is always assigned here.
  return { result: result! }
}

describe('useSleepTimer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSleepTimer.mockResolvedValue(ok(0))
    mockSetSleepTimer.mockResolvedValue(ok(undefined))
  })

  it('refreshes on mount and reflects remainingSeconds in isActive', async () => {
    mockGetSleepTimer.mockResolvedValue(ok(1800))

    const { result } = await mountComposable()

    expect(mockGetSleepTimer).toHaveBeenCalled()
    expect(result.remainingSeconds.value).toBe(1800)
    expect(result.isActive.value).toBe(true)
  })

  it('isActive is false when remainingSeconds is 0', async () => {
    mockGetSleepTimer.mockResolvedValue(ok(0))

    const { result } = await mountComposable()

    expect(result.remainingSeconds.value).toBe(0)
    expect(result.isActive.value).toBe(false)
  })

  it('setTimer(30) calls setSleepTimer(1800) then refreshes', async () => {
    const { result } = await mountComposable()
    mockGetSleepTimer.mockClear()
    mockGetSleepTimer.mockResolvedValue(ok(1800))

    await result.setTimer(30)

    expect(mockSetSleepTimer).toHaveBeenCalledWith(1800)
    expect(mockGetSleepTimer).toHaveBeenCalledTimes(1)
    expect(result.remainingSeconds.value).toBe(1800)
  })

  it('does not refresh when setTimer fails', async () => {
    mockSetSleepTimer.mockResolvedValue(err(networkError))
    const { result } = await mountComposable()
    mockGetSleepTimer.mockClear()

    await result.setTimer(30)

    expect(mockSetSleepTimer).toHaveBeenCalledWith(1800)
    expect(mockGetSleepTimer).not.toHaveBeenCalled()
  })

  it('cancel() calls setSleepTimer(0) then refreshes', async () => {
    const { result } = await mountComposable()
    mockGetSleepTimer.mockClear()
    mockGetSleepTimer.mockResolvedValue(ok(0))

    await result.cancel()

    expect(mockSetSleepTimer).toHaveBeenCalledWith(0)
    expect(mockGetSleepTimer).toHaveBeenCalledTimes(1)
    expect(result.remainingSeconds.value).toBe(0)
  })

  it('does not crash and keeps the previous value when getSleepTimer errors', async () => {
    mockGetSleepTimer.mockResolvedValue(err(networkError))

    const { result } = await mountComposable()

    expect(result.remainingSeconds.value).toBe(0)
    expect(result.isActive.value).toBe(false)

    // A later successful refresh still updates the value.
    mockGetSleepTimer.mockResolvedValue(ok(600))
    await result.refresh()
    expect(result.remainingSeconds.value).toBe(600)
  })
})
