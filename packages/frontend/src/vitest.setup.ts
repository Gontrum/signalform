/**
 * Vitest global setup — runs before every test file.
 *
 * Node 25 ships a built-in `localStorage` / `sessionStorage` stub (via
 * --localstorage-file) that does not implement the full Web Storage API.
 * We replace both globals with happy-dom's compliant Storage implementation.
 *
 * We also keep test output quieter by:
 * - preventing real socket.io connections in unit tests
 * - filtering Vue Router "no match" warnings from intentionally minimal test routers
 * - suppressing known unhandled local dev-server connection noise in happy-dom
 */

import Storage from 'happy-dom/lib/storage/Storage.js'
import { vi } from 'vitest'

type SocketMock = {
  readonly on: ReturnType<typeof vi.fn>
  readonly off: ReturnType<typeof vi.fn>
  readonly emit: ReturnType<typeof vi.fn>
  readonly disconnect: ReturnType<typeof vi.fn>
  readonly connect: ReturnType<typeof vi.fn>
}

type AggregateErrorLike = {
  readonly errors: readonly unknown[]
}

type WarnFn = (message?: unknown, ...optionalParams: readonly unknown[]) => void

const shouldReplaceLocalStorage =
  typeof localStorage === 'undefined' || typeof localStorage.clear !== 'function'
const shouldReplaceSessionStorage =
  typeof sessionStorage === 'undefined' || typeof sessionStorage.clear !== 'function'

if (shouldReplaceLocalStorage) {
  vi.stubGlobal('localStorage', new Storage())
}

if (shouldReplaceSessionStorage) {
  vi.stubGlobal('sessionStorage', new Storage())
}

// Prevent unit tests from opening real socket.io connections to the dev server.
vi.mock('socket.io-client', () => {
  const createSocketMock = (): SocketMock => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
  })

  return {
    io: vi.fn(() => createSocketMock()),
  }
})

const isRouterNoMatchWarning = (message: unknown): message is string =>
  typeof message === 'string' &&
  message.startsWith('[Vue Router warn]: No match found for location with path')

const isErrorWithMessage = (value: unknown): value is Error =>
  value instanceof Error || (typeof value === 'object' && value !== null && 'message' in value)

const getErrorMessage = (value: unknown): string =>
  isErrorWithMessage(value) && typeof value.message === 'string' ? value.message : ''

const isAggregateErrorLike = (value: unknown): value is AggregateErrorLike => {
  const errors =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'errors') : undefined

  return Array.isArray(errors)
}

const isKnownDevServerConnectionError = (value: unknown): boolean => {
  if (!isAggregateErrorLike(value)) {
    return false
  }

  return value.errors.some((error) => {
    const message = getErrorMessage(error)

    return (
      (message.includes('ECONNREFUSED') || message.includes('EPERM')) && message.includes('3000')
    )
  })
}

const getConsoleWarn = (): WarnFn | null => {
  const consoleValue = Reflect.get(globalThis, 'console')
  const warnValue =
    typeof consoleValue === 'object' && consoleValue !== null
      ? Reflect.get(consoleValue, 'warn')
      : undefined

  return typeof warnValue === 'function'
    ? (message?: unknown, ...optionalParams: readonly unknown[]): void => {
        warnValue.call(consoleValue, message, ...optionalParams)
      }
    : null
}

const consoleValue = Reflect.get(globalThis, 'console')

if (typeof consoleValue === 'object' && consoleValue !== null) {
  const originalConsoleWarn = getConsoleWarn()

  vi.spyOn(consoleValue, 'warn').mockImplementation(
    (message: unknown, ...optionalParams: readonly unknown[]): void => {
      if (isRouterNoMatchWarning(message)) {
        return
      }

      originalConsoleWarn?.(message, ...optionalParams)
    },
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (isKnownDevServerConnectionError(event.reason)) {
      event.preventDefault()
    }
  })
}
