import { getApiUrl } from '@/utils/runtimeUrls'

/**
 * Fire-and-forget wake-on-LAN trigger. The backend silently no-ops when no
 * MAC address is configured, and failures are swallowed here — waking a
 * sleeping server is best-effort and must never break the app.
 */
export const wakeLms = async (): Promise<void> => {
  try {
    await fetch(getApiUrl('/api/lms/wake'), {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // best-effort: a failed wake call is irrelevant to the UI
  }
}
