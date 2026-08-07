/**
 * useQueueStore — the jump failure notice, in both languages.
 *
 * Own file because useQueueStore.test.ts is already 43 KB.
 *
 * The language arrives from the server config, so it can change after the
 * store exists and even after the failure has been recorded. The last case
 * here is the one that matters: it fails for any implementation that writes
 * a finished sentence into the ref at failure time.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { err } from '@signalform/shared'
import { useI18nStore } from '@/app/i18nStore'
import type { Language } from '@/types/i18n'

const { mockSubscribe, websocketOnMock, mockOnReconnect } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  websocketOnMock: vi.fn(),
  mockOnReconnect: vi.fn(),
}))

vi.mock('@/platform/api/queueApi', () => ({
  getQueue: vi.fn(),
  jumpToTrack: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  setRadioMode: vi.fn(),
  clearQueue: vi.fn(),
  removeMultipleFromQueue: vi.fn(),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): {
    readonly on: typeof websocketOnMock
    readonly subscribe: typeof mockSubscribe
    readonly onReconnect: typeof mockOnReconnect
  } => ({
    on: websocketOnMock,
    subscribe: mockSubscribe,
    onReconnect: mockOnReconnect,
  }),
}))

import { useQueueStore } from './useQueueStore'
import { jumpToTrack as apiJumpToTrack } from '@/platform/api/queueApi'

const mockJumpToTrack = vi.mocked(apiJumpToTrack)

const failedJumpIn = async (language: Language): Promise<ReturnType<typeof useQueueStore>> => {
  useI18nStore().setLanguage(language)
  const store = useQueueStore()
  await store.jumpToTrack(1)
  return store
}

describe('useQueueStore — the jump failure notice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockJumpToTrack.mockResolvedValue(err({ type: 'NETWORK_ERROR', message: 'boom' }))
  })

  it('names the failure in English', async () => {
    expect((await failedJumpIn('en')).jumpError).toBe('Failed to jump to track')
  })

  it('names the failure in German', async () => {
    expect((await failedJumpIn('de')).jumpError).toBe('Wechsel zum Titel fehlgeschlagen')
  })

  it('says nothing while the jump has not failed', async () => {
    const store = useQueueStore()

    expect(store.jumpError).toBeNull()
  })

  it('follows a language switch made after the jump already failed', async () => {
    const store = await failedJumpIn('en')
    expect(store.jumpError).toBe('Failed to jump to track')

    useI18nStore().setLanguage('de')

    expect(store.jumpError).toBe('Wechsel zum Titel fehlgeschlagen')
  })
})
