/**
 * Tidal enrichment concurrency cap (TIDAL_ENRICH_CONCURRENCY in helpers.ts).
 *
 * Kept out of client.acceptance.test.ts (>150 KB) so future concurrency cases do
 * not force the whole acceptance suite into context.
 *
 * Regression test for the 2026-08-18 production OOM-kill: unbounded
 * `Promise.allSettled(tracks.map(enrichSingleTrack))` fired every tidal_info
 * enrichment call for a search result at once (13 concurrent calls for a single
 * candidate measured live, LMS Perl process 160MB -> 1.2GB in under 15s). A
 * plain "N tidal_info calls were made" assertion would not catch this — it only
 * proves the total count, not how many ran at the same time. This fake
 * executeCommand tracks the in-flight count itself, the same pattern used for
 * the album-tags sequential-resolution regression test.
 */

import { describe, it, expect } from "vitest";
import { ok, type Result } from "@signalform/shared";
import { createSearchMethods } from "./search.js";
import { TIDAL_ENRICH_CONCURRENCY } from "./helpers.js";
import type { ExecuteDeps, LmsResultParser } from "./execute.js";
import type { LmsCommand, LmsError } from "./types.js";

const TRACK_COUNT = 12;
const BASE_TIDAL_ID = 58990000;

const localPayload = { titles_loop: [], count: 0 };

const tidalSearchPayload = {
  loop_loop: Array.from({ length: TRACK_COUNT }, (_, i) => ({
    id: String(i + 1),
    name: `Track ${i + 1}`,
    url: `tidal://${BASE_TIDAL_ID + i}.flc`,
    isaudio: 1,
    type: "audio",
  })),
};

const tidalInfoPayloadFor = (trackId: string): unknown => ({
  loop_loop: [
    { id: "2", name: `Album: Album ${trackId}` },
    { id: "3", name: `Interpret: Artist ${trackId}` },
  ],
});

describe("Tidal enrichment concurrency", () => {
  it(`enriches all ${TRACK_COUNT} tracks in chunks, never more than ${TIDAL_ENRICH_CONCURRENCY} tidal_info calls in flight at once`, async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let tidalInfoCalls = 0;

    function execute(
      command: LmsCommand,
      abortSignal?: AbortSignal,
    ): Promise<Result<unknown, LmsError>>;
    function execute<T>(
      command: LmsCommand,
      parser: LmsResultParser<T>,
      abortSignal?: AbortSignal,
    ): Promise<Result<T, LmsError>>;
    async function execute<T>(
      command: LmsCommand,
      parserOrAbortSignal?: LmsResultParser<T> | AbortSignal,
    ): Promise<Result<unknown, LmsError> | Result<T, LmsError>> {
      const parser =
        typeof parserOrAbortSignal === "function"
          ? parserOrAbortSignal
          : undefined;

      const respond = (payload: unknown): Result<unknown, LmsError> =>
        parser ? parser(payload) : ok(payload);

      if (command[0] === "titles") {
        return respond(localPayload);
      }

      if (command[0] === "tidal" && command[1] === "items") {
        return respond(tidalSearchPayload);
      }

      // tidal_info: the enrichment call under test.
      tidalInfoCalls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;

      const idArg = command[4];
      const trackId = typeof idArg === "string" ? idArg.replace("id:", "") : "";
      return respond(tidalInfoPayloadFor(trackId));
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
    const result = await search("radiohead");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Every track was actually enriched — not just the first chunk. A cap that
    // silently drops trailing tracks (rather than batching them) would fail this.
    expect(tidalInfoCalls).toBe(TRACK_COUNT);
    expect(maxInFlight).toBeLessThanOrEqual(TIDAL_ENRICH_CONCURRENCY);
    // 12 tracks over a cap of 5 must fill at least one full chunk — proves the
    // batching actually uses the cap's concurrency, not e.g. one-at-a-time
    // (which would also satisfy "at most 5" but defeat the point of batching).
    expect(maxInFlight).toBe(TIDAL_ENRICH_CONCURRENCY);

    expect(result.value.tracks).toHaveLength(TRACK_COUNT);
    result.value.tracks.forEach((track, i) => {
      const trackId = String(BASE_TIDAL_ID + i);
      expect(track.artist).toBe(`Artist ${trackId}`);
      expect(track.album).toBe(`Album ${trackId}`);
    });
  });
});
