import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { wakeLms } from './lmsWakeApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('lmsWakeApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fires a POST to /api/lms/wake', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 })

    await wakeLms()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/api/lms/wake')
    expect(init?.method).toBe('POST')
  })

  it('swallows network errors', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'))

    await expect(wakeLms()).resolves.toBeUndefined()
  })

  it('ignores non-2xx responses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 })

    await expect(wakeLms()).resolves.toBeUndefined()
  })
})
