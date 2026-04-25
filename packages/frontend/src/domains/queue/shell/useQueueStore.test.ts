import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from '@signalform/shared'
import type { QueueTrack } from '@signalform/shared'

type CapturedEventName =
  | 'player.queue.updated'
  | 'player.radio.unavailable'
  | 'player.radio.started'

const { mockSubscribe, websocketOnMock } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  websocketOnMock: vi.fn<(event: CapturedEventName, handler: (payload: unknown) => void) => void>(),
}))

const getCapturedHandler = (event: CapturedEventName): ((payload: unknown) => void) | undefined => {
  const matchingCall = [...websocketOnMock.mock.calls]
    .reverse()
    .find(([eventName]) => eventName === event)

  return matchingCall?.[1]
}

vi.mock('@/platform/api/queueApi', () => ({
  getQueue: vi.fn(),
  jumpToTrack: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: (): {
    readonly on: typeof websocketOnMock
    readonly subscribe: typeof mockSubscribe
  } => ({
    on: websocketOnMock,
    subscribe: mockSubscribe,
  }),
}))

// Import AFTER mocks
import { useQueueStore } from '@/domains/queue/shell/useQueueStore'
import {
  getQueue,
  jumpToTrack as apiJumpToTrack,
  removeFromQueue as apiRemoveFromQueue,
  reorderQueue as apiReorderQueue,
} from '@/platform/api/queueApi'

const mockGetQueue = vi.mocked(getQueue)
const mockJumpToTrack = vi.mocked(apiJumpToTrack)
const mockRemoveFromQueue = vi.mocked(apiRemoveFromQueue)
const mockReorderQueue = vi.mocked(apiReorderQueue)

const makeTrack = (overrides: Partial<QueueTrack> = {}): QueueTrack => ({
  id: '1',
  position: 1,
  title: 'Track One',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  isCurrent: false,
  ...overrides,
})

describe('useQueueStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has correct initial state', () => {
    const store = useQueueStore()
    expect(store.tracks).toEqual([])
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.jumpError).toBeNull()
    expect(store.isJumping).toBe(false)
    expect(store.removeBusyTrackId).toBeNull()
    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBeNull()
    expect(store.isMutatingQueue).toBe(false)
    expect(store.isRadioMode).toBe(false)
    expect(store.radioBoundaryIndex).toBeNull()
    expect(store.radioUnavailableMessage).toBeNull()
  })

  it('fetchQueue() success: updates tracks and clears error', async () => {
    const track1 = makeTrack({ id: '1', title: 'First' })
    const track2 = makeTrack({ id: '2', position: 2, title: 'Second' })
    mockGetQueue.mockResolvedValue(ok({ tracks: [track1, track2], radioBoundaryIndex: null }))

    const store = useQueueStore()
    await store.fetchQueue()

    expect(store.tracks).toEqual([track1, track2])
    expect(store.error).toBeNull()
    expect(store.isLoading).toBe(false)
  })

  it('fetchQueue() failure: surfaces backend error message', async () => {
    mockGetQueue.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' }),
    )

    const store = useQueueStore()
    await store.fetchQueue()

    expect(store.error).toBe('LMS not reachable')
    expect(store.tracks).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  it('jumpToTrack() success: clears jumpError and isJumping after', async () => {
    mockJumpToTrack.mockResolvedValue(ok(undefined))

    const store = useQueueStore()
    await store.jumpToTrack(0)

    expect(store.jumpError).toBeNull()
    expect(store.isJumping).toBe(false)
    expect(mockJumpToTrack).toHaveBeenCalledWith(0)
  })

  it('jumpToTrack() failure: sets jumpError and clears isJumping after', async () => {
    mockJumpToTrack.mockResolvedValue(err({ type: 'NETWORK_ERROR', message: 'failed' }))

    const store = useQueueStore()
    await store.jumpToTrack(2)

    expect(store.jumpError).toBe('Failed to jump to track')
    expect(store.isJumping).toBe(false)
  })

  it('jumpToTrack() guard: does not call API if isJumping is already true', async () => {
    mockJumpToTrack.mockImplementation(() => new Promise(() => {}))

    const store = useQueueStore()
    void store.jumpToTrack(0)
    await store.jumpToTrack(1)

    expect(mockJumpToTrack).toHaveBeenCalledTimes(1)
  })

  it('removeTrack() sets busy id until websocket queue update arrives', async () => {
    mockRemoveFromQueue.mockResolvedValue(ok(undefined))
    const store = useQueueStore()

    const pending = store.removeTrack('track-2', 2)

    expect(store.removeBusyTrackId).toBe('track-2')
    expect(store.isMutatingQueue).toBe(true)
    await pending
    expect(store.removeBusyTrackId).toBe('track-2')

    const handler = getCapturedHandler('player.queue.updated')
    handler!({ playerId: 'test', tracks: [makeTrack({ id: 'updated' })], timestamp: Date.now() })

    expect(store.removeBusyTrackId).toBeNull()
    expect(store.isMutatingQueue).toBe(false)
    expect(store.tracks[0]?.id).toBe('updated')
  })

  it('removeTrack() failure: clears busy id, stores lastMutationError, and refreshes queue state', async () => {
    mockRemoveFromQueue.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'queue backend unavailable' }),
    )
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'fresh-track', title: 'Fresh Track' })],
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    await store.removeTrack('track-1', 1)

    expect(store.removeBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBe('queue backend unavailable')
    expect(store.isMutatingQueue).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
    expect(store.tracks[0]?.id).toBe('fresh-track')
  })

  it('reorderTrack() sets busy id until websocket queue update arrives', async () => {
    mockReorderQueue.mockResolvedValue(ok(undefined))
    const store = useQueueStore()

    const pending = store.reorderTrack('track-3', 3, 1)

    expect(store.reorderBusyTrackId).toBe('track-3')
    expect(store.isMutatingQueue).toBe(true)
    await pending

    const handler = getCapturedHandler('player.queue.updated')
    handler!({
      playerId: 'test',
      tracks: [makeTrack({ id: 'track-3', position: 1 })],
      radioBoundaryIndex: 1,
      timestamp: Date.now(),
    })

    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBeNull()
    expect(store.radioBoundaryIndex).toBe(1)
  })

  it('reorderTrack() failure: clears busy id, stores lastMutationError, and refreshes queue state', async () => {
    mockReorderQueue.mockResolvedValue(
      err({ type: 'VALIDATION_ERROR', status: 400, message: 'toIndex is out of range' }),
    )
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'refetched-track', title: 'Refetched' })],
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    await store.reorderTrack('track-4', 4, 99)

    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBe('toIndex is out of range')
    expect(store.isMutatingQueue).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
    expect(store.tracks[0]?.id).toBe('refetched-track')
  })

  it('queue mutation guard: ignores remove while another queue mutation is active', async () => {
    mockRemoveFromQueue.mockImplementation(() => new Promise(() => {}))
    const store = useQueueStore()

    void store.removeTrack('track-1', 1)
    await store.reorderTrack('track-2', 2, 0)

    expect(mockRemoveFromQueue).toHaveBeenCalledTimes(1)
    expect(mockReorderQueue).not.toHaveBeenCalled()
  })

  it('clearMutationState() clears busy ids and error', () => {
    const store = useQueueStore()

    store.$patch({
      removeBusyTrackId: 'track-1',
      reorderBusyTrackId: 'track-2',
      lastMutationError: 'bad things',
    })

    store.clearMutationState()

    expect(store.removeBusyTrackId).toBeNull()
    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBeNull()
  })

  it('updateQueue() replaces tracks with new array and clears mutation state', () => {
    const store = useQueueStore()
    store.$patch({
      removeBusyTrackId: 'track-1',
      lastMutationError: 'failed before',
    })

    const newTracks = [makeTrack({ id: '99', title: 'New' })]
    store.updateQueue(newTracks)

    expect(store.tracks).toEqual(newTracks)
    expect(store.removeBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBeNull()
  })

  it('setRadioMode(true) sets isRadioMode to true', () => {
    const store = useQueueStore()
    store.setRadioMode(true)

    expect(store.isRadioMode).toBe(true)
  })

  it('setRadioMode(false) sets isRadioMode to false after true', () => {
    const store = useQueueStore()
    store.setRadioMode(true)
    store.setRadioMode(false)

    expect(store.isRadioMode).toBe(false)
  })

  it('currentTrack getter: returns track with isCurrent === true', () => {
    const store = useQueueStore()
    const current = makeTrack({ id: '2', isCurrent: true })
    store.updateQueue([makeTrack({ id: '1' }), current])

    expect(store.currentTrack).toEqual(current)
  })

  it('currentTrack getter: returns null when no track is current', () => {
    const store = useQueueStore()
    store.updateQueue([makeTrack({ id: '1' }), makeTrack({ id: '2', position: 2 })])

    expect(store.currentTrack).toBeNull()
  })

  it('upcomingTracks getter: returns tracks after current', () => {
    const store = useQueueStore()
    const trackA = makeTrack({ id: '1', isCurrent: true })
    const trackB = makeTrack({ id: '2', position: 2 })
    const trackC = makeTrack({ id: '3', position: 3 })
    store.updateQueue([trackA, trackB, trackC])

    expect(store.upcomingTracks).toEqual([trackB, trackC])
  })

  it('upcomingTracks getter: returns [] when no current track', () => {
    const store = useQueueStore()
    store.updateQueue([makeTrack({ id: '1' }), makeTrack({ id: '2', position: 2 })])

    expect(store.upcomingTracks).toEqual([])
  })

  it('upcomingTracks getter: returns [] when current is last track', () => {
    const store = useQueueStore()
    store.updateQueue([
      makeTrack({ id: '1' }),
      makeTrack({ id: '2', position: 2, isCurrent: true }),
    ])

    expect(store.upcomingTracks).toEqual([])
  })

  it('upcomingTracks getter: returns [] for empty queue', () => {
    const store = useQueueStore()

    expect(store.upcomingTracks).toEqual([])
  })

  it('calls subscribe() during store initialization', () => {
    useQueueStore()
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('radioBoundaryIndex starts as null', () => {
    const store = useQueueStore()
    expect(store.radioBoundaryIndex).toBeNull()
  })

  it('radioBoundaryIndex updated from player.queue.updated payload with radioBoundaryIndex: 3', () => {
    const store = useQueueStore()

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    handler!({ playerId: 'test', tracks: [], radioBoundaryIndex: 3, timestamp: Date.now() })

    expect(store.radioBoundaryIndex).toBe(3)
  })

  it('radioBoundaryIndex reset to null when payload omits radioBoundaryIndex', () => {
    const store = useQueueStore()

    const handler = getCapturedHandler('player.queue.updated')
    handler!({ playerId: 'test', tracks: [], radioBoundaryIndex: 2, timestamp: Date.now() })
    expect(store.radioBoundaryIndex).toBe(2)

    handler!({ playerId: 'test', tracks: [], timestamp: Date.now() })
    expect(store.radioBoundaryIndex).toBeNull()
  })

  it('registers player.queue.updated handler and updates tracks when event fires', () => {
    const store = useQueueStore()
    const newTracks = [makeTrack({ isCurrent: true }), makeTrack({ id: '2', position: 2 })]

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    handler!({ playerId: 'test', tracks: newTracks, timestamp: Date.now() })

    expect(store.tracks).toEqual(newTracks)
  })

  it('fetchQueue() hydrates radioBoundaryIndex from queue response so reload preserves radio mode', async () => {
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: '1', isCurrent: true }), makeTrack({ id: '2', position: 2 })],
        radioBoundaryIndex: 1,
      }),
    )

    const store = useQueueStore()
    await store.fetchQueue()

    expect(store.tracks).toHaveLength(2)
    expect(store.radioBoundaryIndex).toBe(1)
  })

  it('fetchQueue() guard: does not call getQueue if already loading', async () => {
    mockGetQueue.mockImplementation(() => new Promise(() => {}))

    const store = useQueueStore()
    void store.fetchQueue()
    await store.fetchQueue()

    expect(mockGetQueue).toHaveBeenCalledTimes(1)
  })

  it('6.8: radioUnavailableMessage starts as null', () => {
    const store = useQueueStore()
    expect(store.radioUnavailableMessage).toBeNull()
  })

  it('6.8: player.radio.unavailable sets radioUnavailableMessage to payload.message', () => {
    vi.useFakeTimers()
    const store = useQueueStore()

    const handler = getCapturedHandler('player.radio.unavailable')
    expect(handler).toBeDefined()

    handler!({
      playerId: 'p',
      message: 'Radio mode temporarily unavailable',
      timestamp: Date.now(),
    })

    expect(store.radioUnavailableMessage).toBe('Radio mode temporarily unavailable')
  })

  it('6.8: radioUnavailableMessage auto-clears after 10 seconds', () => {
    vi.useFakeTimers()
    const store = useQueueStore()

    const handler = getCapturedHandler('player.radio.unavailable')
    handler!({
      playerId: 'p',
      message: 'Radio mode temporarily unavailable',
      timestamp: Date.now(),
    })
    expect(store.radioUnavailableMessage).toBe('Radio mode temporarily unavailable')

    vi.advanceTimersByTime(10_000)

    expect(store.radioUnavailableMessage).toBeNull()
  })

  it('6.8: player.radio.started clears radioUnavailableMessage immediately', () => {
    vi.useFakeTimers()
    const store = useQueueStore()

    const unavailableHandler = getCapturedHandler('player.radio.unavailable')
    unavailableHandler!({
      playerId: 'p',
      message: 'Radio mode temporarily unavailable',
      timestamp: Date.now(),
    })
    expect(store.radioUnavailableMessage).toBe('Radio mode temporarily unavailable')

    const startedHandler = getCapturedHandler('player.radio.started')
    expect(startedHandler).toBeDefined()
    startedHandler!({
      playerId: 'p',
      seedTrack: { artist: 'A', title: 'B' },
      tracksAdded: 1,
      timestamp: Date.now(),
    })

    expect(store.radioUnavailableMessage).toBeNull()
  })

  it('fetchQueue() clears jumpError from a previous failed jump', async () => {
    mockJumpToTrack.mockResolvedValue(err({ type: 'NETWORK_ERROR', message: 'failed' }))
    mockGetQueue.mockResolvedValue(ok({ tracks: [], radioBoundaryIndex: null }))

    const store = useQueueStore()
    await store.jumpToTrack(0)
    expect(store.jumpError).toBe('Failed to jump to track')

    await store.fetchQueue()

    expect(store.jumpError).toBeNull()
  })
})
