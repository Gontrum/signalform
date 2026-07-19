import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchLmsHealth } from './healthApi'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

const jsonResponse = (
  status: number,
  body: unknown,
): { readonly status: number; readonly json: () => Promise<unknown> } => ({
  status,
  json: () => Promise.resolve(body),
})

describe('healthApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('GETs /health', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { dependencies: { lms: 'connected' } }))

    await fetchLmsHealth()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/health')
    expect(init?.method).toBe('GET')
  })

  it('returns lmsConnected true when the body reports connected', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { dependencies: { lms: 'connected', lastfm: 'available' } }),
    )

    await expect(fetchLmsHealth()).resolves.toEqual({ lmsConnected: true })
  })

  it('reads a parseable body even on HTTP 503', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { dependencies: { lms: 'disconnected', lastfm: 'available' } }),
    )

    await expect(fetchLmsHealth()).resolves.toEqual({ lmsConnected: false })
  })

  it('returns null on a network error', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'))

    await expect(fetchLmsHealth()).resolves.toBeNull()
  })

  it('returns null when the body is not parseable', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })

    await expect(fetchLmsHealth()).resolves.toBeNull()
  })
})
