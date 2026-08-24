/**
 * item_id path-injection regression test (2026-08-19 production OOM).
 *
 * LMS splits item_id on "." into a menu navigation path
 * (Slim::Control::XMLBrowser: split /\./, $item_id). A dot in the search
 * query used to leak straight into item_id, sending LMS into an unrelated,
 * potentially huge catalog node instead of the search results — see
 * .scratch/analyse-2026-08-19-lms-oom-tag-suche.md for the full incident.
 *
 * Kept out of client.acceptance.test.ts (135 KB) so future sanitization
 * cases do not force the whole acceptance suite into context.
 */

import { describe, it, expect } from "vitest";
import { ok, type Result } from "@signalform/shared";
import { createSearchMethods } from "./search.js";
import type { ExecuteDeps, LmsResultParser } from "./execute.js";
import type { LmsCommand, LmsError } from "./types.js";

const localPayload = { titles_loop: [], count: 0 };
const tidalPayload = { loop_loop: [] };

// Assertion helpers narrow via vitest's own `expect` (which throws internally
// on failure) instead of an explicit `throw` — satisfies both the
// TypeScript `asserts` contract and the repo's no-throw-statements rule.
function assertCommandCaptured(
  command: LmsCommand | undefined,
): asserts command is LmsCommand {
  expect(command).toBeDefined();
}

function assertIsString(value: unknown): asserts value is string {
  expect(typeof value).toBe("string");
}

describe("Tidal track search item_id sanitization", () => {
  it("builds a two-component item_id and keeps the original title in search: for a poisoned query", async () => {
    let tidalCommand: LmsCommand | undefined;

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
      if (command[0] === "tidal" && command[1] === "items") {
        tidalCommand = command;
      }
      const payload = command[0] === "titles" ? localPayload : tidalPayload;
      const answer =
        typeof parserOrAbortSignal === "function"
          ? parserOrAbortSignal(payload)
          : ok(payload);
      return Promise.resolve(answer);
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
    const result = await search("St. Anger");

    expect(result.ok).toBe(true);
    assertCommandCaptured(tidalCommand);

    const itemIdParam = tidalCommand[4];
    assertIsString(itemIdParam);
    const itemId = itemIdParam.replace(/^item_id:/, "");

    // "7_St  Anger.4" -> ["7_St  Anger", "4"] — exactly two path components.
    // A third component means the poisoned dot leaked back into item_id and
    // LMS would navigate into the wrong, unbounded catalog node.
    expect(itemId.split(".").length).toBe(2);

    // search: still carries the untouched original title (with the dot) —
    // only item_id is sanitized, so search relevance is unaffected.
    expect(tidalCommand[5]).toBe("search:St. Anger");
  });
});
