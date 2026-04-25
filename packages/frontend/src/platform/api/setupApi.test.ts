import { describe, expect, it, vi, beforeEach } from 'vitest'
import { discoverServers, getPlayers } from './setupApi'

describe('setupApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('discovers servers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          servers: [{ host: '127.0.0.1', port: 9000, name: 'Local LMS', version: '9.0.0' }],
        }),
      ),
    )

    const result = await discoverServers()

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value).toEqual([
      { host: '127.0.0.1', port: 9000, name: 'Local LMS', version: '9.0.0' },
    ])
  })

  it('loads players for a server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          players: [{ id: 'player-1', name: 'Living Room', model: 'squeezelite', connected: true }],
        }),
      ),
    )

    const result = await getPlayers('127.0.0.1', 9000)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value).toEqual([
      { id: 'player-1', name: 'Living Room', model: 'squeezelite', connected: true },
    ])
  })
})
