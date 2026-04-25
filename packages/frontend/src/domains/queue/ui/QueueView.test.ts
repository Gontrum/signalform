import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ok, err, type Result, type QueueTrack } from '@signalform/shared'
import QueueView from './QueueView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'

type CapturedEventName =
  | 'player.queue.updated'
  | 'player.radio.unavailable'
  | 'player.radio.started'

const { websocketOnMock } = vi.hoisted(() => {
  return {
    websocketOnMock:
      vi.fn<(event: CapturedEventName, handler: (payload: unknown) => void) => void>(),
  }
})

const getCapturedHandler = (event: CapturedEventName): ((payload: unknown) => void) | undefined => {
  const matchingCall = [...websocketOnMock.mock.calls]
    .reverse()
    .find(([eventName]) => eventName === event)

  return matchingCall?.[1]
}

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    socket: {},
    connectionState: { value: 'connected' },
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: websocketOnMock,
    off: vi.fn(),
  })),
}))

vi.mock('@/platform/api/queueApi', () => ({
  getQueue: vi.fn(),
  jumpToTrack: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
}))

import { useQueueStore } from '@/domains/queue/shell/useQueueStore'
import {
  getQueue,
  jumpToTrack,
  removeFromQueue,
  reorderQueue,
  type QueueApiError,
} from '@/platform/api/queueApi'

const mockGetQueue = vi.mocked(getQueue)
const mockJumpToTrack = vi.mocked(jumpToTrack)
const mockRemoveFromQueue = vi.mocked(removeFromQueue)
const mockReorderQueue = vi.mocked(reorderQueue)

const makeTracks = (): ReadonlyArray<{
  readonly id: string
  readonly position: number
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly duration: number
  readonly isCurrent: boolean
}> => [
  {
    id: '1',
    position: 1,
    title: 'Track A',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    isCurrent: false,
  },
  {
    id: '2',
    position: 2,
    title: 'Track B',
    artist: 'Artist',
    album: 'Album',
    duration: 200,
    isCurrent: false,
  },
  {
    id: '3',
    position: 3,
    title: 'Track C',
    artist: 'Artist',
    album: 'Album',
    duration: 240,
    isCurrent: false,
  },
]

type QueueResponse = {
  readonly tracks: readonly QueueTrack[]
  readonly radioBoundaryIndex: number | null
}
type QueueResult = Result<QueueResponse, QueueApiError>

const makeQueueResponse = (
  tracks = makeTracks(),
  radioBoundaryIndex: number | null = null,
): QueueResult => {
  const response: QueueResponse = { tracks, radioBoundaryIndex }
  return ok(response)
}

const createTouch = (clientX: number, clientY: number): Touch =>
  new Touch({
    identifier: 0,
    target: document.body,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    screenX: clientX,
    screenY: clientY,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  })

const makeQueueRouter = (): ReturnType<typeof createTestRouter> =>
  createTestRouter(
    [
      { path: '/', component: { template: '<div />' } },
      { path: '/queue', name: 'queue', component: { template: '<div />' } },
    ],
    '/queue',
  )

const dispatchTouchMove = (clientX: number, clientY: number): void => {
  const touches = [createTouch(clientX, clientY)]

  document.dispatchEvent(
    new TouchEvent('touchmove', {
      touches,
    }),
  )
}

describe('QueueView', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    mockRemoveFromQueue.mockResolvedValue(ok(undefined))
    mockReorderQueue.mockResolvedValue(ok(undefined))
    mockJumpToTrack.mockResolvedValue(ok(undefined))
  })

  it('shows loading state while fetching', async () => {
    mockGetQueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(makeQueueResponse([]))
          }, 100)
        }),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await nextTick()

    expect(wrapper.find('[data-testid="queue-loading"]').exists()).toBe(true)

    await flushPromises()
  })

  it('shows empty state when queue is empty', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse([]))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="queue-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-empty"]').text()).toContain(
      'Your queue is currently empty.',
    )
  })

  it('renders tracks when queue has items', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const trackRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(trackRows).toHaveLength(3)
    expect(trackRows[0]?.text()).toContain('Track A')
    expect(trackRows[1]?.text()).toContain('Track B')
  })

  it('renders separate jump, reorder, and remove controls per row', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="queue-track-jump"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="queue-track-reorder"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="queue-track-remove"]')).toHaveLength(3)
  })

  it('highlights the currently playing track', async () => {
    mockGetQueue.mockResolvedValue(
      makeQueueResponse([
        {
          id: '1',
          position: 1,
          title: 'Not Current',
          artist: 'Artist',
          album: 'Album',
          duration: 200,
          isCurrent: false,
        },
        {
          id: '2',
          position: 2,
          title: 'Current Track',
          artist: 'Artist',
          album: 'Album',
          duration: 300,
          isCurrent: true,
        },
      ]),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="current-track"]').exists()).toBe(true)

    const trackRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(trackRows[1]?.classes()).toContain('bg-blue-50')
  })

  it('formats duration as mm:ss', async () => {
    mockGetQueue.mockResolvedValue(
      makeQueueResponse([
        {
          id: '1',
          position: 1,
          title: 'Test Track',
          artist: 'Artist',
          album: 'Album',
          duration: 225,
          isCurrent: false,
        },
      ]),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('3:45')
  })

  it('shows backend queue error message when fetch fails', async () => {
    mockGetQueue.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 503, message: 'LMS not reachable' }),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="queue-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-error"]').text()).toContain('LMS not reachable')
  })

  it('shows jump error notification when jumpToTrack fails', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockJumpToTrack.mockResolvedValue(err({ type: 'NETWORK_ERROR', message: 'Jump failed' }))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-jump"]')[0]?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="queue-jump-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-jump-error"]').text()).toContain(
      'Failed to jump to track',
    )
    expect(wrapper.findAll('[data-testid="queue-track"]')).toHaveLength(3)
  })

  it('prevents multiple simultaneous jump requests when clicking rapidly', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockJumpToTrack.mockImplementation(() => new Promise(() => {}))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const jumpButtons = wrapper.findAll('[data-testid="queue-track-jump"]')
    await jumpButtons[0]?.trigger('click')
    await jumpButtons[1]?.trigger('click')

    expect(mockJumpToTrack).toHaveBeenCalledTimes(1)
  })

  it('calls jumpToTrack with 0-based index when jump control is clicked', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-jump"]')[1]?.trigger('click')

    expect(mockJumpToTrack).toHaveBeenCalledWith(1)
  })

  it('calls removeTrack with track id and 0-based position when remove control is clicked', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-remove"]')[1]?.trigger('click')
    await flushPromises()

    expect(mockRemoveFromQueue).toHaveBeenCalledWith(1)
  })

  it('starts mouse drag reorder and calls reorder API with from/to indexes', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="2"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 10,
      button: 0,
    })

    expect(wrapper.find('[data-testid="queue-drag-state"]').exists()).toBe(true)

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-indicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-indicator"]').text()).toContain(
      'Release to move after this track.',
    )

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    expect(mockReorderQueue).toHaveBeenCalledWith(0, 2)
    expect(wrapper.find('[data-testid="queue-drag-state"]').exists()).toBe(false)

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('starts touch drag reorder and calls reorder API with from/to indexes', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="1"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    const reorderButton = wrapper.findAll('[data-testid="queue-track-reorder"]')[2]
    const touchStartTouches = [createTouch(20, 20)]
    await reorderButton?.trigger('touchstart', {
      touches: touchStartTouches,
    })

    dispatchTouchMove(40, 40)
    document.dispatchEvent(new TouchEvent('touchend'))
    await flushPromises()

    expect(mockReorderQueue).toHaveBeenCalledWith(2, 1)

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('prevents native page scrolling while a touch reorder is active', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="1"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    const reorderButton = wrapper.findAll('[data-testid="queue-track-reorder"]')[0]
    expect(reorderButton?.classes()).toContain('touch-none')

    const touchStartEvent = new TouchEvent('touchstart', {
      touches: [createTouch(20, 20)],
      cancelable: true,
    })
    reorderButton?.element.dispatchEvent(touchStartEvent)
    await nextTick()

    const touchMoveEvent = new TouchEvent('touchmove', {
      touches: [createTouch(40, 40)],
      cancelable: true,
    })

    document.dispatchEvent(touchMoveEvent)
    expect(touchMoveEvent.defaultPrevented).toBe(true)

    document.dispatchEvent(new TouchEvent('touchend'))
    await flushPromises()

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('shows top-side drop hint when dragging upward to an earlier row', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="0"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[2]?.trigger('mousedown', {
      clientX: 20,
      clientY: 20,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-indicator"]').text()).toContain(
      'Release to move before this track.',
    )

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('shows mutation alert when remove fails', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockRemoveFromQueue.mockResolvedValue(
      err({ type: 'SERVER_ERROR', status: 500, message: 'Removal failed' }),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-remove"]')[0]?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="queue-mutation-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-mutation-error"]').text()).toContain('Removal failed')
  })

  it('blocks duplicate remove mutations while the first row is busy', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockRemoveFromQueue.mockImplementation(() => new Promise(() => {}))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const removeButtons = wrapper.findAll('[data-testid="queue-track-remove"]')
    await removeButtons[0]?.trigger('click')
    await nextTick()
    await removeButtons[1]?.trigger('click')

    expect(mockRemoveFromQueue).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('[data-testid="queue-track"]')[0]?.attributes('data-busy')).toBe('true')
  })

  it('blocks duplicate reorder mutations while a reorder is in flight', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockReorderQueue.mockImplementation(() => new Promise(() => {}))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="2"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    const reorderButtons = wrapper.findAll('[data-testid="queue-track-reorder"]')

    await reorderButtons[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 10,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    await reorderButtons[1]?.trigger('mousedown', {
      clientX: 15,
      clientY: 15,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 45, clientY: 45 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    expect(mockReorderQueue).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('[data-testid="queue-track"]')[0]?.attributes('data-busy')).toBe('true')

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('renders busy row state from store mutation refs', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const store = useQueueStore()
    store.$patch({ removeBusyTrackId: '2' })
    await nextTick()

    const rows = wrapper.findAll('[data-testid="queue-track"]')
    expect(rows[1]?.attributes('data-busy')).toBe('true')
    expect(rows[1]?.find('[data-testid="queue-track-busy"]').exists()).toBe(true)
  })

  it('disables row controls while queue mutation is active', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const store = useQueueStore()
    store.$patch({ reorderBusyTrackId: '1' })
    await nextTick()

    expect(wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.attributes('disabled')).toBe(
      '',
    )
    expect(wrapper.findAll('[data-testid="queue-track-remove"]')[1]?.attributes('disabled')).toBe(
      '',
    )
    expect(wrapper.findAll('[data-testid="queue-track-jump"]')[2]?.attributes('disabled')).toBe('')
  })

  it('shows radio boundary separator when radioBoundaryIndex is set', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: makeTracks(),
      radioBoundaryIndex: 1,
      timestamp: Date.now(),
    })
    await nextTick()

    expect(wrapper.find('[data-testid="radio-boundary"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="radio-boundary"]').text()).toContain('Radio Mode')

    const trackRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(trackRows[0]?.classes()).not.toContain('bg-sky-100/60')
    expect(trackRows[1]?.classes()).toContain('bg-sky-100/60')
    expect(trackRows[2]?.classes()).toContain('bg-sky-100/60')
  })

  it('does not show radio boundary when radioBoundaryIndex is null', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="radio-boundary"]').exists()).toBe(false)
  })

  it('scrolls boundary into view when radioBoundaryIndex first appears', async () => {
    const scrollIntoViewMock = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrollIntoViewMock)

    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: makeTracks(),
      radioBoundaryIndex: 0,
      timestamp: Date.now(),
    })
    await nextTick()

    expect(wrapper.find('[data-testid="radio-boundary"]').exists()).toBe(true)
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
  })

  it('keeps current-track highlight ahead of radio tint', async () => {
    const currentTracks = [
      {
        id: '1',
        position: 1,
        title: 'Current Radio Track',
        artist: 'A',
        album: 'B',
        duration: 200,
        isCurrent: true,
      },
      {
        id: '2',
        position: 2,
        title: 'Other Radio Track',
        artist: 'C',
        album: 'D',
        duration: 180,
        isCurrent: false,
      },
    ]
    mockGetQueue.mockResolvedValue(makeQueueResponse(currentTracks))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: currentTracks,
      radioBoundaryIndex: 0,
      timestamp: Date.now(),
    })
    await nextTick()

    const trackRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(trackRows[0]?.classes()).toContain('bg-blue-50')
    expect(trackRows[0]?.classes()).not.toContain('bg-sky-100/60')
    expect(trackRows[1]?.classes()).toContain('bg-sky-100/60')
  })

  it('shows radio unavailable banner when radioUnavailableMessage is set', async () => {
    vi.useFakeTimers()
    mockGetQueue.mockResolvedValue(makeQueueResponse([]))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="radio-unavailable-banner"]').exists()).toBe(false)

    getCapturedHandler('player.radio.unavailable')?.({
      playerId: 'test-player',
      message: 'Radio mode temporarily unavailable',
      timestamp: Date.now(),
    })
    await nextTick()

    expect(wrapper.find('[data-testid="radio-unavailable-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="radio-unavailable-banner"]').text()).toContain(
      'Radio mode temporarily unavailable',
    )
    vi.useRealTimers()
  })

  it('player.radio.started clears radio-unavailable-banner immediately', async () => {
    vi.useFakeTimers()
    mockGetQueue.mockResolvedValue(makeQueueResponse([]))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    getCapturedHandler('player.radio.unavailable')?.({
      playerId: 'test-player',
      message: 'Radio mode temporarily unavailable',
      timestamp: Date.now(),
    })
    await nextTick()
    expect(wrapper.find('[data-testid="radio-unavailable-banner"]').exists()).toBe(true)

    getCapturedHandler('player.radio.started')?.({
      playerId: 'test-player',
      seedTrack: { artist: 'A', title: 'B' },
      tracksAdded: 1,
      timestamp: Date.now(),
    })
    await nextTick()
    expect(wrapper.find('[data-testid="radio-unavailable-banner"]').exists()).toBe(false)

    vi.useRealTimers()
  })

  it('updates queue when player.queue.updated WebSocket event fires', async () => {
    mockGetQueue.mockResolvedValueOnce(
      makeQueueResponse([
        {
          id: '1',
          position: 1,
          title: 'First Track',
          artist: 'Artist',
          album: 'Album',
          duration: 200,
          isCurrent: true,
        },
      ]),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('First Track')

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: [
        {
          id: '2',
          position: 1,
          title: 'New Track',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          isCurrent: true,
        },
      ],
      timestamp: Date.now(),
    })
    await nextTick()

    expect(wrapper.text()).toContain('New Track')
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
  })

  it('player.queue.updated clears busy and error UI after a remove succeeds', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockRemoveFromQueue.mockResolvedValue(ok(undefined))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-remove"]')[0]?.trigger('click')
    await nextTick()

    expect(wrapper.findAll('[data-testid="queue-track"]')[0]?.attributes('data-busy')).toBe('true')

    const store = useQueueStore()
    store.$patch({ lastMutationError: 'Stale mutation failure' })
    await nextTick()
    expect(wrapper.find('[data-testid="queue-mutation-error"]').exists()).toBe(true)

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: makeTracks().slice(1),
      timestamp: Date.now(),
    })
    await nextTick()

    expect(wrapper.find('[data-testid="queue-mutation-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="queue-track-busy"]').exists()).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
  })

  it('player.queue.updated clears reorder busy state and preserves radio/current rendering', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockReorderQueue.mockResolvedValue(ok(undefined))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="2"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 10,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    expect(wrapper.findAll('[data-testid="queue-track"]')[0]?.attributes('data-busy')).toBe('true')

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: [
        {
          id: '2',
          position: 1,
          title: 'Track B',
          artist: 'Artist',
          album: 'Album',
          duration: 200,
          isCurrent: true,
        },
        {
          id: '3',
          position: 2,
          title: 'Track C',
          artist: 'Artist',
          album: 'Album',
          duration: 240,
          isCurrent: false,
        },
        {
          id: '1',
          position: 3,
          title: 'Track A',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          isCurrent: false,
        },
      ],
      radioBoundaryIndex: 1,
      timestamp: Date.now(),
    })
    await nextTick()

    const trackRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(trackRows[0]?.attributes('data-busy')).toBe('false')
    expect(trackRows[0]?.classes()).toContain('bg-blue-50')
    expect(trackRows[1]?.classes()).toContain('bg-sky-100/60')
    expect(wrapper.find('[data-testid="radio-boundary"]').exists()).toBe(true)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('calls router.back() when back button is clicked', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse([]))

    const router = await makeQueueRouter()
    const backSpy = vi.spyOn(router, 'back')
    const wrapper = mount(QueueView, { global: { plugins: [router] } })

    await wrapper.find('[data-testid="back-button"]').trigger('click')

    expect(backSpy).toHaveBeenCalled()
  })

  describe('keyboard navigation', () => {
    it('jump buttons keep keyboard focusability and button semantics', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()
      await nextTick()

      const items = wrapper.findAll('[data-testid="queue-track-jump"]')
      expect(items.length).toBe(3)
      expect(items[0]!.element.tagName).toBe('BUTTON')
      expect(items[0]!.attributes('type')).toBe('button')
    })

    it('ArrowDown moves focus to the next jump button', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, {
        attachTo: document.body,
        global: { plugins: [router] },
      })
      await flushPromises()
      await nextTick()

      const items = wrapper.findAll('[data-testid="queue-track-jump"]')
      const firstElement = items[0]?.element
      expect(firstElement).toBeInstanceOf(HTMLButtonElement)
      if (!(firstElement instanceof HTMLButtonElement)) {
        wrapper.unmount()
        return
      }
      firstElement.focus()
      await items[0]!.trigger('keydown', { key: 'ArrowDown' })

      expect(document.activeElement).toBe(items[1]!.element)
      wrapper.unmount()
    })

    it('Enter key on jump button calls jumpToTrack', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()
      await nextTick()

      await wrapper.findAll('[data-testid="queue-track-jump"]')[1]!.trigger('click')
      await flushPromises()

      expect(mockJumpToTrack).toHaveBeenCalledWith(1)
    })

    it('jump buttons expose aria-label with track info', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()
      await nextTick()

      const items = wrapper.findAll('[data-testid="queue-track-jump"]')
      expect(items[0]!.attributes('aria-label')).toContain('Track A')
      expect(items[0]!.attributes('aria-label')).toContain('Artist')
    })
  })
})
