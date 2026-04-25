import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ok, err } from "@signalform/shared";
import { withRetry } from "./retry.js";
import type { LmsError } from "./types.js";

const networkError = (): LmsError => ({
  type: "NetworkError",
  message: "fetch failed",
});
const timeoutError = (): LmsError => ({
  type: "TimeoutError",
  message: "LMS connection timeout (5s)",
});
const apiError = (): LmsError => ({
  type: "LmsApiError",
  code: 500,
  message: "Internal error",
});
const validationError = (): LmsError => ({
  type: "ValidationError",
  message: "Invalid input",
});

describe("withRetry()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns success immediately on first attempt — no retry", async () => {
    const fn = vi.fn().mockResolvedValue(ok("result"));

    const result = await withRetry(fn);

    expect(result).toEqual(ok("result"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on NetworkError and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err(networkError()))
      .mockResolvedValueOnce(ok("result"));

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual(ok("result"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on TimeoutError and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err(timeoutError()))
      .mockResolvedValueOnce(ok("data"));

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual(ok("data"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exhausts all attempts and returns last error", async () => {
    const fn = vi.fn().mockResolvedValue(err(networkError()));

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000 + 2000);
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff: 1s → 2s → 4s", async () => {
    const fn = vi.fn().mockResolvedValue(err(networkError()));
    const onRetry =
      vi.fn<(attempt: number, error: LmsError, delayMs: number) => void>();

    const promise = withRetry(
      fn,
      { maxAttempts: 4, baseDelayMs: 1000 },
      onRetry,
    );
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    await promise;

    expect(onRetry.mock.calls.map(([, , delayMs]) => delayMs)).toEqual([
      1000, 2000, 4000,
    ]);
  });

  it("does NOT retry on LmsApiError — passes through immediately", async () => {
    const fn = vi.fn().mockResolvedValue(err(apiError()));

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("LmsApiError");
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on ValidationError — passes through immediately", async () => {
    const fn = vi.fn().mockResolvedValue(err(validationError()));

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ValidationError");
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects maxAttempts: 1 — no retry at all", async () => {
    const fn = vi.fn().mockResolvedValue(err(networkError()));

    const result = await withRetry(fn, { maxAttempts: 1, baseDelayMs: 1000 });

    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
