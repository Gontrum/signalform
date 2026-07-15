import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from '@signalform/shared'
import type { ApiUser } from '@/platform/api/usersApi'

vi.mock('@/platform/api/usersApi', () => ({
  getUsers: vi.fn(),
}))

// Import AFTER mocks
import { useUserStore } from '@/domains/user/shell/useUserStore'
import { getUsers } from '@/platform/api/usersApi'
import { SELECTED_USER_KEY } from '@/platform/api/userHeader'

const mockGetUsers = vi.mocked(getUsers)

const makeUser = (overrides: Partial<ApiUser> = {}): ApiUser => ({
  id: 'u1',
  name: 'Ada',
  hasLastFmSession: false,
  ...overrides,
})

const networkError = { type: 'NETWORK_ERROR', message: 'offline' } as const

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('has empty initial state', () => {
    const store = useUserStore()

    expect(store.users).toEqual([])
    expect(store.activeListenerId).toBeUndefined()
    expect(store.selectedUserId).toBeUndefined()
    expect(store.needsSelection).toBe(false)
    expect(store.hasLastFmSession).toBe(false)
  })

  describe('load', () => {
    it('auto-selects and persists a single user', async () => {
      mockGetUsers.mockResolvedValue(ok({ users: [makeUser()], activeListenerId: 'u1' }))
      const store = useUserStore()

      await store.load()

      expect(store.users).toHaveLength(1)
      expect(store.selectedUserId).toBe('u1')
      expect(store.activeListenerId).toBe('u1')
      expect(store.needsSelection).toBe(false)
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBe('u1')
    })

    it('requires selection with two users and no stored id', async () => {
      mockGetUsers.mockResolvedValue(
        ok({ users: [makeUser(), makeUser({ id: 'u2', name: 'Ben' })] }),
      )
      const store = useUserStore()

      await store.load()

      expect(store.selectedUserId).toBeUndefined()
      expect(store.needsSelection).toBe(true)
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBeNull()
    })

    it('respects a stored id that matches an existing user', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'u2')
      mockGetUsers.mockResolvedValue(
        ok({ users: [makeUser(), makeUser({ id: 'u2', name: 'Ben' })] }),
      )
      const store = useUserStore()

      await store.load()

      expect(store.selectedUserId).toBe('u2')
      expect(store.needsSelection).toBe(false)
    })

    it('ignores a stored id that no longer matches any user and clears it from storage', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'gone')
      mockGetUsers.mockResolvedValue(
        ok({ users: [makeUser(), makeUser({ id: 'u2', name: 'Ben' })] }),
      )
      const store = useUserStore()

      await store.load()

      expect(store.selectedUserId).toBeUndefined()
      expect(store.needsSelection).toBe(true)
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBeNull()
    })

    it('replaces a stale stored id when a single user is auto-selected', async () => {
      localStorage.setItem(SELECTED_USER_KEY, 'gone')
      mockGetUsers.mockResolvedValue(ok({ users: [makeUser()], activeListenerId: 'u1' }))
      const store = useUserStore()

      await store.load()

      expect(store.selectedUserId).toBe('u1')
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBe('u1')
    })

    it('leaves state untouched when getUsers fails', async () => {
      mockGetUsers.mockResolvedValue(err(networkError))
      const store = useUserStore()

      await store.load()

      expect(store.users).toEqual([])
      expect(store.selectedUserId).toBeUndefined()
      expect(store.needsSelection).toBe(false)
    })
  })

  describe('selectUser', () => {
    it('persists and sets the selected user', async () => {
      mockGetUsers.mockResolvedValue(
        ok({ users: [makeUser(), makeUser({ id: 'u2', name: 'Ben' })] }),
      )
      const store = useUserStore()
      await store.load()

      store.selectUser('u2')

      expect(store.selectedUserId).toBe('u2')
      expect(store.needsSelection).toBe(false)
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBe('u2')
    })
  })

  describe('hasLastFmSession', () => {
    it('reflects the selected user session', async () => {
      mockGetUsers.mockResolvedValue(
        ok({
          users: [
            makeUser({ hasLastFmSession: false }),
            makeUser({ id: 'u2', name: 'Ben', hasLastFmSession: true, lastFmUsername: 'ben_fm' }),
          ],
        }),
      )
      const store = useUserStore()
      await store.load()

      store.selectUser('u1')
      expect(store.hasLastFmSession).toBe(false)

      store.selectUser('u2')
      expect(store.hasLastFmSession).toBe(true)
      expect(store.selectedUser?.name).toBe('Ben')
    })
  })
})
