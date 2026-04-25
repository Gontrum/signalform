import { describe, it, expect } from 'vitest'
import { getMessage, messages, type MessageKey } from './index'

// Basic sanity tests for the message catalog and getMessage helper.
describe('i18n/messages', () => {
  it('has both en and de message maps', () => {
    expect(messages.en).toBeDefined()
    expect(messages.de).toBeDefined()
  })

  it('returns the key when language is unknown', () => {
    const key: MessageKey = 'settings.title'
    // @ts-expect-error – unknown language is intentionally unsupported
    expect(getMessage('fr', key)).toBe(key)
  })

  it('returns the key when translation is missing for a known language', () => {
    // @ts-expect-error intentionally exercises missing-key fallback
    expect(getMessage('en', 'non.existing.key')).toBe('non.existing.key')
  })
})
