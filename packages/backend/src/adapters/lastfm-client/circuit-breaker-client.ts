/**
 * Circuit Breaker Decorator for LastFmClient (Story 6.8)
 *
 * Wraps a LastFmClient with circuit breaker logic.
 * State machine: CLOSED → OPEN (after failureThreshold qualifying failures)
 *                OPEN → HALF_OPEN (after resetTimeoutMs)
 *                HALF_OPEN → CLOSED (on success) | OPEN (on failure)
 *
 * Qualifying failures (trip the circuit): NetworkError, TimeoutError, RateLimitError
 * Non-qualifying: NotFoundError, ApiError, ParseError, CircuitOpenError
 */

import { err } from "@signalform/shared";
import type { Result } from "@signalform/shared";
import type {
  LastFmClient,
  LastFmError,
  CircuitBreakerConfig,
  CircuitState,
} from "./types.js";

export const createCircuitBreakerLastFmClient = (
  inner: LastFmClient,
  config: CircuitBreakerConfig,
): LastFmClient => {
  type CircuitBreakerState = {
    readonly circuitState: CircuitState;
    readonly failureCount: number;
    readonly resetTimer: ReturnType<typeof setTimeout> | null;
  };

  const ref = {
    current: {
      circuitState: "CLOSED" as CircuitState,
      failureCount: 0,
      resetTimer: null as ReturnType<typeof setTimeout> | null,
    } satisfies CircuitBreakerState,
  };

  const scheduleHalfOpen = (): void => {
    if (ref.current.resetTimer !== null) {
      clearTimeout(ref.current.resetTimer);
    }
    const resetTimer = setTimeout(() => {
      ref.current = { ...ref.current, circuitState: "HALF_OPEN" };
    }, config.resetTimeoutMs);
    ref.current = { ...ref.current, resetTimer };
  };

  const isQualifyingFailure = (error: LastFmError): boolean =>
    error.type === "NetworkError" ||
    error.type === "TimeoutError" ||
    error.type === "RateLimitError";

  const recordFailure = (error: LastFmError): void => {
    if (!isQualifyingFailure(error)) {
      return;
    }
    if (ref.current.circuitState === "HALF_OPEN") {
      ref.current = { ...ref.current, circuitState: "OPEN" };
      scheduleHalfOpen();
      return;
    }
    if (ref.current.circuitState === "CLOSED") {
      const nextFailureCount = ref.current.failureCount + 1;
      ref.current = { ...ref.current, failureCount: nextFailureCount };
      if (nextFailureCount >= config.failureThreshold) {
        ref.current = { ...ref.current, circuitState: "OPEN" };
        scheduleHalfOpen();
      }
    }
  };

  const recordSuccess = (): void => {
    if (ref.current.resetTimer !== null) {
      clearTimeout(ref.current.resetTimer);
    }
    ref.current = { circuitState: "CLOSED", failureCount: 0, resetTimer: null };
  };

  const wrapCall = async <T>(
    fn: () => Promise<Result<T, LastFmError>>,
  ): Promise<Result<T, LastFmError>> => {
    if (ref.current.circuitState === "OPEN") {
      return err({
        type: "CircuitOpenError",
        message: "Circuit breaker is open",
      });
    }
    const result = await fn();
    if (result.ok) {
      recordSuccess();
    } else {
      recordFailure(result.error);
    }
    return result;
  };

  return {
    getSimilarTracks: (artist, track, limit) =>
      wrapCall(() => inner.getSimilarTracks(artist, track, limit)),
    getSimilarArtists: (artist, limit) =>
      wrapCall(() => inner.getSimilarArtists(artist, limit)),
    getArtistInfo: (artist, language) =>
      wrapCall(() => inner.getArtistInfo(artist, language)),
    getAlbumInfo: (artist, album, language) =>
      wrapCall(() => inner.getAlbumInfo(artist, album, language)),
    getCircuitState: () => ref.current.circuitState,
  };
};
