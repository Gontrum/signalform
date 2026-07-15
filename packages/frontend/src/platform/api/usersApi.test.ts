import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getUsers, createUser, renameUser, deleteUser } from './usersApi'
import { SELECTED_USER_KEY, USER_HEADER_NAME } from './userHeader'

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>()

describe('usersApi', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('getUsers', () => {
    it('returns users and activeListenerId on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          users: [
            { id: 'u1', name: 'Ada', lastFmUsername: 'ada_fm', hasLastFmSession: true },
            { id: 'u2', name: 'Ben', hasLastFmSession: false },
          ],
          activeListenerId: 'u1',
        }),
      })

      const result = await getUsers()

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.users).toHaveLength(2)
      expect(result.value.users[0]?.lastFmUsername).toBe('ada_fm')
      expect(result.value.users[1]?.lastFmUsername).toBeUndefined()
      expect(result.value.activeListenerId).toBe('u1')
    })

    it('accepts a response without activeListenerId', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ users: [] }),
      })

      const result = await getUsers()

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.users).toEqual([])
      expect(result.value.activeListenerId).toBeUndefined()
    })

    it('returns SERVER_ERROR on non-200', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })

      const result = await getUsers()

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.type).toBe('SERVER_ERROR')
      if (result.error.type !== 'SERVER_ERROR') return
      expect(result.error.status).toBe(500)
    })

    it('returns NETWORK_ERROR on fetch failure', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      const result = await getUsers()

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.type).toBe('NETWORK_ERROR')
    })

    it('returns PARSE_ERROR on malformed body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ users: [{ id: 'u1' }] }),
      })

      const result = await getUsers()

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.type).toBe('PARSE_ERROR')
    })

    it('injects the selected-user header into the request', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u1')
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ users: [] }),
      })

      await getUsers()

      const init = fetchMock.mock.calls[0]?.[1]
      expect(new Headers(init?.headers).get(USER_HEADER_NAME)).toBe('u1')
    })
  })

  describe('createUser', () => {
    it('sends POST with the name and returns the created user', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 'u3', name: 'Cleo' }),
      })

      const result = await createUser('Cleo')

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toEqual({ id: 'u3', name: 'Cleo' })

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/users')
      expect(fetchCall?.[1]?.method).toBe('POST')
      expect(fetchCall?.[1]?.body).toBe(JSON.stringify({ name: 'Cleo' }))
    })
  })

  describe('renameUser', () => {
    it('sends PUT to /api/users/:id with the new name', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 })

      const result = await renameUser('u2', 'Benjamin')

      expect(result.ok).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/users/u2')
      expect(fetchCall?.[1]?.method).toBe('PUT')
      expect(fetchCall?.[1]?.body).toBe(JSON.stringify({ name: 'Benjamin' }))
    })
  })

  describe('deleteUser', () => {
    it('sends DELETE to /api/users/:id', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 })

      const result = await deleteUser('u2')

      expect(result.ok).toBe(true)

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[0]).toContain('/api/users/u2')
      expect(fetchCall?.[1]?.method).toBe('DELETE')
    })

    it('returns SERVER_ERROR on failure', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 })

      const result = await deleteUser('missing')

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.type).toBe('SERVER_ERROR')
      if (result.error.type !== 'SERVER_ERROR') return
      expect(result.error.status).toBe(404)
    })
  })
})
