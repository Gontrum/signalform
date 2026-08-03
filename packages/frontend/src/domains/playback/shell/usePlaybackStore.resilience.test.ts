/**
 * Reproduction tests for docs/review/06-resilience-lms.md.
 *
 * Demonstrates the gap between two distinct failure modes that both look
 * like "the connection to LMS is broken" from the user's chair, but are
 * handled completely differently by the store:
 *
 *  - LMS-down (backend -> LMS unreachable): surfaced via the
 *    'system.lmsDisconnected' WS event -> lmsError is set -> banner shows.
 *  - Transport-down (browser -> backend Socket.IO disconnects, e.g. a
 *    client-side WiFi drop): the composable's `connectionState` flips to
 *    'disconnected'/'reconnecting', but the store never reads
 *    `connectionState` (it only destructures `on`, `subscribe`,
 *    `onReconnect` — see usePlaybackStore.ts:272). No state changes, so
 *    nothing in the UI reflects it: playback looks exactly as it did the
 *    instant before the drop, frozen and unannounced, for as long as the
 *    WiFi is down.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { err } from '@signalform/shared'
import type { Ref } from 'vue'

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

const { mockSubscribe, websocketOnMock, mockOnReconnect } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  websocketOnMock: vi.fn<(event: string, handler: (payload: unknown) => void) => void>(),
  mockOnReconnect: vi.fn<(callback: () => void) => void>(),
}))

// vi.hoisted() runs before ESM imports are initialized, so it cannot call
// Vue's `ref()` directly (that would throw "Cannot access '__vi_import_1__'
// before initialization"). A plain module-level `let` doesn't work either —
// vi.mock() is physically hoisted above it, so referencing it from inside
// the factory throws "Cannot access before initialization" at runtime. The
// vi.hoisted() box below is Vitest's documented escape hatch for exactly
// this: a value shared between a hoisted mock factory and the rest of the
// file. The `@/app/useWebSocket` mock factory further down fills `.value`
// with a *real* Vue ref once Vue's module has actually loaded (it cannot be
// created here, for the same TDZ reason as above).
//
// This now matters because the store returns `connectionState` directly in
// its `return { ... }` block: Pinia only auto-unwraps genuine Refs (see
// `isRef(prop)` in pinia's `createSetupStore`); a plain `{ value }`
// look-alike would leave `store.connectionState` as a nested reactive
// wrapper object instead of the plain string, breaking `.toBe('disconnected')`
// style assertions. `.value` is deliberately mutable — assigned exactly
// once, from inside the mock factory below, to smuggle a lazily-created
// Vue ref out of it.
// eslint-disable-next-line functional/prefer-readonly-type
const connectionStateBox = vi.hoisted<{ value: Ref<ConnectionState> | undefined }>(() => ({
  value: undefined,
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
}))

// Mirrors the real useWebSocket() shape, including `connectionState`, so the
// test can flip transport state independently of anything the store reads.
vi.mock('@/app/useWebSocket', async () => {
  const { ref } = await import('vue')
  connectionStateBox.value = ref<ConnectionState>('connected')
  const initializedConnectionStateRef = connectionStateBox.value

  return {
    useWebSocket: (): {
      readonly on: typeof websocketOnMock
      readonly subscribe: typeof mockSubscribe
      readonly onReconnect: typeof mockOnReconnect
      readonly connectionState: typeof initializedConnectionStateRef
    } => ({
      on: websocketOnMock,
      subscribe: mockSubscribe,
      onReconnect: mockOnReconnect,
      connectionState: initializedConnectionStateRef,
    }),
  }
})

vi.mock('@/utils/runtimeUrls', () => ({
  getApiUrl: (path: string): string => `http://localhost:3001${path}`,
}))

import { usePlaybackStore } from './usePlaybackStore'
import { useI18nStore } from '@/app/i18nStore'
import { getPlaybackStatus } from '@/platform/api/playbackApi'

const mockGetPlaybackStatus = vi.mocked(getPlaybackStatus)

// The real Vue ref is created inside the (lazily-invoked) `@/app/useWebSocket`
// mock factory above — resolved by the time this module finishes evaluating,
// since the `usePlaybackStore` import above transitively imports the mocked
// module. The non-null assertion is safe (not a type-narrowing `as` cast):
// by this point in module evaluation the factory has always already run.
const connectionState: Ref<ConnectionState> = connectionStateBox.value!

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  connectionState.value = 'connected'
  mockGetPlaybackStatus.mockResolvedValue(err({ type: 'NETWORK_ERROR', message: 'ECONNREFUSED' }))
})

const emitStatusChanged = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'player.statusChanged',
  )?.[1]
  handler?.({
    playerId: 'player-1',
    status: 'playing',
    currentTime: 42,
    timestamp: Date.now(),
    currentTrack: {
      id: '1',
      title: 'Money',
      artist: 'Pink Floyd',
      album: 'Dark Side',
      duration: 380,
      sources: [{ url: 'file:///money.flac', source: 'local' }],
    },
    queuePreview: [],
  })
}

const emitSystemLmsDisconnected = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.lmsDisconnected',
  )?.[1]
  handler?.({ message: 'LMS connection lost', timestamp: Date.now() })
}

const emitSystemPlayerDisconnected = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.playerDisconnected',
  )?.[1]
  handler?.({ message: 'Player connection lost', timestamp: Date.now() })
}

const emitSystemPlayerReconnected = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.playerReconnected',
  )?.[1]
  handler?.({ message: 'Player connection restored', timestamp: Date.now() })
}

const emitSystemLmsReconnected = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.lmsReconnected',
  )?.[1]
  handler?.({ message: 'LMS connection restored', timestamp: Date.now() })
}

const emitSystemPlayerStatusUnavailable = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.playerStatusUnavailable',
  )?.[1]
  handler?.({ message: 'Player is not answering', timestamp: Date.now() })
}

const emitSystemPlayerStatusRestored = (): void => {
  const handler = websocketOnMock.mock.calls.find(
    ([event]) => event === 'system.playerStatusRestored',
  )?.[1]
  handler?.({ message: 'Player is answering again', timestamp: Date.now() })
}

const PLAYER_NOT_ANSWERING =
  'Speaker is not answering — the music server is reachable, so check the speaker'

describe('resilience: transport disconnect vs LMS-down (docs/review/06-resilience-lms.md)', () => {
  it('REPRO: a Socket.IO transport drop leaves store state and error flags completely unchanged', () => {
    const store = usePlaybackStore()
    emitStatusChanged()

    expect(store.isPlaying).toBe(true)
    expect(store.currentTrack?.title).toBe('Money')
    expect(store.hasError).toBe(false)
    expect(store.isLmsDisconnected).toBe(false)

    // Simulate what useWebSocket.ts does internally on the socket's
    // 'disconnect' event (see app/useWebSocket.ts:48-50) and on
    // 'reconnect_attempt' (line 55-57). Nothing in usePlaybackStore.ts
    // reads `connectionState`, so this must be a no-op for every flag
    // the UI actually renders.
    connectionState.value = 'disconnected'
    connectionState.value = 'reconnecting'

    // Store looks exactly as it did the instant before the drop: still
    // "playing Money", no error, no lmsError. A user staring at
    // NowPlayingPanel during a WiFi outage sees a confident, frozen UI
    // with zero indication anything is wrong.
    expect(store.isPlaying).toBe(true)
    expect(store.currentTrack?.title).toBe('Money')
    expect(store.hasError).toBe(false)
    expect(store.isLmsDisconnected).toBe(false)
  })

  it('control case: a real LMS outage (system.lmsDisconnected) DOES set lmsError and surface the banner condition', () => {
    const store = usePlaybackStore()
    emitStatusChanged()

    emitSystemLmsDisconnected()

    expect(store.isLmsDisconnected).toBe(true)
    expect(store.lmsError).toBe('Cannot connect to music server')
  })

  it('control case: a player disconnect (system.playerDisconnected) sets playerError/isPlayerDisconnected without touching lmsError', () => {
    const store = usePlaybackStore()
    emitStatusChanged()

    emitSystemPlayerDisconnected()

    expect(store.isPlayerDisconnected).toBe(true)
    expect(store.playerError).toBe('Speaker lost connection to server')
    // Distinct root cause — must not overload/reuse the LMS-server-down flag.
    expect(store.isLmsDisconnected).toBe(false)
    expect(store.lmsError).toBeNull()
  })

  it('control case: system.playerReconnected clears playerError/isPlayerDisconnected and resyncs playback state', async () => {
    const store = usePlaybackStore()
    emitStatusChanged()
    emitSystemPlayerDisconnected()
    expect(store.isPlayerDisconnected).toBe(true)

    mockGetPlaybackStatus.mockResolvedValueOnce(
      err({ type: 'NETWORK_ERROR', message: 'ECONNREFUSED' }),
    )
    emitSystemPlayerReconnected()
    await flushPromises()

    expect(store.isPlayerDisconnected).toBe(false)
    expect(store.playerError).toBeNull()
  })

  it('FIX: store.connectionState reflects the WebSocket composable connectionState, so a transport drop is now visible', () => {
    const store = usePlaybackStore()

    expect(store.connectionState).toBe('connected')

    connectionState.value = 'disconnected'
    expect(store.connectionState).toBe('disconnected')

    connectionState.value = 'reconnecting'
    expect(store.connectionState).toBe('reconnecting')

    connectionState.value = 'connected'
    expect(store.connectionState).toBe('connected')
  })

  it('FIX regression guard: exposing connectionState does not affect the other flags — a transport drop still leaves isPlaying/currentTrack/hasError/isLmsDisconnected unchanged', () => {
    const store = usePlaybackStore()
    emitStatusChanged()

    connectionState.value = 'disconnected'
    connectionState.value = 'reconnecting'

    expect(store.isPlaying).toBe(true)
    expect(store.currentTrack?.title).toBe('Money')
    expect(store.hasError).toBe(false)
    expect(store.isLmsDisconnected).toBe(false)
  })
})

/**
 * The speaker being off used to be reported as "LMS unreachable": the status
 * command blocks until it times out while the server keeps answering. The
 * backend now probes the server on the edge into failure and says which of the
 * two is gone (system.playerStatusUnavailable / system.playerStatusRestored).
 */
describe('resilience: speaker not answering vs LMS unreachable', () => {
  it('system.playerStatusUnavailable surfaces the speaker message without claiming the server is gone', () => {
    const store = usePlaybackStore()

    emitSystemPlayerStatusUnavailable()

    expect(store.playerAlert).toBe(PLAYER_NOT_ANSWERING)
    expect(store.hasPlayerAlert).toBe(true)
    expect(store.isLmsDisconnected).toBe(false)
    expect(store.lmsError).toBeNull()
  })

  it('system.playerStatusRestored retracts the speaker message', async () => {
    const store = usePlaybackStore()
    emitSystemPlayerStatusUnavailable()
    expect(store.hasPlayerAlert).toBe(true)

    emitSystemPlayerStatusRestored()
    await flushPromises()

    expect(store.playerAlert).toBeNull()
    expect(store.hasPlayerAlert).toBe(false)
  })

  it('translates the speaker message on language change instead of freezing the wording of the event', () => {
    const store = usePlaybackStore()
    emitSystemPlayerStatusUnavailable()

    useI18nStore().setLanguage('de')

    expect(store.playerAlert).toBe(
      'Lautsprecher antwortet nicht — der Musikserver ist erreichbar, prüfe den Lautsprecher',
    )
  })

  it('lets the LMS message win when the backend reclassifies "speaker off" as "server gone"', async () => {
    const store = usePlaybackStore()
    emitSystemPlayerStatusUnavailable()
    expect(store.playerAlert).toBe(PLAYER_NOT_ANSWERING)

    // The order the backend actually sends: every change closes the condition
    // it leaves before opening the one it enters.
    emitSystemPlayerStatusRestored()
    emitSystemLmsDisconnected()
    await flushPromises()

    expect(store.lmsError).toBe('Cannot connect to music server')
    expect(store.playerAlert).toBeNull()
    expect(store.hasPlayerAlert).toBe(false)
  })

  it('lets the LMS message win even if the retraction never arrives', () => {
    const store = usePlaybackStore()
    emitSystemPlayerStatusUnavailable()

    // No system.playerStatusRestored — a dropped or reordered event must not
    // leave "the music server is reachable" next to "cannot connect to music
    // server".
    emitSystemLmsDisconnected()

    expect(store.lmsError).toBe('Cannot connect to music server')
    expect(store.playerAlert).toBeNull()
  })

  it('shows the speaker message again once the LMS is back and the speaker is still silent', () => {
    const store = usePlaybackStore()
    emitSystemPlayerStatusUnavailable()
    emitSystemLmsDisconnected()
    expect(store.playerAlert).toBeNull()

    emitSystemLmsReconnected()

    expect(store.playerAlert).toBe(PLAYER_NOT_ANSWERING)
  })

  it('keeps the two speaker conditions independent: resolving the status one leaves the lost-link message standing', async () => {
    const store = usePlaybackStore()
    emitSystemPlayerDisconnected()
    emitSystemPlayerStatusUnavailable()

    emitSystemPlayerStatusRestored()
    await flushPromises()

    expect(store.playerError).toBe('Speaker lost connection to server')
    expect(store.playerAlert).toBe('Speaker lost connection to server')
  })

  it('keeps the two speaker conditions independent: resolving the lost-link one leaves the status message standing', async () => {
    const store = usePlaybackStore()
    emitSystemPlayerDisconnected()
    emitSystemPlayerStatusUnavailable()
    // The lost-link message takes precedence while both are open.
    expect(store.playerAlert).toBe('Speaker lost connection to server')

    emitSystemPlayerReconnected()
    await flushPromises()

    expect(store.playerError).toBeNull()
    expect(store.playerAlert).toBe(PLAYER_NOT_ANSWERING)
  })
})
