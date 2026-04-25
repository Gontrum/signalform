/**
 * WebSocket Composable
 * Manages Socket.IO connection lifecycle and event listeners
 * Following Vue 3 Composition API patterns
 */

import { io, type Socket } from 'socket.io-client'
import { ref, type Ref } from 'vue'
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

/**
 * WebSocket composable
 * Provides type-safe WebSocket connection management
 */
const addReservedListener = (
  socket: TypedSocket,
  event: string,
  callback: (...args: readonly unknown[]) => void,
): void => {
  const onMethod: unknown = Reflect.get(socket, 'on')
  if (typeof onMethod === 'function') {
    onMethod.call(socket, event, callback)
  }
}

const addServerListener = <K extends keyof ServerToClientEvents>(
  socket: TypedSocket,
  event: K,
  callback: ServerToClientEvents[K],
): void => {
  const onMethod: unknown = Reflect.get(socket, 'on')
  if (typeof onMethod === 'function') {
    onMethod.call(socket, event, callback)
  }
}

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
} => {
  const connectionState = ref<ConnectionState>('connecting')
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

  addReservedListener(socket, 'reconnect_attempt', () => {
    connectionState.value = 'reconnecting'
  })

  addReservedListener(socket, 'reconnect', () => {
    connectionState.value = 'connected'
  })

  // Error event handler
  addReservedListener(socket, 'error', () => {
    connectionState.value = 'disconnected'
  })

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
    addServerListener(socket, event, callback)
  }

  /**
   * Remove event listener
   */
  const off = <K extends keyof ServerToClientEvents>(event: K): void => {
    socket.off(event)
  }

  return {
    socket,
    connectionState,
    subscribe,
    unsubscribe,
    on,
    off,
  }
}
