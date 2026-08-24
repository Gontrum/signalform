import { describe, expect, it } from 'vitest'
import { classifyError, type TagAlbumsApiError } from './error'

describe('classifyError', () => {
  it('classifies a SERVER_ERROR with code DISCOGS_UNREACHABLE as discogs', () => {
    const error: TagAlbumsApiError = {
      type: 'SERVER_ERROR',
      status: 503,
      message: 'Discogs unreachable',
      code: 'DISCOGS_UNREACHABLE',
    }

    expect(classifyError(error)).toBe('discogs')
  })

  it('classifies a SERVER_ERROR with a different code as other', () => {
    const error: TagAlbumsApiError = {
      type: 'SERVER_ERROR',
      status: 500,
      message: 'Internal error',
      code: 'SOME_OTHER_CODE',
    }

    expect(classifyError(error)).toBe('other')
  })

  it('classifies a SERVER_ERROR with no code as other', () => {
    const error: TagAlbumsApiError = {
      type: 'SERVER_ERROR',
      status: 500,
      message: 'Internal error',
    }

    expect(classifyError(error)).toBe('other')
  })

  it('classifies a NETWORK_ERROR as other', () => {
    const error: TagAlbumsApiError = { type: 'NETWORK_ERROR', message: 'Network down' }

    expect(classifyError(error)).toBe('other')
  })

  it('classifies a TIMEOUT_ERROR as other', () => {
    const error: TagAlbumsApiError = { type: 'TIMEOUT_ERROR', message: 'Timed out' }

    expect(classifyError(error)).toBe('other')
  })

  it('classifies an ABORT_ERROR as other', () => {
    const error: TagAlbumsApiError = { type: 'ABORT_ERROR', message: 'Aborted' }

    expect(classifyError(error)).toBe('other')
  })

  it('classifies a PARSE_ERROR as other', () => {
    const error: TagAlbumsApiError = { type: 'PARSE_ERROR', message: 'Bad JSON' }

    expect(classifyError(error)).toBe('other')
  })
})
