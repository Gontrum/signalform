const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/u, '')

const isAbsoluteUrl = (value: string): boolean => /^[a-z][a-z\d+\-.]*:\/\//iu.test(value)

const normalizeConfiguredUrl = (value: string): string => trimTrailingSlashes(value.trim())

const getEnv = (): ImportMetaEnv => import.meta.env

const getWindowLocation = (): Location | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.location
}

const getOrigin = (): string => getWindowLocation()?.origin ?? ''

const resolveConfiguredUrl = (configuredUrl: string | undefined, origin: string): string | null => {
  if (configuredUrl === undefined) {
    return null
  }

  const normalized = normalizeConfiguredUrl(configuredUrl)
  if (normalized.length === 0) {
    return null
  }

  if (isAbsoluteUrl(normalized)) {
    return normalized
  }

  if (origin.length === 0) {
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  return new URL(normalized, `${origin}/`).toString().replace(/\/$/u, '')
}

export const getApiBaseUrl = (): string => {
  const origin = getOrigin()
  return resolveConfiguredUrl(getEnv().VITE_API_BASE_URL, origin) ?? origin
}

export const getWebSocketUrl = (): string => {
  const origin = getOrigin()
  return (
    resolveConfiguredUrl(getEnv().VITE_WEBSOCKET_URL, origin) ??
    resolveConfiguredUrl(getEnv().VITE_API_BASE_URL, origin) ??
    origin
  )
}

export const getApiUrl = (path: string): string => {
  const baseUrl = getApiBaseUrl()
  return `${baseUrl}${path}`
}
