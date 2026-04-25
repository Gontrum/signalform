/**
 * Retry utility for LMS client
 *
 * Retries a Result-returning async function with exponential backoff.
 * Only retries on NetworkError and TimeoutError — all other errors pass through immediately.
 *
 * Backoff schedule (baseDelayMs = 1000, maxAttempts = 3):
 *   attempt 1 → fail → wait 1s
 *   attempt 2 → fail → wait 2s
 *   attempt 3 → fail → return last error
 */

import type { Result } from "@signalform/shared";
import type { LmsError } from "./types.js";

type RetryOptions = {
  readonly maxAttempts: number; // default: 3
  readonly baseDelayMs: number; // default: 1000
  readonly delayFn?: (ms: number) => Promise<void>; // injectable for tests
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
};

const isRetryable = (error: LmsError): boolean =>
  error.type === "NetworkError" || error.type === "TimeoutError";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getDelayMs = (baseDelayMs: number, attempt: number): number =>
  baseDelayMs * Math.pow(2, attempt - 1);

const withRetryAttempt = async <T>(
  fn: () => Promise<Result<T, LmsError>>,
  opts: RetryOptions,
  delayFn: (ms: number) => Promise<void>,
  onRetry:
    | ((attempt: number, error: LmsError, delayMs: number) => void)
    | undefined,
  attempt: number,
): Promise<Result<T, LmsError>> => {
  const result = await fn();

  if (result.ok) {
    return result;
  }

  if (!isRetryable(result.error) || attempt >= opts.maxAttempts) {
    return result;
  }

  const delayMs = getDelayMs(opts.baseDelayMs, attempt);
  onRetry?.(attempt, result.error, delayMs);
  if (delayMs > 0) {
    await delayFn(delayMs);
  }

  return withRetryAttempt(fn, opts, delayFn, onRetry, attempt + 1);
};

export const withRetry = async <T>(
  fn: () => Promise<Result<T, LmsError>>,
  opts: RetryOptions = DEFAULT_RETRY_OPTIONS,
  onRetry?: (attempt: number, error: LmsError, delayMs: number) => void,
): Promise<Result<T, LmsError>> => {
  const delayFn = opts.delayFn ?? delay;

  return withRetryAttempt(fn, opts, delayFn, onRetry, 1);
};
