import { getApiUrl } from '@/utils/runtimeUrls'

type LastFmAuthRequestResult = {
  readonly token: string
  readonly authUrl: string
}

type LastFmAuthCompleteResult = {
  readonly username: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const requestLastFmAuth = async (): Promise<LastFmAuthRequestResult | null> => {
  try {
    const response = await fetch(getApiUrl('/api/lastfm/auth/request'), {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      return null
    }
    const raw: unknown = await response.json()
    if (!isRecord(raw)) {
      return null
    }
    if (typeof raw['token'] !== 'string' || typeof raw['authUrl'] !== 'string') {
      return null
    }
    return { token: raw['token'], authUrl: raw['authUrl'] }
  } catch {
    return null
  }
}

export const completeLastFmAuth = async (
  token: string,
): Promise<LastFmAuthCompleteResult | null> => {
  try {
    const response = await fetch(getApiUrl('/api/lastfm/auth/complete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      return null
    }
    const raw: unknown = await response.json()
    if (!isRecord(raw)) {
      return null
    }
    if (typeof raw['username'] !== 'string') {
      return null
    }
    return { username: raw['username'] }
  } catch {
    return null
  }
}

export const disconnectLastFm = async (): Promise<boolean> => {
  try {
    const response = await fetch(getApiUrl('/api/lastfm/auth'), {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
