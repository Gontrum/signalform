import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseResponse } from './parseResponse'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
})

describe('parseResponse', () => {
  it('returns ok(data) when response matches schema', () => {
    const data: unknown = { name: 'Alice', age: 30 }

    const result = parseResponse(PersonSchema, data)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toBe('Alice')
      expect(result.value.age).toBe(30)
    }
  })

  it('returns err(PARSE_ERROR) when required field is missing', () => {
    const data: unknown = { name: 'Alice' } // age is missing

    const result = parseResponse(PersonSchema, data)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
      expect(result.error.message).toBeTruthy()
    }
  })

  it('returns err(PARSE_ERROR) when field has wrong type', () => {
    const data: unknown = { name: 'Alice', age: 'not-a-number' }

    const result = parseResponse(PersonSchema, data)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  it('returns err(PARSE_ERROR) when data is null', () => {
    const data: unknown = null

    const result = parseResponse(PersonSchema, data)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })

  it('returns err(PARSE_ERROR) when data is a plain string', () => {
    const data: unknown = 'not-an-object'

    const result = parseResponse(PersonSchema, data)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('PARSE_ERROR')
    }
  })
})
