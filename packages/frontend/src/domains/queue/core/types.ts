import type { BaseApiError, ValidationError } from '@/domains/shared/core/api-errors'

export type QueueMutationError = BaseApiError | ValidationError
