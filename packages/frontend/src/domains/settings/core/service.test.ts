import { describe, it, expect } from 'vitest'
import { createSettingsConfigUpdate } from './service'

const makeInput = (
  overrides: Partial<Parameters<typeof createSettingsConfigUpdate>[0]> = {},
): Parameters<typeof createSettingsConfigUpdate>[0] => ({
  lmsHost: '192.168.1.100',
  lmsPort: '9000',
  lmsMacAddress: '',
  playerId: 'aa:bb:cc:dd:ee:ff',
  language: 'en',
  lastFmApiKey: '',
  lastFmSharedSecret: '',
  fanartApiKey: '',
  ...overrides,
})

describe('createSettingsConfigUpdate', () => {
  it('sets lmsMacAddress from the input', () => {
    const result = createSettingsConfigUpdate(makeInput({ lmsMacAddress: '00:11:22:33:44:55' }))

    expect(result.lmsMacAddress).toBe('00:11:22:33:44:55')
  })

  it('clears lmsMacAddress via null for an empty input', () => {
    const result = createSettingsConfigUpdate(makeInput({ lmsMacAddress: '' }))

    expect(result.lmsMacAddress).toBeNull()
  })

  it('clears lmsMacAddress via null for a whitespace-only input', () => {
    const result = createSettingsConfigUpdate(makeInput({ lmsMacAddress: '   ' }))

    expect(result.lmsMacAddress).toBeNull()
  })

  it('trims surrounding whitespace from lmsMacAddress', () => {
    const result = createSettingsConfigUpdate(makeInput({ lmsMacAddress: '  00:11:22:33:44:55  ' }))

    expect(result.lmsMacAddress).toBe('00:11:22:33:44:55')
  })
})
