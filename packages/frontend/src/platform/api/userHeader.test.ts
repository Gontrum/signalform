import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SELECTED_USER_KEY,
  USER_HEADER_NAME,
  getSelectedUserId,
  removeSelectedUserId,
  setSelectedUserId,
  withUserHeader,
} from './userHeader'

describe('userHeader', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getSelectedUserId / setSelectedUserId', () => {
    it('roundtrips a stored user id', () => {
      setSelectedUserId('user-42')

      expect(getSelectedUserId()).toBe('user-42')
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBe('user-42')
    })

    it('returns undefined when nothing is stored', () => {
      expect(getSelectedUserId()).toBeUndefined()
    })

    it('returns undefined when localStorage access throws', () => {
      const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        // eslint-disable-next-line functional/no-throw-statements -- simulates unavailable Web Storage
        throw new Error('storage unavailable')
      })
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        // eslint-disable-next-line functional/no-throw-statements -- simulates unavailable Web Storage
        throw new Error('storage unavailable')
      })

      expect(getSelectedUserId()).toBeUndefined()
      expect(() => {
        setSelectedUserId('user-42')
      }).not.toThrow()

      getItemSpy.mockRestore()
      setItemSpy.mockRestore()
    })
  })

  describe('removeSelectedUserId', () => {
    it('clears the stored user id', () => {
      setSelectedUserId('user-42')

      removeSelectedUserId()

      expect(getSelectedUserId()).toBeUndefined()
      expect(localStorage.getItem(SELECTED_USER_KEY)).toBeNull()
    })

    it('does not throw when localStorage access throws', () => {
      const removeItemSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        // eslint-disable-next-line functional/no-throw-statements -- simulates unavailable Web Storage
        throw new Error('storage unavailable')
      })

      expect(() => {
        removeSelectedUserId()
      }).not.toThrow()

      removeItemSpy.mockRestore()
    })
  })

  describe('withUserHeader', () => {
    it('adds the user header when a user id is stored', () => {
      setSelectedUserId('user-42')

      const result = withUserHeader({ method: 'POST' })

      expect(result.method).toBe('POST')
      expect(new Headers(result.headers).get(USER_HEADER_NAME)).toBe('user-42')
    })

    it('returns init unchanged when no user id is stored', () => {
      const init: RequestInit = {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }

      expect(withUserHeader(init)).toBe(init)
    })

    it('returns an empty init when called without arguments and no user id is stored', () => {
      expect(withUserHeader()).toEqual({})
    })

    it('merges the user header with existing headers', () => {
      setSelectedUserId('user-42')

      const result = withUserHeader({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const headers = new Headers(result.headers)
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get(USER_HEADER_NAME)).toBe('user-42')
    })
  })
})
