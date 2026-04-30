type ServiceWorkerRegistrationLike = {
  readonly unregister: () => Promise<boolean>
}

type ServiceWorkerContainerLike = {
  readonly getRegistrations: () => Promise<readonly ServiceWorkerRegistrationLike[]>
  readonly register?: (
    scriptUrl: string,
    options?: {
      readonly scope?: string
      readonly updateViaCache?: 'all' | 'imports' | 'none'
    },
  ) => Promise<ServiceWorkerRegistrationLike>
}

type CacheStorageLike = {
  readonly keys: () => Promise<readonly string[]>
  readonly delete: (key: string) => Promise<boolean>
}

type RecoveryEnvironment = {
  readonly hostname: string
  readonly port: string
  readonly serviceWorker?: ServiceWorkerContainerLike
  readonly caches?: CacheStorageLike
}

export const isLocalDevOrigin = (environment: {
  readonly hostname: string
  readonly port: string
}): boolean =>
  (environment.hostname === 'localhost' || environment.hostname === '127.0.0.1') &&
  environment.port === '3000'

export const clearDevServiceWorkerState = async (
  environment: RecoveryEnvironment,
): Promise<boolean> => {
  const registrations = environment.serviceWorker
    ? await environment.serviceWorker.getRegistrations()
    : []

  const cacheKeys = environment.caches ? await environment.caches.keys() : []

  await Promise.all(
    registrations.map(async (registration) => {
      await registration.unregister()
    }),
  )

  await Promise.all(
    cacheKeys.map(async (cacheKey) => {
      await environment.caches?.delete(cacheKey)
    }),
  )

  return registrations.length > 0 || cacheKeys.length > 0
}

export const recoverLocalDevServiceWorkers = async (
  environment: RecoveryEnvironment,
): Promise<boolean> => {
  if (!isLocalDevOrigin(environment)) {
    return false
  }

  const registrations = environment.serviceWorker
    ? await environment.serviceWorker.getRegistrations()
    : []
  const cacheKeys = environment.caches ? await environment.caches.keys() : []
  const hasStaleDevState = registrations.length > 0 || cacheKeys.length > 0

  if (!hasStaleDevState) {
    return false
  }

  if (environment.serviceWorker?.register) {
    try {
      await environment.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      return true
    } catch {
      return await clearDevServiceWorkerState(environment)
    }
  }

  return await clearDevServiceWorkerState(environment)
}
