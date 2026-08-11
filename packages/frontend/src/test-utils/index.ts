import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'

/**
 * Initialize Pinia + i18n for a test.  Call in `beforeEach`.
 *
 * Creates a fresh Pinia instance, sets it as active, and configures
 * i18n to English. Returns the i18n store for further customization.
 */
export const setupTestEnv = (): ReturnType<typeof useI18nStore> => {
  setActivePinia(createPinia())
  const i18nStore = useI18nStore()
  i18nStore.setLanguage('en')
  return i18nStore
}

/**
 * Create a Vue Router for testing with the given routes and initial path.
 *
 * Handles the `createRouter` + `router.push` + `router.isReady` boilerplate
 * that every view test repeats.
 *
 * @param routes   - Route definitions (use `{ template: '<div />' }` for stubs)
 * @param initialPath - Path to navigate to before returning (default: first route's path)
 */
export const createTestRouter = async (
  routes: readonly RouteRecordRaw[],
  initialPath?: string,
): Promise<Router> => {
  const router = createRouter({
    history: createWebHistory(),
    routes: [...routes],
  })
  const path = initialPath ?? routes[0]?.path ?? '/'
  await router.push(path)
  await router.isReady()
  return router
}

/**
 * `vi.mock` factory for `@/platform/api/playbackApi`.
 *
 * Stubs `playTrack`, `setVolume`, `getVolume`, and `getPlaybackStatus` with
 * neutral resolved values, so components that embed NowPlayingPanel +
 * VolumeControl (which call the playback API on mount) can be mounted
 * without hitting the network.
 *
 * @example
 * ```ts
 * // `vi.mock` factories are hoisted above all imports, so the factory must
 * // do a dynamic `import()` of this module rather than referencing a
 * // statically-imported binding directly (which throws a TDZ error).
 * vi.mock('@/platform/api/playbackApi', async () => {
 *   const { mockPlaybackApiModule } = await import('@/test-utils')
 *   return mockPlaybackApiModule()
 * })
 * ```
 */
export const mockPlaybackApiModule = async (): Promise<{
  readonly playTrack: ReturnType<typeof vi.fn>
  readonly setVolume: ReturnType<typeof vi.fn>
  readonly getVolume: ReturnType<typeof vi.fn>
  readonly getPlaybackStatus: ReturnType<typeof vi.fn>
}> => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
}

/**
 * Deferred promise for controlling async flow in tests.
 *
 * Returns a promise and its `resolve` function so tests can
 * control exactly when an async operation completes.
 *
 * @example
 * ```ts
 * const deferred = createDeferred<AlbumDetail>()
 * mockGetAlbumDetail.mockReturnValue(deferred.promise)
 * // ... mount component, verify loading state ...
 * deferred.resolve(albumData)
 * // ... verify loaded state ...
 * ```
 */
export const createDeferred = <T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} => {
  // eslint-disable-next-line functional/no-let -- single captured resolver for deferred test promise
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: (value: T): void => {
      resolvePromise?.(value)
    },
  }
}
