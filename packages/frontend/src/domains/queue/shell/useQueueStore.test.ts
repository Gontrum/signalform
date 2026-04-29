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
  setRadioMode: vi.fn(),
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
  setRadioMode as apiSetRadioMode,
} from '@/platform/api/queueApi'

const mockGetQueue = vi.mocked(getQueue)
const mockJumpToTrack = vi.mocked(apiJumpToTrack)
const mockRemoveFromQueue = vi.mocked(apiRemoveFromQueue)
const mockReorderQueue = vi.mocked(apiReorderQueue)
const mockSetRadioMode = vi.mocked(apiSetRadioMode)

const makeTrack = (overrides: Partial<QueueTrack> = {}): QueueTrack => ({
  id: '1',
  position: 1,
  title: 'Track One',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  isCurrent: false,
  addedBy: 'user',
  ...overrides,
})

const makeTrackListForReorder = (): readonly QueueTrack[] => [
  makeTrack({ id: 'track-1', position: 1, title: 'Track One' }),
  makeTrack({ id: 'track-2', position: 2, title: 'Track Two' }),
  makeTrack({ id: 'track-3', position: 3, title: 'Track Three', addedBy: 'radio' }),
]

const makeDuplicateSignatureTracks = (): readonly QueueTrack[] => [
  makeTrack({
    id: 'user-track',
    position: 1,
    title: 'Two of Hearts',
    artist: 'Stacey Q',
    album: 'Better Than Heaven',
    addedBy: 'user',
  }),
  makeTrack({
    id: 'radio-track',
    position: 2,
    title: 'Two of Hearts',
    artist: 'Stacey Q',
    album: 'Better Than Heaven (Deluxe)',
    addedBy: 'radio',
  }),
  makeTrack({
    id: 'next-radio-track',
    position: 3,
    title: 'Vogue',
    artist: 'Madonna',
    album: 'The Immaculate Collection',
    addedBy: 'radio',
  }),
]

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
    expect(store.isRadioModeUpdating).toBe(false)
    expect(store.radioModeError).toBeNull()
    expect(store.radioBoundaryIndex).toBeNull()
    expect(store.radioUnavailableMessage).toBeNull()
  })

  it('fetchQueue() success: updates tracks and clears error', async () => {
    const track1 = makeTrack({ id: '1', title: 'First' })
    const track2 = makeTrack({ id: '2', position: 2, title: 'Second' })
    mockGetQueue.mockResolvedValue(
      ok({ tracks: [track1, track2], radioModeActive: true, radioBoundaryIndex: null }),
    )

    const store = useQueueStore()
    await store.fetchQueue()

    expect(store.tracks).toEqual([track1, track2])
    expect(store.isRadioMode).toBe(true)
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
    mockJumpToTrack.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'jumped-track', isCurrent: true })],
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    await store.jumpToTrack(0)

    expect(store.jumpError).toBeNull()
    expect(store.isJumping).toBe(false)
    expect(store.tracks[0]?.id).toBe('jumped-track')
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

  it('removeTrack() clears busy id immediately when backend returns queue snapshot', async () => {
    mockRemoveFromQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'updated', position: 1 })],
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )
    const store = useQueueStore()

    await store.removeTrack('track-2', 2)

    expect(store.removeBusyTrackId).toBeNull()
    expect(store.isMutatingQueue).toBe(false)
    expect(store.tracks[0]?.id).toBe('updated')
  })

  it('jumpToTrack() triggers fetchQueue fallback when backend returns 204', async () => {
    mockJumpToTrack.mockResolvedValue(ok(undefined))
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'jump-fallback', isCurrent: true })],
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    await store.jumpToTrack(0)

    expect(store.isJumping).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
    expect(store.tracks[0]?.id).toBe('jump-fallback')
  })

  it('removeTrack() clears busy id and triggers fetchQueue fallback when backend returns 204', async () => {
    mockRemoveFromQueue.mockResolvedValue(ok(undefined))
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'fallback-track', position: 1 })],
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    await store.removeTrack('track-2', 2)

    expect(store.removeBusyTrackId).toBeNull()
    expect(store.isMutatingQueue).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
    expect(store.tracks[0]?.id).toBe('fallback-track')
  })

  it('removeTrack() failure: clears busy id, stores lastMutationError, and refreshes queue state', async () => {
    mockRemoveFromQueue.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'queue backend unavailable' }),
    )
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'fresh-track', title: 'Fresh Track' })],
        radioModeActive: false,
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

  it('reorderTrack() clears busy id immediately when backend returns queue snapshot', async () => {
    mockReorderQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'track-3', position: 1 })],
        radioModeActive: true,
        radioBoundaryIndex: 1,
      }),
    )
    const store = useQueueStore()
    store.$patch({ tracks: makeTrackListForReorder() })

    await store.reorderTrack('track-1', 0, 2)

    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.lastMutationError).toBeNull()
    expect(store.tracks.map((track) => track.id)).toEqual(['track-3'])
    expect(store.isRadioMode).toBe(true)
    expect(store.radioBoundaryIndex).toBe(1)
  })

  it('reorderTrack() applies an optimistic local reorder before the server responds', async () => {
    let resolveRequest: (() => void) | undefined
    mockReorderQueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = (): void => resolve(ok(undefined))
        }),
    )
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: makeTrackListForReorder(),
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    store.$patch({ tracks: makeTrackListForReorder() })

    const reorderPromise = store.reorderTrack('track-1', 0, 2)

    expect(store.tracks.map((track) => `${track.position}:${track.id}`)).toEqual([
      '1:track-2',
      '2:track-3',
      '3:track-1',
    ])
    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.isMutatingQueue).toBe(false)

    resolveRequest?.()
    await reorderPromise
  })

  it('reorderTrack() clears busy id and triggers fetchQueue fallback when backend returns 204', async () => {
    mockReorderQueue.mockResolvedValue(ok(undefined))
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'refetched-track', title: 'Refetched' })],
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    await store.reorderTrack('track-3', 3, 1)

    expect(store.reorderBusyTrackId).toBeNull()
    expect(store.isMutatingQueue).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
    expect(store.tracks[0]?.id).toBe('refetched-track')
  })

  it('reorderTrack() failure: clears busy id, stores lastMutationError, and refreshes queue state', async () => {
    mockReorderQueue.mockResolvedValue(
      err({ type: 'VALIDATION_ERROR', status: 400, message: 'toIndex is out of range' }),
    )
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'refetched-track', title: 'Refetched' })],
        radioModeActive: false,
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

  it('queue mutation sync guard: ignores a second reorder while the first reorder is syncing', async () => {
    let releaseFirstRequest: (() => void) | undefined
    mockReorderQueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirstRequest = (): void => resolve(ok(undefined))
        }),
    )
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: makeTrackListForReorder(),
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const store = useQueueStore()
    store.$patch({ tracks: makeTrackListForReorder() })

    const firstReorder = store.reorderTrack('track-1', 0, 2)
    await store.reorderTrack('track-2', 0, 1)

    expect(mockReorderQueue).toHaveBeenCalledTimes(1)

    releaseFirstRequest?.()
    await firstReorder
  })

  it('setRadioMode(true) updates isRadioMode from backend snapshot', async () => {
    mockSetRadioMode.mockResolvedValue(
      ok({ tracks: [], radioModeActive: true, radioBoundaryIndex: null }),
    )

    const store = useQueueStore()
    await store.setRadioMode(true)

    expect(store.isRadioMode).toBe(true)
  })

  it('ignores a stale queue.updated event that arrives after a radio-mode snapshot commit', async () => {
    mockSetRadioMode.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'radio-toggle-track', position: 1, addedBy: 'radio' })],
        radioModeActive: true,
        radioBoundaryIndex: 0,
      }),
    )

    const store = useQueueStore()
    await store.setRadioMode(true)

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    handler!({
      playerId: 'test',
      tracks: [makeTrack({ id: 'stale-track', position: 1, addedBy: 'user' })],
      radioModeActive: false,
      radioBoundaryIndex: null,
      timestamp: 1,
    })

    expect(store.tracks[0]?.id).toBe('radio-toggle-track')
    expect(store.isRadioMode).toBe(true)
    expect(store.radioBoundaryIndex).toBe(0)
  })

  it('applies a newer queue.updated event after a radio-mode snapshot commit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:45:00.000Z'))

    mockSetRadioMode.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'radio-toggle-track', position: 1, addedBy: 'radio' })],
        radioModeActive: true,
        radioBoundaryIndex: 0,
      }),
    )

    const store = useQueueStore()
    await store.setRadioMode(true)

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    vi.advanceTimersByTime(5)

    handler!({
      playerId: 'test',
      tracks: [makeTrack({ id: 'newer-track', position: 1, addedBy: 'user' })],
      radioModeActive: false,
      radioBoundaryIndex: null,
      timestamp: Date.now(),
    })

    expect(store.tracks[0]?.id).toBe('newer-track')
    expect(store.isRadioMode).toBe(false)
    expect(store.radioBoundaryIndex).toBeNull()
  })

  it('setRadioMode(false) stores backend error when toggle fails', async () => {
    mockSetRadioMode.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'Radio mode controller unavailable' }),
    )

    const store = useQueueStore()
    await store.setRadioMode(false)

    expect(store.radioModeError).toBe('Radio mode controller unavailable')
    expect(store.isRadioModeUpdating).toBe(false)
  })

  it('treats a radio-mode update as an active queue mutation', async () => {
    let resolveToggle: (() => void) | undefined
    mockSetRadioMode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToggle = (): void =>
            resolve(ok({ tracks: [], radioModeActive: false, radioBoundaryIndex: null }))
        }),
    )

    const store = useQueueStore()
    const togglePromise = store.setRadioMode(false)

    expect(store.isMutatingQueue).toBe(true)

    resolveToggle?.()
    await togglePromise

    expect(store.isMutatingQueue).toBe(false)
  })

  it('blocks removeTrack while a radio-mode update is in flight', async () => {
    let resolveToggle: (() => void) | undefined
    mockSetRadioMode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToggle = (): void =>
            resolve(ok({ tracks: [], radioModeActive: false, radioBoundaryIndex: null }))
        }),
    )

    const store = useQueueStore()
    const togglePromise = store.setRadioMode(false)

    await store.removeTrack('track-1', 0)

    expect(mockRemoveFromQueue).not.toHaveBeenCalled()

    resolveToggle?.()
    await togglePromise
  })

  it('currentTrack getter: returns track with isCurrent === true', () => {
    const store = useQueueStore()
    const current = makeTrack({ id: '2', isCurrent: true })
    store.$patch({ tracks: [makeTrack({ id: '1' }), current] })

    expect(store.currentTrack).toEqual(current)
  })

  it('currentTrack getter: returns null when no track is current', () => {
    const store = useQueueStore()
    store.$patch({ tracks: [makeTrack({ id: '1' }), makeTrack({ id: '2', position: 2 })] })

    expect(store.currentTrack).toBeNull()
  })

  it('upcomingTracks getter: returns tracks after current', () => {
    const store = useQueueStore()
    const trackA = makeTrack({ id: '1', isCurrent: true })
    const trackB = makeTrack({ id: '2', position: 2 })
    const trackC = makeTrack({ id: '3', position: 3 })
    store.$patch({ tracks: [trackA, trackB, trackC] })

    expect(store.upcomingTracks).toEqual([trackB, trackC])
  })

  it('upcomingTracks getter: returns [] when no current track', () => {
    const store = useQueueStore()
    store.$patch({ tracks: [makeTrack({ id: '1' }), makeTrack({ id: '2', position: 2 })] })

    expect(store.upcomingTracks).toEqual([])
  })

  it('upcomingTracks getter: returns [] when current is last track', () => {
    const store = useQueueStore()
    store.$patch({
      tracks: [makeTrack({ id: '1' }), makeTrack({ id: '2', position: 2, isCurrent: true })],
    })

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

    handler!({
      playerId: 'test',
      tracks: [],
      radioModeActive: true,
      radioBoundaryIndex: 3,
      timestamp: Date.now(),
    })

    expect(store.isRadioMode).toBe(true)
    expect(store.radioBoundaryIndex).toBe(3)
  })

  it('radioBoundaryIndex reset to null when payload omits radioBoundaryIndex', () => {
    const store = useQueueStore()

    const handler = getCapturedHandler('player.queue.updated')
    handler!({
      playerId: 'test',
      tracks: [],
      radioModeActive: true,
      radioBoundaryIndex: 2,
      timestamp: Date.now(),
    })
    expect(store.radioBoundaryIndex).toBe(2)

    handler!({ playerId: 'test', tracks: [], radioModeActive: false, timestamp: Date.now() })
    expect(store.isRadioMode).toBe(false)
    expect(store.radioBoundaryIndex).toBeNull()
  })

  it('registers player.queue.updated handler and updates tracks when event fires', () => {
    const store = useQueueStore()
    const newTracks = [makeTrack({ isCurrent: true }), makeTrack({ id: '2', position: 2 })]

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    handler!({ playerId: 'test', tracks: newTracks, radioModeActive: false, timestamp: Date.now() })

    expect(store.tracks).toEqual(newTracks)
  })

  it('preserves duplicate user/radio occurrences from queue.updated snapshots', () => {
    const store = useQueueStore()
    const duplicateTracks = makeDuplicateSignatureTracks()

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    handler!({
      playerId: 'test',
      tracks: duplicateTracks,
      radioModeActive: true,
      radioBoundaryIndex: 1,
      timestamp: Date.now(),
    })

    expect(store.tracks).toEqual(duplicateTracks)
    expect(store.tracks.map((track) => track.addedBy)).toEqual(['user', 'radio', 'radio'])
    expect(store.radioBoundaryIndex).toBe(1)
    expect(store.isRadioMode).toBe(true)
  })

  it('ignores a stale queue.updated event that arrives after a local mutation snapshot', async () => {
    mockReorderQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'fresh-track', position: 1, addedBy: 'radio' })],
        radioModeActive: true,
        radioBoundaryIndex: 0,
      }),
    )

    const store = useQueueStore()
    store.$patch({ tracks: makeTrackListForReorder() })

    await store.reorderTrack('track-1', 0, 2)

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    handler!({
      playerId: 'test',
      tracks: [makeTrack({ id: 'stale-track', position: 1 })],
      radioModeActive: false,
      radioBoundaryIndex: null,
      timestamp: 1,
    })

    expect(store.tracks[0]?.id).toBe('fresh-track')
    expect(store.isRadioMode).toBe(true)
    expect(store.radioBoundaryIndex).toBe(0)
  })

  it('applies a newer queue.updated event after a local mutation snapshot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:30:00.000Z'))

    mockReorderQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: 'fresh-track', position: 1, addedBy: 'radio' })],
        radioModeActive: true,
        radioBoundaryIndex: 0,
      }),
    )

    const store = useQueueStore()
    store.$patch({ tracks: makeTrackListForReorder() })

    await store.reorderTrack('track-1', 0, 2)

    const handler = getCapturedHandler('player.queue.updated')
    expect(handler).toBeDefined()

    vi.advanceTimersByTime(5)

    handler!({
      playerId: 'test',
      tracks: [makeTrack({ id: 'newer-track', position: 1, addedBy: 'user' })],
      radioModeActive: false,
      radioBoundaryIndex: null,
      timestamp: Date.now(),
    })

    expect(store.tracks[0]?.id).toBe('newer-track')
    expect(store.isRadioMode).toBe(false)
    expect(store.radioBoundaryIndex).toBeNull()
  })

  it('fetchQueue() hydrates radioBoundaryIndex from queue response so reload preserves radio mode', async () => {
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [makeTrack({ id: '1', isCurrent: true }), makeTrack({ id: '2', position: 2 })],
        radioModeActive: true,
        radioBoundaryIndex: 1,
      }),
    )

    const store = useQueueStore()
    await store.fetchQueue()

    expect(store.tracks).toHaveLength(2)
    expect(store.isRadioMode).toBe(true)
    expect(store.radioBoundaryIndex).toBe(1)
  })

  it('fetchQueue() queues one follow-up refresh when called again while loading', async () => {
    let hasPendingFirstFetch = false
    let releaseFirstFetch: () => void = () => undefined
    mockGetQueue
      .mockImplementationOnce(
        () =>
          new Promise((resolve): void => {
            hasPendingFirstFetch = true
            releaseFirstFetch = (): void =>
              resolve(ok({ tracks: [], radioModeActive: false, radioBoundaryIndex: null }))
          }),
      )
      .mockResolvedValueOnce(
        ok({
          tracks: [makeTrack({ id: 'refetched-track', title: 'Refetched Track' })],
          radioModeActive: false,
          radioBoundaryIndex: null,
        }),
      )

    const store = useQueueStore()
    const firstFetch = store.fetchQueue()
    const secondFetch = store.fetchQueue()

    expect(mockGetQueue).toHaveBeenCalledTimes(1)
    expect(store.isLoading).toBe(true)

    expect(hasPendingFirstFetch).toBe(true)
    const flushFirstFetch: () => void = releaseFirstFetch
    flushFirstFetch()

    await Promise.all([firstFetch, secondFetch])

    expect(mockGetQueue).toHaveBeenCalledTimes(2)
    expect(store.isLoading).toBe(false)
    expect(store.tracks[0]?.id).toBe('refetched-track')
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
    mockGetQueue.mockResolvedValue(
      ok({ tracks: [], radioModeActive: false, radioBoundaryIndex: null }),
    )

    const store = useQueueStore()
    await store.jumpToTrack(0)
    expect(store.jumpError).toBe('Failed to jump to track')

    await store.fetchQueue()

    expect(store.jumpError).toBeNull()
  })
})
