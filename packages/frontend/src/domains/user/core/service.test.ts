import { describe, it, expect } from 'vitest'
import { resolveSelectedUser, needsSelection } from './service'
import type { UserSummary } from './service'

describe('resolveSelectedUser', () => {
  it('returns the stored id when it matches a user', () => {
    const users = givenUsers('alice', 'bob')

    const result = resolveSelectedUser(users, 'bob')

    expect(result).toBe('bob')
  })

  it('returns undefined for a stale stored id with two users', () => {
    const users = givenUsers('alice', 'bob')

    const result = resolveSelectedUser(users, 'gone')

    expect(result).toBeUndefined()
  })

  it('auto-selects a single user without stored id', () => {
    const users = givenUsers('alice')

    const result = resolveSelectedUser(users, undefined)

    expect(result).toBe('alice')
  })

  it('auto-selects the single user when the stored id is stale', () => {
    const users = givenUsers('alice')

    const result = resolveSelectedUser(users, 'gone')

    expect(result).toBe('alice')
  })

  it('returns undefined for an empty user list', () => {
    const result = resolveSelectedUser([], undefined)

    expect(result).toBeUndefined()
  })

  it('returns undefined for multiple users without stored id', () => {
    const users = givenUsers('alice', 'bob')

    const result = resolveSelectedUser(users, undefined)

    expect(result).toBeUndefined()
  })
})

describe('needsSelection', () => {
  it('returns false for an empty list without selection', () => {
    expect(needsSelection([], undefined)).toBe(false)
  })

  it('returns false for an empty list with selection', () => {
    expect(needsSelection([], 'alice')).toBe(false)
  })

  it('returns false for a single user without selection', () => {
    expect(needsSelection(givenUsers('alice'), undefined)).toBe(false)
  })

  it('returns false for a single user with selection', () => {
    expect(needsSelection(givenUsers('alice'), 'alice')).toBe(false)
  })

  it('returns true for two users without selection', () => {
    expect(needsSelection(givenUsers('alice', 'bob'), undefined)).toBe(true)
  })

  it('returns false for two users with selection', () => {
    expect(needsSelection(givenUsers('alice', 'bob'), 'bob')).toBe(false)
  })
})

// === GIVEN ===

const givenUsers = (...ids: readonly string[]): readonly UserSummary[] =>
  ids.map((id) => ({
    id,
    name: `Name of ${id}`,
    hasLastFmSession: false,
  }))
