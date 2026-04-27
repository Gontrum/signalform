import type { BaseApiError, ValidationError } from '@/domains/shared/core/api-errors'

export type QueueMutationError = BaseApiError | ValidationError

export type QueueDropPosition = 'before' | 'after'

export type QueueAutoScrollConfig = {
  readonly thresholdPx: number
  readonly maxStepPx: number
}
