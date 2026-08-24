/**
 * Tidal search timeout (the Promise.race in search()).
 *
 * Kept out of client.acceptance.test.ts (138 KB) so future timeout cases do not
 * force the whole acceptance suite into context.
 *
 * The fake executeCommand answers per LMS command and delays the Tidal answer by
 * a configurable amount, so the race is exercised end to end, not stubbed out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ok, type Result } from "@signalform/shared";
import { createSearchMethods } from "./search.js";
import { TIDAL_SEARCH_TIMEOUT_MS } from "./helpers.js";
import type { ExecuteDeps, LmsResultParser } from "./execute.js";
import type { LmsCommand, LmsError, SearchResponse } from "./types.js";

// search() races against node:timers/promises, which vi.useFakeTimers() does not
// patch — routing it through globalThis.setTimeout puts the race under timer control.
vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: (ms?: number, value?: unknown): Promise<unknown> =>
      new Promise((resolve) => {
        globalThis.setTimeout(() => resolve(value), ms ?? 0);
      }),
  };
});

// Slowest of eight `tidal items` calls measured against the live LMS on 2026-08-18
// (median 536 ms) — a Tidal answer this slow is normal operation, not a failure.
const MEASURED_MAX_TIDAL_LATENCY_MS = 786;

const localPayload = {
  titles_loop: [
    {
      id: 10,
      title: "Paranoid Android",
      artist: "Radiohead",
      album: "OK Computer",
      url: "file:///music/paranoid.flac",
    },
  ],
  count: 1,
};

const tidalPayload = {
  loop_loop: [
    {
      id: "1",
      name: "Karma Police",
      url: "tidal://58990500.flc",
      isaudio: 1,
      type: "audio",
    },
  ],
};

const tidalInfoPayload = {
  loop_loop: [
    { id: "2", name: "Album: OK Computer" },
    { id: "3", name: "Interpret: Radiohead" },
  ],
};

const answerAfter = <T>(ms: number, value: T): Promise<T> =>
  new Promise((resolve) => {
    globalThis.setTimeout(() => resolve(value), ms);
  });

const payloadFor = (command: LmsCommand): unknown => {
  const verb = command[0];
  if (verb === "titles") {
    return localPayload;
  }
  if (verb === "tidal_info") {
    return tidalInfoPayload;
  }
  return tidalPayload;
};

const searchWithTidalLatency = (
  tidalLatencyMs: number,
): (() => Promise<Result<SearchResponse, LmsError>>) => {
  function execute(
    command: LmsCommand,
    abortSignal?: AbortSignal,
  ): Promise<Result<unknown, LmsError>>;
  function execute<T>(
    command: LmsCommand,
    parser: LmsResultParser<T>,
    abortSignal?: AbortSignal,
  ): Promise<Result<T, LmsError>>;
  function execute<T>(
    command: LmsCommand,
    parserOrAbortSignal?: LmsResultParser<T> | AbortSignal,
  ): Promise<Result<unknown, LmsError> | Result<T, LmsError>> {
    const payload = payloadFor(command);
    const answer =
      typeof parserOrAbortSignal === "function"
        ? parserOrAbortSignal(payload)
        : ok(payload);
    return command[0] === "tidal"
      ? answerAfter(tidalLatencyMs, answer)
      : Promise.resolve(answer);
  }

  const deps: ExecuteDeps = {
    executeCommand: execute,
    executeCommandWithRetry: execute,
    config: {
      host: "localhost",
      port: 9000,
      playerId: "00:00:00:00:00:00",
      timeout: 5000,
    },
  };

  const { search } = createSearchMethods(deps);
  return () => search("radiohead");
};

const runSearch = async (
  tidalLatencyMs: number,
  advanceMs: number,
): Promise<SearchResponse> => {
  const resultPromise = searchWithTidalLatency(tidalLatencyMs)();
  await vi.advanceTimersByTimeAsync(advanceMs);
  const result = await resultPromise;
  expect(result.ok).toBe(true);
  return result.ok ? result.value : { tracks: [], tidalAvailable: false };
};

describe("Tidal search timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps Tidal hits when the answer takes longer than the old 450 ms cap", async () => {
    const response = await runSearch(
      MEASURED_MAX_TIDAL_LATENCY_MS,
      MEASURED_MAX_TIDAL_LATENCY_MS,
    );

    expect(response.tidalAvailable).toBe(true);
    expect(response.tracks.map((track) => track.title)).toEqual([
      "Paranoid Android",
      "Karma Police",
    ]);
    const tidalHit = response.tracks.find((track) => track.source === "tidal");
    expect(tidalHit?.url).toBe("tidal://58990500.flc");
    expect(tidalHit?.artist).toBe("Radiohead");
    expect(tidalHit?.album).toBe("OK Computer");
  });

  it("still reports Tidal unavailable when the answer exceeds the timeout", async () => {
    const response = await runSearch(
      TIDAL_SEARCH_TIMEOUT_MS + 1000,
      TIDAL_SEARCH_TIMEOUT_MS,
    );

    expect(response.tidalAvailable).toBe(false);
    // Local hits survive the Tidal cap — asserted by value, an empty list would
    // satisfy a "no Tidal track present" check vacuously.
    expect(response.tracks.map((track) => track.title)).toEqual([
      "Paranoid Android",
    ]);
  });
});
