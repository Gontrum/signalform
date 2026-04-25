/**
 * Circuit Breaker Client — Acceptance Tests (Story 6.8)
 * Written BEFORE implementation (red phase).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { err, ok } from "@signalform/shared";
import type { LastFmClient, LastFmError } from "./types.js";
import { createCircuitBreakerLastFmClient } from "./circuit-breaker-client.js";

// --- Helpers ----------------------------------------------------------------

const makeNetworkError = (): LastFmError => ({
  type: "NetworkError",
  message: "Network error",
});

const makeTimeoutError = (): LastFmError => ({
  type: "TimeoutError",
  message: "Timeout error",
});

const makeRateLimitError = (): LastFmError => ({
  type: "RateLimitError",
  message: "Rate limit error",
});

const makeNotFoundError = (): LastFmError => ({
  type: "NotFoundError",
  code: 6,
  message: "Track not found",
});

const makeCircuitOpenError = (): LastFmError => ({
  type: "CircuitOpenError",
  message: "Circuit breaker is open",
});

const makeSimilarTrack = () =>
  ({
    name: "Test Track",
    artist: "Test Artist",
    match: 0.9,
    url: "https://last.fm/test",
  }) as const;

const makeInnerClient = (): {
  readonly client: LastFmClient;
  readonly getSimilarTracksMock: ReturnType<typeof vi.fn>;
  readonly getSimilarArtistsMock: ReturnType<typeof vi.fn>;
  readonly getArtistInfoMock: ReturnType<typeof vi.fn>;
  readonly getAlbumInfoMock: ReturnType<typeof vi.fn>;
} => {
  const getSimilarTracksMock = vi.fn();
  const getSimilarArtistsMock = vi.fn();
  const getArtistInfoMock = vi.fn();
  const getAlbumInfoMock = vi.fn();
  return {
    client: {
      getSimilarTracks: getSimilarTracksMock,
      getSimilarArtists: getSimilarArtistsMock,
      getArtistInfo: getArtistInfoMock,
      getAlbumInfo: getAlbumInfoMock,
      getCircuitState: () => "CLOSED" as const,
    },
    getSimilarTracksMock,
    getSimilarArtistsMock,
    getArtistInfoMock,
    getAlbumInfoMock,
  };
};

const DEFAULT_CONFIG = { failureThreshold: 5, resetTimeoutMs: 60_000 } as const;

/**
 * Helper: make n sequential calls to getSimilarTracks (trips circuit when error mock set).
 * Uses Array.from().reduce to avoid functional/no-let violations.
 */
const makeNCalls = async (cb: LastFmClient, n: number): Promise<void> =>
  Array.from({ length: n }).reduce(async (acc: Promise<void>) => {
    await acc;
    await cb.getSimilarTracks("artist", "track");
  }, Promise.resolve() as Promise<void>);

// --- Tests ------------------------------------------------------------------

describe("createCircuitBreakerLastFmClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC1: opens after 5 consecutive qualifying NetworkErrors; 6th call returns CircuitOpenError", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));

    // 5 failing calls — all return ok:false (NetworkError, not yet open)
    await makeNCalls(cb, 5);
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(5);

    // 6th call: circuit is OPEN → CircuitOpenError, inner NOT called
    const result6 = await cb.getSimilarTracks("artist", "track");
    expect(result6.ok).toBe(false);
    if (!result6.ok) {
      expect(result6.error.type).toBe("CircuitOpenError");
    }
    // inner was called only 5 times, not 6
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(5);
  });

  it("AC2: OPEN state returns CircuitOpenError immediately without calling inner client", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));

    // Trip the circuit
    await makeNCalls(cb, 5);
    getSimilarTracksMock.mockClear();

    // OPEN: subsequent calls must NOT reach inner
    const result = await cb.getSimilarTracks("artist", "track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("CircuitOpenError");
    }
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(0);

    const result2 = await cb.getSimilarArtists("artist");
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error.type).toBe("CircuitOpenError");
    }
  });

  it("AC4a: after 60s, circuit transitions to HALF_OPEN and passes one call through (success → CLOSED)", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));

    // Trip the circuit
    await makeNCalls(cb, 5);

    // Advance time → HALF_OPEN
    vi.advanceTimersByTime(60_000);

    // Now mock success and reset call count
    getSimilarTracksMock.mockClear();
    getSimilarTracksMock.mockResolvedValue(ok([makeSimilarTrack()]));

    const result = await cb.getSimilarTracks("artist", "track");
    expect(result.ok).toBe(true);

    // Circuit should now be CLOSED — next call also passes through
    const result2 = await cb.getSimilarTracks("artist", "track");
    expect(result2.ok).toBe(true);
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(2); // 1 half-open + 1 closed
  });

  it("AC4b: HALF_OPEN failure → back to OPEN, new 60s timer started", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));

    // Trip the circuit
    await makeNCalls(cb, 5);

    // Advance → HALF_OPEN
    vi.advanceTimersByTime(60_000);

    // Half-open call fails → back to OPEN
    const result = await cb.getSimilarTracks("artist", "track");
    expect(result.ok).toBe(false);

    // Circuit is OPEN again — call returns CircuitOpenError immediately
    getSimilarTracksMock.mockClear();
    const resultAfter = await cb.getSimilarTracks("artist", "track");
    expect(resultAfter.ok).toBe(false);
    if (!resultAfter.ok) {
      expect(resultAfter.error.type).toBe("CircuitOpenError");
    }
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(0);

    // After another 60s, HALF_OPEN again
    vi.advanceTimersByTime(60_000);
    getSimilarTracksMock.mockResolvedValue(ok([makeSimilarTrack()]));
    const resultHalfOpen2 = await cb.getSimilarTracks("artist", "track");
    expect(resultHalfOpen2.ok).toBe(true);
  });

  it("AC5: HALF_OPEN success → CLOSED; failure count reset; subsequent calls pass through", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));
    await makeNCalls(cb, 5);

    vi.advanceTimersByTime(60_000);

    // Half-open success → CLOSED
    getSimilarTracksMock.mockResolvedValue(ok([makeSimilarTrack()]));
    await cb.getSimilarTracks("artist", "track");

    // Multiple subsequent calls all pass through (CLOSED state)
    const calls = [
      cb.getSimilarTracks("a", "b"),
      cb.getSimilarTracks("c", "d"),
      cb.getSimilarTracks("e", "f"),
    ];
    const results = await Promise.all(calls);
    results.forEach((r) => {
      expect(r.ok).toBe(true);
    });
  });

  it("AC6: 5× NotFoundError → circuit stays CLOSED; 6th call reaches inner client", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getSimilarTracksMock.mockResolvedValue(err(makeNotFoundError()));

    // 5 NotFoundError calls — circuit stays CLOSED
    await makeNCalls(cb, 5);

    // 6th call: circuit is still CLOSED → inner is called, returns NotFoundError
    const result6 = await cb.getSimilarTracks("artist", "track");
    expect(result6.ok).toBe(false);
    if (!result6.ok) {
      expect(result6.error.type).toBe("NotFoundError"); // NOT CircuitOpenError
    }
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(6);
  });

  it("forwards language to getArtistInfo", async () => {
    const { client: inner, getArtistInfoMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getArtistInfoMock.mockResolvedValue(
      ok({
        name: "The Black Keys",
        listeners: 1,
        playcount: 1,
        tags: [],
        bio: "Deutscher Text",
      }),
    );

    await cb.getArtistInfo("The Black Keys", "de");

    expect(getArtistInfoMock).toHaveBeenCalledWith("The Black Keys", "de");
  });

  it("forwards language to getAlbumInfo", async () => {
    const { client: inner, getAlbumInfoMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    getAlbumInfoMock.mockResolvedValue(
      ok({
        name: "Brothers",
        listeners: 1,
        playcount: 1,
        tags: [],
        wiki: "Deutscher Text",
      }),
    );

    await cb.getAlbumInfo("The Black Keys", "Brothers", "de");

    expect(getAlbumInfoMock).toHaveBeenCalledWith(
      "The Black Keys",
      "Brothers",
      "de",
    );
  });

  it("TimeoutError and RateLimitError also trip the circuit", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    // 3 timeout + 2 rate-limit = 5 qualifying
    getSimilarTracksMock
      .mockResolvedValueOnce(err(makeTimeoutError()))
      .mockResolvedValueOnce(err(makeTimeoutError()))
      .mockResolvedValueOnce(err(makeTimeoutError()))
      .mockResolvedValueOnce(err(makeRateLimitError()))
      .mockResolvedValueOnce(err(makeRateLimitError()));

    await makeNCalls(cb, 5);

    // Circuit is OPEN
    getSimilarTracksMock.mockClear();
    const result = await cb.getSimilarTracks("artist", "track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("CircuitOpenError");
    }
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(0);
  });

  it("success in CLOSED resets failure count (non-threshold run)", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    // 4 failures (below threshold)
    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));
    await makeNCalls(cb, 4);

    // 1 success — resets failure count
    getSimilarTracksMock.mockResolvedValue(ok([makeSimilarTrack()]));
    await cb.getSimilarTracks("artist", "track");

    // Now 4 more failures — circuit should NOT open (count was reset after success)
    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));
    await makeNCalls(cb, 4);

    // 10th call — inner called (circuit still CLOSED, only 4 consecutive failures since reset)
    getSimilarTracksMock.mockClear();
    getSimilarTracksMock.mockResolvedValue(err(makeNetworkError()));
    const result = await cb.getSimilarTracks("artist", "track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError"); // NOT CircuitOpenError
    }
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(1);
  });

  it("CircuitOpenError from inner does NOT trip the circuit", async () => {
    const { client: inner, getSimilarTracksMock } = makeInnerClient();
    const cb = createCircuitBreakerLastFmClient(inner, DEFAULT_CONFIG);

    // Simulate inner returning CircuitOpenError (unusual, but should not count as qualifying)
    getSimilarTracksMock.mockResolvedValue(err(makeCircuitOpenError()));

    await makeNCalls(cb, 5);

    // Circuit must NOT be open — inner is still called on 6th call
    getSimilarTracksMock.mockClear();
    const result = await cb.getSimilarTracks("artist", "track");
    expect(result.ok).toBe(false);
    // inner WAS called (not short-circuited by CB)
    expect(getSimilarTracksMock).toHaveBeenCalledTimes(1);
  });
});
