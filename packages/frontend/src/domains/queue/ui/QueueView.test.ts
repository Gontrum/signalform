import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ok, err, type Result, type QueueTrack } from '@signalform/shared'
import QueueView from './QueueView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { getQueueEntryKey } from '@/domains/queue/core/service'

type CapturedEventName =
  'player.queue.updated' | 'player.radio.unavailable' | 'player.radio.started'

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
    onReconnect: vi.fn(),
  })),
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

// PlaylistsPanel owns its own data fetching (usePlaylists → playlistsApi). Stub it
// so QueueView tests stay focused on queue behaviour and make no playlist requests.
vi.mock('@/domains/playlists/ui/PlaylistsPanel.vue', () => ({
  default: {
    name: 'PlaylistsPanel',
    template: '<div data-testid="playlists-panel-stub" />',
  },
}))

import { useQueueStore } from '@/domains/queue/shell/useQueueStore'
import {
  getQueue,
  jumpToTrack,
  removeFromQueue,
  reorderQueue,
  setRadioMode,
  clearQueue,
  removeMultipleFromQueue,
  type QueueApiError,
} from '@/platform/api/queueApi'

const mockGetQueue = vi.mocked(getQueue)
const mockJumpToTrack = vi.mocked(jumpToTrack)
const mockRemoveFromQueue = vi.mocked(removeFromQueue)
const mockReorderQueue = vi.mocked(reorderQueue)
const mockSetRadioMode = vi.mocked(setRadioMode)
const mockClearQueue = vi.mocked(clearQueue)
const mockRemoveMultipleFromQueue = vi.mocked(removeMultipleFromQueue)

const makeTracks = (): readonly QueueTrack[] => [
  {
    id: '1',
    position: 1,
    title: 'Track A',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    isCurrent: false,
    addedBy: 'user',
  },
  {
    id: '2',
    position: 2,
    title: 'Track B',
    artist: 'Artist',
    album: 'Album',
    duration: 200,
    isCurrent: false,
    addedBy: 'user',
  },
  {
    id: '3',
    position: 3,
    title: 'Track C',
    artist: 'Artist',
    album: 'Album',
    duration: 240,
    isCurrent: false,
    addedBy: 'user',
  },
]

const makeDuplicateSignatureTracks = (): readonly QueueTrack[] => [
  {
    id: 'user-track',
    position: 1,
    title: 'Two of Hearts',
    artist: 'Stacey Q',
    album: 'Better Than Heaven',
    duration: 231,
    isCurrent: false,
    addedBy: 'user',
  },
  {
    id: 'radio-track',
    position: 2,
    title: 'Two of Hearts',
    artist: 'Stacey Q',
    album: 'Better Than Heaven (Deluxe)',
    duration: 231,
    isCurrent: false,
    addedBy: 'radio',
  },
  {
    id: 'next-radio-track',
    position: 3,
    title: 'Vogue',
    artist: 'Madonna',
    album: 'The Immaculate Collection',
    duration: 240,
    isCurrent: false,
    addedBy: 'radio',
  },
]

type QueueResponse = {
  readonly tracks: readonly QueueTrack[]
  readonly radioModeActive: boolean
  readonly radioBoundaryIndex: number | null
}
type QueueResult = Result<QueueResponse, QueueApiError>

const makeQueueResponse = (
  tracks = makeTracks(),
  radioBoundaryIndex: number | null = null,
  radioModeActive: boolean = false,
): QueueResult => {
  const response: QueueResponse = { tracks, radioModeActive, radioBoundaryIndex }
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

const makeRect = (top: number, bottom: number): DOMRect =>
  ({
    top,
    bottom,
    left: 0,
    right: 300,
    width: 300,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

// jsdom returns all-zero rects, which would always resolve to the "after" half.
// Pin a real rect on a queue row so cursor-half drop logic can be exercised.
const mockRowRect = (trackIndex: number, top: number, bottom: number): void => {
  const row = document.querySelector(`[data-track-index="${trackIndex}"]`)
  if (row instanceof HTMLElement) {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(makeRect(top, bottom))
  }
}

describe('QueueView', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    mockRemoveFromQueue.mockResolvedValue(ok(undefined))
    mockReorderQueue.mockResolvedValue(ok(undefined))
    mockJumpToTrack.mockResolvedValue(ok(undefined))
    mockSetRadioMode.mockResolvedValue(makeQueueResponse())
    mockClearQueue.mockResolvedValue(ok(undefined))
    mockRemoveMultipleFromQueue.mockResolvedValue(ok(undefined))
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('renders the playlists panel', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse([]))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="playlists-panel-stub"]').exists()).toBe(true)
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

  it('renders radio-mode toggle from queue snapshot and calls backend toggle on click', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks(), null, true))
    mockSetRadioMode.mockResolvedValue(makeQueueResponse(makeTracks(), null, false))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const toggle = wrapper.find('[data-testid="radio-mode-toggle"]')
    expect(toggle.attributes('aria-checked')).toBe('true')

    await toggle.trigger('click')

    expect(mockSetRadioMode).toHaveBeenCalledWith(false)
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
          addedBy: 'user',
        },
        {
          id: '2',
          position: 2,
          title: 'Current Track',
          artist: 'Artist',
          album: 'Album',
          duration: 300,
          isCurrent: true,
          addedBy: 'user',
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
          addedBy: 'user',
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
      clientY: 100,
      button: 0,
    })

    expect(wrapper.find('[data-testid="queue-drag-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drag-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drag-overlay"]').text()).toContain('Track A')

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }))
    await nextTick()

    // The in-row indicator box is gone: it caused layout shift while dragging.
    expect(wrapper.find('[data-testid="queue-drop-indicator"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="queue-drop-line-after"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drag-overlay-label"]').text()).toContain(
      'Release to move after this track.',
    )
    expect(wrapper.find('[data-testid="queue-drop-live-region"]').text()).toContain(
      'Release to move after this track.',
    )

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    expect(mockReorderQueue).toHaveBeenCalledWith(0, 2)
    expect(wrapper.find('[data-testid="queue-drag-state"]').exists()).toBe(false)

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('auto-scrolls the queue container while dragging near an edge', async () => {
    vi.useFakeTimers()
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="2"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    const scrollContainerElement = wrapper.find('ul[aria-label="Queue tracks"]').element
    expect(scrollContainerElement).toBeInstanceOf(HTMLElement)
    const scrollContainer =
      scrollContainerElement instanceof HTMLElement ? scrollContainerElement : document.body
    const scrollBySpy = vi.spyOn(scrollContainer, 'scrollBy')
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockImplementation(
      (): DOMRect =>
        ({
          top: 0,
          bottom: 200,
          left: 0,
          right: 300,
          width: 300,
          height: 200,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    )

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 10,
      button: 0,
    })

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 196 }))
    vi.advanceTimersByTime(64)

    expect(scrollBySpy).toHaveBeenCalled()

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

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

    // Row 1 sits at 0..100; dropping in its upper half means "before" this row.
    mockRowRect(1, 0, 100)

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

  it('prevents text selection while a touch reorder is active and restores the page afterwards', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="1"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    const reorderButton = wrapper.findAll('[data-testid="queue-track-reorder"]')[0]
    reorderButton?.element.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [createTouch(20, 20)],
        cancelable: true,
      }),
    )
    await nextTick()

    const selectStartEvent = new Event('selectstart', { cancelable: true })
    document.dispatchEvent(selectStartEvent)

    expect(selectStartEvent.defaultPrevented).toBe(true)
    expect(document.body.style.getPropertyValue('user-select')).toBe('none')

    document.dispatchEvent(new TouchEvent('touchend'))
    await flushPromises()

    expect(document.body.style.getPropertyValue('user-select')).toBe('')

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

    // Row 0 sits at 100..200; cursor at y=120 lands in its upper half → "before".
    mockRowRect(0, 100, 200)

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[2]?.trigger('mousedown', {
      clientX: 20,
      clientY: 20,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 120 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-indicator"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="queue-drag-overlay-label"]').text()).toContain(
      'Release to move before this track.',
    )

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('shows a before drop line for the upper row half and an after line for the lower half', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="2"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    // Neutral container so cursor position never triggers auto-scroll during the test.
    vi.spyOn(
      wrapper.find('ul[aria-label="Queue tracks"]').element,
      'getBoundingClientRect',
    ).mockReturnValue(makeRect(0, 1000))
    // Row 2 spans 100..200 → midpoint 150.
    mockRowRect(2, 100, 200)

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 500,
      button: 0,
    })

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 120 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-line-after"]').exists()).toBe(false)

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 180 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-after"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(false)

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('keeps the drop half stable within the hysteresis band and resets it on row change', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    let pointedRowSelector = '[data-track-index="0"]'
    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector(pointedRowSelector))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    // Neutral container so cursor position never triggers auto-scroll during the test.
    vi.spyOn(
      wrapper.find('ul[aria-label="Queue tracks"]').element,
      'getBoundingClientRect',
    ).mockReturnValue(makeRect(0, 1000))
    // Row 0 spans 100..200 → midpoint 150; row 1 spans 300..400 → midpoint 350.
    mockRowRect(0, 100, 200)
    mockRowRect(1, 300, 400)

    // Drag row 2 over row 0's upper half.
    await wrapper.findAll('[data-testid="queue-track-reorder"]')[2]?.trigger('mousedown', {
      clientX: 10,
      clientY: 500,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 120 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(true)

    // Wobble just past the midpoint (150 + 5) but inside the ±8px hysteresis
    // band → the half must stay "before" instead of flipping.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 155 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-line-after"]').exists()).toBe(false)

    // Beyond the band (150 + 8) the half flips to "after".
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 165 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-after"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(false)

    // Moving to a different row resets the hysteresis: y=345 is inside row 1's
    // band (midpoint 350) and a stale "after" would stick there, but a fresh
    // midpoint comparison yields "before".
    pointedRowSelector = '[data-track-index="1"]'
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 345 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-line-before"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="queue-drop-line-after"]').exists()).toBe(false)

    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('drops in the lower half of the row directly above the dragged one are a no-op', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="0"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    vi.spyOn(
      wrapper.find('ul[aria-label="Queue tracks"]').element,
      'getBoundingClientRect',
    ).mockReturnValue(makeRect(0, 1000))
    // Row 0 spans 100..200 → midpoint 150; y=180 is the lower half → "after" row 0.
    mockRowRect(0, 100, 200)

    // Drag row 1 and release just below row 0 — that is the same slot it already occupies.
    await wrapper.findAll('[data-testid="queue-track-reorder"]')[1]?.trigger('mousedown', {
      clientX: 10,
      clientY: 500,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 180 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await flushPromises()

    expect(mockReorderQueue).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="queue-drag-state"]').exists()).toBe(false)

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('auto-scroll interval reads live pointer coordinates on each tick', async () => {
    vi.useFakeTimers()
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const elementFromPointSpy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="2"]'))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    const scrollContainerElement = wrapper.find('ul[aria-label="Queue tracks"]').element
    const scrollContainer =
      scrollContainerElement instanceof HTMLElement ? scrollContainerElement : document.body
    vi.spyOn(scrollContainer, 'scrollBy').mockImplementation(() => {})
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue(makeRect(0, 200))

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 196,
      button: 0,
    })

    // Move to new live coordinates, still inside the bottom auto-scroll zone.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 190 }))
    elementFromPointSpy.mockClear()

    vi.advanceTimersByTime(16)

    expect(elementFromPointSpy).toHaveBeenCalledWith(50, 190)
    expect(elementFromPointSpy).not.toHaveBeenCalledWith(10, 196)

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
    await flushPromises()
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
    const reorderedRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(reorderedRows[0]?.attributes('data-track-id')).toBe('2')
    expect(reorderedRows[2]?.attributes('data-track-id')).toBe('1')
    expect(wrapper.find('[data-testid="queue-track-busy"]').exists()).toBe(false)

    elementFromPointSpy.mockRestore()
    wrapper.unmount()
  })

  it('renders busy row state from store mutation refs', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const store = useQueueStore()
    store.$patch({ removeBusyTrackId: getQueueEntryKey(makeTracks()[1]!) })
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
    store.$patch({ reorderBusyTrackId: getQueueEntryKey(makeTracks()[0]!) })
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
      tracks: [
        makeTracks()[0]!,
        { ...makeTracks()[1]!, addedBy: 'radio' },
        { ...makeTracks()[2]!, addedBy: 'radio' },
      ],
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

  it('keeps duplicate queue ids isolated by position-specific row keys', async () => {
    const duplicateIdTracks: readonly QueueTrack[] = [
      {
        id: 'shared-id',
        position: 1,
        title: 'Cold Hearted',
        artist: 'Paula Abdul',
        album: 'Forever Your Girl',
        duration: 231,
        isCurrent: true,
        addedBy: 'radio',
      },
      {
        id: 'shared-id',
        position: 2,
        title: 'Cold Hearted',
        artist: 'Paula Abdul',
        album: 'Forever Your Girl',
        duration: 231,
        isCurrent: false,
        addedBy: 'radio',
      },
      {
        id: 'shared-id',
        position: 3,
        title: 'Play',
        artist: 'Jennifer Lopez',
        album: 'J.Lo',
        duration: 211,
        isCurrent: false,
        addedBy: 'user',
      },
    ]
    mockGetQueue.mockResolvedValue(makeQueueResponse(duplicateIdTracks, 0, true))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const store = useQueueStore()
    store.$patch({ removeBusyTrackId: getQueueEntryKey(duplicateIdTracks[1]!) })
    await nextTick()

    const rows = wrapper.findAll('[data-testid="queue-track"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.attributes('data-busy')).toBe('false')
    expect(rows[1]?.attributes('data-busy')).toBe('true')
    expect(rows[2]?.attributes('data-busy')).toBe('false')
    expect(rows[0]?.classes()).not.toContain('bg-sky-100/60')
    expect(rows[1]?.classes()).toContain('bg-sky-100/60')
    expect(rows[2]?.classes()).not.toContain('bg-sky-100/60')
  })

  it('renders duplicate user/radio occurrences with a stable boundary and tint separation', async () => {
    const duplicateTracks = makeDuplicateSignatureTracks()
    mockGetQueue.mockResolvedValue(makeQueueResponse(duplicateTracks, 1, true))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="queue-track"]')
    expect(rows).toHaveLength(3)
    expect(wrapper.find('[data-testid="radio-boundary"]').exists()).toBe(true)
    expect(rows[0]?.text()).toContain('Two of Hearts')
    expect(rows[1]?.text()).toContain('Two of Hearts')
    expect(rows[0]?.classes()).not.toContain('bg-sky-100/60')
    expect(rows[1]?.classes()).toContain('bg-sky-100/60')
    expect(rows[2]?.classes()).toContain('bg-sky-100/60')
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

  describe('auto-scroll to current track', () => {
    const makeTracksWithCurrent = (currentId: string): readonly QueueTrack[] =>
      makeTracks().map((track) => ({ ...track, isCurrent: track.id === currentId }))

    it('scrolls the current track into view instantly after the initial queue load', async () => {
      const scrollSpy = vi
        .spyOn(HTMLElement.prototype, 'scrollIntoView')
        .mockImplementation(() => {})
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracksWithCurrent('2')))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      expect(scrollSpy).toHaveBeenCalledTimes(1)
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' })

      const currentRow = wrapper.find('[data-testid="queue-track"][data-current="true"]')
      expect(currentRow.attributes('data-track-id')).toBe('2')
      expect(scrollSpy.mock.contexts[0]).toBe(currentRow.element)

      scrollSpy.mockRestore()
      wrapper.unmount()
    })

    it('smooth-scrolls to the new current track when it changes while the view is open', async () => {
      const scrollSpy = vi
        .spyOn(HTMLElement.prototype, 'scrollIntoView')
        .mockImplementation(() => {})
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracksWithCurrent('1')))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()
      scrollSpy.mockClear()

      getCapturedHandler('player.queue.updated')?.({
        playerId: 'test-player',
        tracks: makeTracksWithCurrent('3'),
        timestamp: Date.now(),
      })
      await flushPromises()

      expect(scrollSpy).toHaveBeenCalledTimes(1)
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })

      const currentRow = wrapper.find('[data-testid="queue-track"][data-current="true"]')
      expect(currentRow.attributes('data-track-id')).toBe('3')
      expect(scrollSpy.mock.contexts[0]).toBe(currentRow.element)

      scrollSpy.mockRestore()
      wrapper.unmount()
    })

    it('does not scroll on track change while select mode is active', async () => {
      const scrollSpy = vi
        .spyOn(HTMLElement.prototype, 'scrollIntoView')
        .mockImplementation(() => {})
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracksWithCurrent('1')))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()
      scrollSpy.mockClear()

      getCapturedHandler('player.queue.updated')?.({
        playerId: 'test-player',
        tracks: makeTracksWithCurrent('3'),
        timestamp: Date.now(),
      })
      await flushPromises()

      expect(scrollSpy).not.toHaveBeenCalled()

      scrollSpy.mockRestore()
      wrapper.unmount()
    })

    it('does not scroll when no track is current', async () => {
      const scrollSpy = vi
        .spyOn(HTMLElement.prototype, 'scrollIntoView')
        .mockImplementation(() => {})
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      expect(scrollSpy).not.toHaveBeenCalled()

      scrollSpy.mockRestore()
      wrapper.unmount()
    })
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
        addedBy: 'radio' as const,
      },
      {
        id: '2',
        position: 2,
        title: 'Other Radio Track',
        artist: 'C',
        album: 'D',
        duration: 180,
        isCurrent: false,
        addedBy: 'radio' as const,
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
    expect(wrapper.find('[data-testid="queue-current-badge"]').text()).toContain('Now Playing')
    expect(trackRows[1]?.classes()).toContain('bg-sky-100/60')
  })

  it('keeps radio tint on radio tracks after reorder-style updates', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks(), 1))

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    getCapturedHandler('player.queue.updated')?.({
      playerId: 'test-player',
      tracks: [
        { ...makeTracks()[1]!, position: 1, addedBy: 'radio' },
        { ...makeTracks()[0]!, position: 2, addedBy: 'user' },
        { ...makeTracks()[2]!, position: 3, addedBy: 'radio' },
      ],
      radioBoundaryIndex: 0,
      timestamp: Date.now(),
    })
    await nextTick()

    const trackRows = wrapper.findAll('[data-testid="queue-track"]')
    expect(trackRows[0]?.classes()).toContain('bg-sky-100/60')
    expect(trackRows[1]?.classes()).not.toContain('bg-sky-100/60')
    expect(trackRows[2]?.classes()).toContain('bg-sky-100/60')
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
          addedBy: 'user',
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
          addedBy: 'user',
        },
      ],
      timestamp: Date.now(),
    })
    await nextTick()

    expect(wrapper.text()).toContain('New Track')
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
  })

  it('successful remove clears busy and error UI immediately from the mutation response', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockRemoveFromQueue.mockResolvedValue(
      ok({
        tracks: makeTracks().slice(1),
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )

    const router = await makeQueueRouter()
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()

    const store = useQueueStore()
    store.$patch({ lastMutationError: 'Stale mutation failure' })
    await nextTick()
    expect(wrapper.find('[data-testid="queue-mutation-error"]').exists()).toBe(true)

    await wrapper.findAll('[data-testid="queue-track-remove"]')[0]?.trigger('click')
    await nextTick()

    expect(wrapper.findAll('[data-testid="queue-track"]')[0]?.attributes('data-busy')).toBe('false')
    expect(wrapper.find('[data-testid="queue-mutation-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="queue-track-busy"]').exists()).toBe(false)
    expect(mockGetQueue).toHaveBeenCalledTimes(1)
  })

  it('successful reorder clears busy state and preserves radio/current rendering', async () => {
    mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
    mockReorderQueue.mockResolvedValue(
      ok({
        tracks: [
          {
            id: '2',
            position: 1,
            title: 'Track B',
            artist: 'Artist',
            album: 'Album',
            duration: 200,
            isCurrent: true,
            addedBy: 'user',
          },
          {
            id: '3',
            position: 2,
            title: 'Track C',
            artist: 'Artist',
            album: 'Album',
            duration: 240,
            isCurrent: false,
            addedBy: 'radio',
          },
          {
            id: '1',
            position: 3,
            title: 'Track A',
            artist: 'Artist',
            album: 'Album',
            duration: 180,
            isCurrent: false,
            addedBy: 'user',
          },
        ],
        radioModeActive: true,
        radioBoundaryIndex: 1,
      }),
    )

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
    await flushPromises()
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

  describe('select mode', () => {
    it('select mode toggle button appears when tracks.length > 0', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.find('[data-testid="queue-select-mode-toggle"]').exists()).toBe(true)
    })

    it('select mode toggle button does not appear when queue is empty', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse([]))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.find('[data-testid="queue-select-mode-toggle"]').exists()).toBe(false)
    })

    it('clicking the toggle enters select mode — checkboxes appear, position numbers hidden', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      // checkboxes appear (one per track, plus select-all)
      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      expect(checkboxes.length).toBeGreaterThanOrEqual(makeTracks().length)

      // reorder/remove buttons are hidden in select mode
      expect(wrapper.findAll('[data-testid="queue-track-reorder"]')).toHaveLength(0)
      expect(wrapper.findAll('[data-testid="queue-track-remove"]')).toHaveLength(0)
    })

    it('clicking the toggle again exits select mode', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()
      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      // position numbers visible again (reorder/remove buttons back)
      expect(wrapper.findAll('[data-testid="queue-track-reorder"]')).toHaveLength(3)
      expect(wrapper.findAll('[data-testid="queue-track-remove"]')).toHaveLength(3)
    })

    it('in select mode: select-all bar is visible', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      expect(wrapper.find('[data-testid="queue-select-all"]').exists()).toBe(true)
    })

    it('in select mode: bottom action bar is visible', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      expect(wrapper.find('[data-testid="queue-select-action-bar"]').exists()).toBe(true)
    })

    it('checking select-all checkbox calls selectAllTracks behavior', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      const selectAllCheckbox = wrapper.find(
        '[data-testid="queue-select-all"] input[type="checkbox"]',
      )
      await selectAllCheckbox.trigger('change')
      await nextTick()

      const store = useQueueStore()
      expect(store.allTracksSelected).toBe(true)
      expect(store.selectedCount).toBe(makeTracks().length)
    })

    it('remove-selected button is disabled when nothing is selected', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      const removeBtn = wrapper.find('[data-testid="queue-remove-selected-button"]')
      expect(removeBtn.attributes('disabled')).toBeDefined()
    })

    it('clicking remove-selected button when tracks are selected calls removeSelectedTracks', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
      mockRemoveMultipleFromQueue.mockResolvedValue(
        ok({ tracks: [], radioModeActive: false, radioBoundaryIndex: null }),
      )

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
      await nextTick()

      // select the first track by clicking the jump button in select mode
      const store = useQueueStore()
      store.toggleTrackSelection('1')
      await nextTick()

      const removeBtn = wrapper.find('[data-testid="queue-remove-selected-button"]')
      await removeBtn.trigger('click')
      await flushPromises()

      expect(mockRemoveMultipleFromQueue).toHaveBeenCalledOnce()
    })
  })

  describe('clear queue button', () => {
    it('clear button is present when tracks.length > 0', async () => {
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.find('[data-testid="queue-clear-button"]').exists()).toBe(true)
    })

    it('first click changes button text to the confirmation label', async () => {
      vi.useFakeTimers()
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      const clearBtn = wrapper.find('[data-testid="queue-clear-button"]')
      expect(clearBtn.text()).toContain('Clear queue')

      await clearBtn.trigger('click')
      await nextTick()

      expect(wrapper.find('[data-testid="queue-clear-button"]').text()).toContain('Clear?')
      vi.useRealTimers()
    })

    it('second click calls apiClearQueue', async () => {
      vi.useFakeTimers()
      mockGetQueue.mockResolvedValue(makeQueueResponse(makeTracks()))
      mockClearQueue.mockResolvedValue(
        ok({ tracks: [], radioModeActive: false, radioBoundaryIndex: null }),
      )

      const router = await makeQueueRouter()
      const wrapper = mount(QueueView, { global: { plugins: [router] } })
      await flushPromises()

      const clearBtn = wrapper.find('[data-testid="queue-clear-button"]')
      await clearBtn.trigger('click')
      await nextTick()
      await wrapper.find('[data-testid="queue-clear-button"]').trigger('click')
      await flushPromises()

      expect(mockClearQueue).toHaveBeenCalledOnce()
      vi.useRealTimers()
    })
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
