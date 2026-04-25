import { z } from 'zod'
import { ok, err, type Result } from '@signalform/shared'

type ParseError = { readonly type: 'PARSE_ERROR'; readonly message: string }

export const parseResponse = <T>(schema: z.ZodSchema<T>, data: unknown): Result<T, ParseError> => {
  const result = schema.safeParse(data)
  if (!result.success) {
    return err({ type: 'PARSE_ERROR', message: result.error.message })
  }
  return ok(result.data)
}
