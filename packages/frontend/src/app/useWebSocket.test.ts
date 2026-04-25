/**
 * Tests for WebSocket Composable
 * Coverage target: 85%
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { getApiBaseUrl, getWebSocketUrl } from '@/utils/runtimeUrls'
import { useWebSocket } from '@/app/useWebSocket'

// Mock Socket.IO client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}))

describe('runtimeUrls', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('defaults API and websocket URLs to the browser origin when no env overrides are set', () => {
    expect(getApiBaseUrl()).toBe(window.location.origin)
    expect(getWebSocketUrl()).toBe(window.location.origin)
  })

  test('uses explicit API override for API and websocket when websocket override is absent', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://example.test:3001')

    expect(getApiBaseUrl()).toBe('http://example.test:3001')
    expect(getWebSocketUrl()).toBe('http://example.test:3001')
  })

  test('uses explicit websocket override when provided', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://example.test:3001')
    vi.stubEnv('VITE_WEBSOCKET_URL', 'ws://socket.example.test:3100')

    expect(getWebSocketUrl()).toBe('ws://socket.example.test:3100')
  })

  test('resolves relative API override against the current origin', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/backend')

    expect(getApiBaseUrl()).toBe(`${window.location.origin}/backend`)
  })
})

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('creates socket connection with browser-origin default on initialization', async () => {
    const { io } = await import('socket.io-client')
    useWebSocket()

    expect(io).toHaveBeenCalledWith(
      window.location.origin,
      expect.objectContaining({
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 5000,
      }),
    )
  })

  test('creates socket connection with explicit websocket env override when present', async () => {
    vi.stubEnv('VITE_WEBSOCKET_URL', 'ws://socket.example.test:3100')
    const { io } = await import('socket.io-client')

    useWebSocket()

    expect(io).toHaveBeenCalledWith(
      'ws://socket.example.test:3100',
      expect.objectContaining({
        autoConnect: true,
      }),
    )
  })

  test('subscribe emits player.subscribe event', () => {
    const { subscribe } = useWebSocket()

    subscribe()

    expect(mockSocket.emit).toHaveBeenCalledWith('player.subscribe')
  })

  test('unsubscribe emits player.unsubscribe event', () => {
    const { unsubscribe } = useWebSocket()

    unsubscribe()

    expect(mockSocket.emit).toHaveBeenCalledWith('player.unsubscribe')
  })

  test('on registers event listener', () => {
    const { on } = useWebSocket()
    const callback = vi.fn()

    on('player.statusChanged', callback)

    expect(mockSocket.on).toHaveBeenCalledWith('player.statusChanged', callback)
  })

  test('off removes event listener', () => {
    const { off } = useWebSocket()

    off('player.statusChanged')

    expect(mockSocket.off).toHaveBeenCalledWith('player.statusChanged')
  })

  test('connectionState starts as connecting', () => {
    const { connectionState } = useWebSocket()

    expect(connectionState.value).toBe('connecting')
  })

  test('connectionState updates to connected on connect event', () => {
    const { connectionState } = useWebSocket()

    const connectCallback = mockSocket.on.mock.calls.find((call) => call[0] === 'connect')?.[1]

    connectCallback?.()

    expect(connectionState.value).toBe('connected')
  })

  test('connectionState updates to disconnected on disconnect event', () => {
    const { connectionState } = useWebSocket()

    const disconnectCallback = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'disconnect',
    )?.[1]

    disconnectCallback?.()

    expect(connectionState.value).toBe('disconnected')
  })

  test('connectionState updates to reconnecting on reconnect_attempt', () => {
    const { connectionState } = useWebSocket()

    const reconnectAttemptCallback = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'reconnect_attempt',
    )?.[1]

    reconnectAttemptCallback?.()

    expect(connectionState.value).toBe('reconnecting')
  })

  test('connectionState updates to connected on reconnect', () => {
    const { connectionState } = useWebSocket()

    const reconnectAttemptCallback = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'reconnect_attempt',
    )?.[1]
    reconnectAttemptCallback?.()

    const reconnectCallback = mockSocket.on.mock.calls.find((call) => call[0] === 'reconnect')?.[1]

    reconnectCallback?.()

    expect(connectionState.value).toBe('connected')
  })
})
