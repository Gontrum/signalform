/**
 * usePlaybackStore — the two connectivity banners, in both languages.
 *
 * Own file because usePlaybackStore.test.ts is already 23 KB.
 *
 * Both messages are produced by a WS event, and the language arrives from the
 * server config independently of it — so the switch-after-the-event cases are
 * the load-bearing ones: they fail for any implementation that writes a
 * finished sentence into the ref when the event lands.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useI18nStore } from '@/app/i18nStore'
import type { Language } from '@/types/i18n'

const { mockSubscribe, websocketOnMock, mockOnReconnect } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  websocketOnMock: vi.fn<(event: string, handler: (payload: unknown) => void) => void>(),
  mockOnReconnect: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playTrack: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  setVolume: vi.fn(),
  getVolume: vi.fn(),
  seek: vi.fn(),
  getCurrentTime: vi.fn(),
  getPlaybackStatus: vi.fn(),
  setShuffleMode: vi.fn(),
  setRepeatMode: vi.fn(),
}))

vi.mock('@/app/useWebSocket', async () => {
  const { ref } = await import('vue')
  return {
    useWebSocket: (): {
      readonly on: typeof websocketOnMock
      readonly subscribe: typeof mockSubscribe
      readonly onReconnect: typeof mockOnReconnect
      readonly connectionState: ReturnType<typeof ref<string>>
    } => ({
      on: websocketOnMock,
      subscribe: mockSubscribe,
      onReconnect: mockOnReconnect,
      connectionState: ref('connected'),
    }),
  }
})

import { usePlaybackStore } from './usePlaybackStore'
import { getPlaybackStatus } from '@/platform/api/playbackApi'

const emit = (event: string): void => {
  const handler = websocketOnMock.mock.calls.find(([name]) => name === event)?.[1]
  handler?.({ message: 'irrelevant', timestamp: Date.now() })
}

const storeAfter = (language: Language, event: string): ReturnType<typeof usePlaybackStore> => {
  useI18nStore().setLanguage(language)
  const store = usePlaybackStore()
  emit(event)
  return store
}

describe('usePlaybackStore — the LMS outage banner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      ok: false,
      error: { type: 'NETWORK_ERROR', message: 'ECONNREFUSED' },
    })
  })

  it('names the outage in English', () => {
    expect(storeAfter('en', 'system.lmsDisconnected').lmsError).toBe(
      'Cannot connect to music server',
    )
  })

  it('names the outage in German', () => {
    expect(storeAfter('de', 'system.lmsDisconnected').lmsError).toBe(
      'Keine Verbindung zum Musikserver',
    )
  })

  it('says nothing while the server is reachable', () => {
    expect(usePlaybackStore().lmsError).toBeNull()
  })

  it('follows a language switch made after the outage was reported', () => {
    const store = storeAfter('en', 'system.lmsDisconnected')
    expect(store.lmsError).toBe('Cannot connect to music server')

    useI18nStore().setLanguage('de')

    expect(store.lmsError).toBe('Keine Verbindung zum Musikserver')
  })
})

describe('usePlaybackStore — the speaker disconnect banner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(getPlaybackStatus).mockResolvedValue({
      ok: false,
      error: { type: 'NETWORK_ERROR', message: 'ECONNREFUSED' },
    })
  })

  it('names the disconnect in English', () => {
    expect(storeAfter('en', 'system.playerDisconnected').playerError).toBe(
      'Speaker lost connection to server',
    )
  })

  it('names the disconnect in German', () => {
    expect(storeAfter('de', 'system.playerDisconnected').playerError).toBe(
      'Lautsprecher hat die Verbindung zum Server verloren',
    )
  })

  // playerAlert is what the banner reads; the sibling branch of that same
  // computed was already translated when this one was not.
  it('hands the translated disconnect message to playerAlert, not just to playerError', () => {
    expect(storeAfter('de', 'system.playerDisconnected').playerAlert).toBe(
      'Lautsprecher hat die Verbindung zum Server verloren',
    )
  })

  it('follows a language switch made after the disconnect was reported', () => {
    const store = storeAfter('en', 'system.playerDisconnected')
    expect(store.playerError).toBe('Speaker lost connection to server')

    useI18nStore().setLanguage('de')

    expect(store.playerError).toBe('Lautsprecher hat die Verbindung zum Server verloren')
  })
})
