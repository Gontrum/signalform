import { getApiUrl } from '@/utils/runtimeUrls'

export const loveTrack = async (artist: string, track: string): Promise<boolean> => {
  try {
    const response = await fetch(getApiUrl('/api/lastfm/love'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, track }),
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

export const unloveTrack = async (artist: string, track: string): Promise<boolean> => {
  try {
    const response = await fetch(getApiUrl('/api/lastfm/love'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, track }),
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
