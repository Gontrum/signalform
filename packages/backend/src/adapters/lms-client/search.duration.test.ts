/**
 * Local search duration (LMS `titles` tag d).
 *
 * Kept out of client.acceptance.test.ts (138 KB) so future duration cases do not
 * force the whole acceptance suite into context.
 *
 * The fake executeCommand runs the parser it is handed, exactly like the real one,
 * so these cases exercise the local-search zod schema and not just the mapping.
 */

import { describe, it, expect } from "vitest";
import { ok, type Result } from "@signalform/shared";
import { createSearchMethods } from "./search.js";
import type { ExecuteDeps, LmsResultParser } from "./execute.js";
import type { LmsCommand, LmsError, SearchResult } from "./types.js";

type LocalSearchProbe = {
  readonly runSearch: () => Promise<readonly SearchResult[]>;
  readonly sentCommand: () => LmsCommand;
};

const givenLocalSearchReturns = (payload: unknown): LocalSearchProbe => {
  let sentCommand: LmsCommand = [""];

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
    sentCommand = command;
    return Promise.resolve(
      typeof parserOrAbortSignal === "function"
        ? parserOrAbortSignal(payload)
        : ok(payload),
    );
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

  return {
    sentCommand: () => sentCommand,
    // tidalEnabled: false keeps the Tidal branch (and its 450 ms race) out of these cases.
    runSearch: async (): Promise<readonly SearchResult[]> => {
      const result = await search("breathe", { tidalEnabled: false });
      expect(result.ok).toBe(true);
      return result.ok ? result.value.tracks : [];
    },
  };
};

const localTrack = (
  overrides: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  id: 2574,
  title: "Breathe",
  artist: "Pink Floyd",
  album: "Dark Side of the Moon",
  url: "file:///music/breathe.flac",
  ...overrides,
});

const requestedTagLetters = (command: LmsCommand): readonly string[] => {
  const tagsArg = command.find(
    (part): part is string =>
      typeof part === "string" && part.startsWith("tags:"),
  );
  return tagsArg === undefined
    ? []
    : [...tagsArg.slice("tags:".length).split(",")].sort();
};

const durationOfSingleHit = async (
  rawDuration: Readonly<Record<string, unknown>>,
): Promise<number | undefined> => {
  const probe = givenLocalSearchReturns({
    titles_loop: [localTrack(rawDuration)],
    count: 1,
  });
  const tracks = await probe.runSearch();
  expect(tracks).toHaveLength(1);
  return tracks[0]?.duration;
};

describe("local search duration", () => {
  it("asks LMS for every tag it maps, duration (d) included", async () => {
    const probe = givenLocalSearchReturns({ titles_loop: [], count: 0 });

    await probe.runSearch();

    // Compared as a set of the letters actually sent: reordering the tag string
    // stays green, silently dropping one of them does not.
    expect(requestedTagLetters(probe.sentCommand())).toEqual(
      [...["b", "r", "o", "x", "u", "l", "a", "A", "t", "S", "e", "d"]].sort(),
    );
  });

  it("maps a numeric duration to seconds", async () => {
    expect(await durationOfSingleHit({ duration: 245.3 })).toBe(245.3);
  });

  it("maps a string duration to the same number — LMS sends both shapes", async () => {
    expect(await durationOfSingleHit({ duration: "245.3" })).toBe(245.3);
  });

  it("leaves duration undefined when LMS omits the field", async () => {
    expect(await durationOfSingleHit({})).toBeUndefined();
  });

  it("leaves duration undefined for an empty string instead of coercing to 0", async () => {
    expect(await durationOfSingleHit({ duration: "" })).toBeUndefined();
  });

  it("leaves duration undefined for an unparsable value instead of NaN", async () => {
    const duration = await durationOfSingleHit({ duration: "abc" });

    expect(duration).toBeUndefined();
    // NaN is falsy and would slip past a truthiness check — assert it explicitly.
    expect(Number.isNaN(duration)).toBe(false);
  });

  it("keeps duration per track when LMS returns a mixed batch", async () => {
    const probe = givenLocalSearchReturns({
      titles_loop: [
        localTrack({ id: 1, title: "Time", duration: "413" }),
        localTrack({ id: 2, title: "Money", duration: 382.5 }),
        localTrack({ id: 3, title: "Us and Them" }),
      ],
      count: 3,
    });

    const tracks = await probe.runSearch();

    expect(tracks.map((track) => track.duration)).toEqual([
      413,
      382.5,
      undefined,
    ]);
  });
});
