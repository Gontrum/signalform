/**
 * WebSocket Composable
 * Manages a single shared Socket.IO connection for the whole app:
 * the socket and its connection handlers are created lazily exactly once,
 * and every useWebSocket() call returns the same socket and connectionState.
 * Following Vue 3 Composition API patterns
 */

import { io, type Socket } from 'socket.io-client'
import { ref, shallowRef, type Ref } from 'vue'
import type { ServerToClientEvents, ClientToServerEvents } from '@signalform/shared'
import { getWebSocketUrl } from '@/utils/runtimeUrls'

/**
 * Typed Socket.IO client
 */
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * WebSocket connection state
 */
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

type SharedConnection = {
  readonly socket: TypedSocket
  readonly connectionState: Ref<ConnectionState>
  readonly reconnectCallbacks: Ref<readonly (() => void)[]>
}

const createSharedConnection = (): SharedConnection => {
  const connectionState = ref<ConnectionState>('connecting')
  const reconnectCallbacks = ref<readonly (() => void)[]>([])

  const socket: TypedSocket = io(getWebSocketUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000, // Start at 1s
    reconnectionDelayMax: 5000, // Max 5s between attempts
    timeout: 5000, // Connection timeout (NFR26)
  })

  // Connection event handlers
  socket.on('connect', () => {
    connectionState.value = 'connected'
  })

  socket.on('disconnect', () => {
    connectionState.value = 'disconnected'
  })

  // Since Socket.IO v3 the Socket no longer forwards Manager events:
  // 'reconnect_attempt', 'reconnect' and 'error' only fire on the Manager
  // (socket.io), so they must be registered there.
  socket.io.on('reconnect_attempt', () => {
    connectionState.value = 'reconnecting'
  })

  socket.io.on('reconnect', () => {
    connectionState.value = 'connected'
    socket.emit('player.subscribe')
    reconnectCallbacks.value.forEach((callback) => {
      callback()
    })
  })

  socket.io.on('error', () => {
    connectionState.value = 'disconnected'
  })

  return { socket, connectionState, reconnectCallbacks }
}

// shallowRef: the connection is a module-level singleton holder, not deep
// reactive state — nested refs must not be unwrapped.
const sharedConnection = shallowRef<SharedConnection | null>(null)

/**
 * Test-only escape hatch: drops the shared connection so the next
 * useWebSocket() call creates a fresh socket. Never call in production code.
 */
export const __resetWebSocketForTests = (): void => {
  sharedConnection.value?.socket.disconnect()
  sharedConnection.value = null
}

/**
 * WebSocket composable
 * Provides type-safe access to the shared app-wide WebSocket connection
 */
export const useWebSocket = (): {
  readonly socket: TypedSocket
  readonly connectionState: Ref<ConnectionState>
  readonly subscribe: () => void
  readonly unsubscribe: () => void
  readonly on: <K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K],
  ) => void
  readonly off: <K extends keyof ServerToClientEvents>(event: K) => void
  readonly onReconnect: (callback: () => void) => void
} => {
  const connection = sharedConnection.value ?? createSharedConnection()
  sharedConnection.value = connection

  const { socket, connectionState, reconnectCallbacks } = connection

  /**
   * Subscribe to player updates
   * Must be called to receive player.statusChanged events
   */
  const subscribe = (): void => {
    socket.emit('player.subscribe')
  }

  /**
   * Unsubscribe from player updates
   */
  const unsubscribe = (): void => {
    socket.emit('player.unsubscribe')
  }

  /**
   * Register event listener
   * Type-safe event listening
   */
  const on = <K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K],
  ): void => {
    // socket.on(event, callback) does not typecheck for a generic K:
    // Socket.IO's FallbackToUntypedListener conditional type does not
    // distribute over unions, so the listener type never matches.
    const onMethod: unknown = Reflect.get(socket, 'on')
    if (typeof onMethod === 'function') {
      onMethod.call(socket, event, callback)
    }
  }

  /**
   * Remove event listener
   *
   * Caution: the socket is shared app-wide, so this removes the listeners of
   * ALL useWebSocket() consumers for that event, not just the caller's.
   * There are currently no production callers.
   */
  const off = <K extends keyof ServerToClientEvents>(event: K): void => {
    socket.off(event)
  }

  /**
   * Register a callback that fires after the socket has reconnected.
   * Useful to resync state that may have missed events while disconnected.
   * Callbacks live for the app lifetime; there is no unregister.
   */
  const onReconnect = (callback: () => void): void => {
    reconnectCallbacks.value = [...reconnectCallbacks.value, callback]
  }

  return {
    socket,
    connectionState,
    subscribe,
    unsubscribe,
    on,
    off,
    onReconnect,
  }
}
