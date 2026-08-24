/**
 * LMS Tidal Search Adapter Unit Tests
 *
 * Covers searchTidalArtists and searchTidalAlbums in createTidalSearchMethods.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err, type Result } from "@signalform/shared";
import { createTidalSearchMethods } from "./tidal-search.js";
import type {
  ExecuteCommand,
  ExecuteDeps,
  LmsResultParser,
} from "./execute.js";
import type { LmsCommand, LmsError } from "./types.js";

const makeExecuteDeps = (
  executeCommand: ExecuteDeps["executeCommand"],
): ExecuteDeps => ({
  executeCommand,
  executeCommandWithRetry: executeCommand,
  config: {
    host: "localhost",
    port: 9000,
    playerId: "00:00:00:00:00:00",
    timeout: 5000,
  },
});

const networkError: LmsError = {
  type: "NetworkError",
  message: "ECONNREFUSED",
};

const rawAlbum = (name: string, image?: string): Record<string, unknown> => ({
  id: "7_madonna the immaculate collection.3.0",
  name,
  type: "playlist",
  isaudio: 0,
  ...(image !== undefined ? { image } : {}),
});

// Typed executeCommand fake that records the exact command array it was
// called with — avoids unsafe `as` casts on vi.fn()'s untyped mock.calls.
const capturingExecuteCommand = (
  payload: unknown,
): {
  readonly executeCommand: ExecuteCommand;
  readonly getCommand: () => LmsCommand | undefined;
} => {
  let captured: LmsCommand | undefined;

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
    captured = command;
    const answer =
      typeof parserOrAbortSignal === "function"
        ? parserOrAbortSignal(payload)
        : ok(payload);
    return Promise.resolve(answer);
  }

  return { executeCommand: execute, getCommand: () => captured };
};

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

// Extracts the two params under test from a captured LMS `tidal items`
// command: the sanitized item_id (with its "item_id:" prefix stripped) and
// the raw search: param.
const readItemIdAndSearchParams = (
  command: LmsCommand | undefined,
): { readonly itemId: string; readonly searchParam: string | number } => {
  assertCommandCaptured(command);
  const itemIdParam = command[4];
  assertIsString(itemIdParam);
  const searchParam = command[5];
  expect(searchParam).toBeDefined();
  return {
    itemId: itemIdParam.replace(/^item_id:/, ""),
    searchParam: searchParam!,
  };
};

describe("searchTidalAlbums", () => {
  it("returns album names on happy path", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [
          rawAlbum("The Immaculate Collection"),
          rawAlbum("Confessions on a Dance Floor"),
        ],
        count: 2,
      }),
    );
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums(
      "Madonna The Immaculate Collection",
      5,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((album) => album.name)).toEqual([
        "The Immaculate Collection",
        "Confessions on a Dance Floor",
      ]);
    }
  });

  it("maps image to an absolute coverArtUrl using host and port", async () => {
    const image =
      "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F4394c947%2F1280x1280.jpg/image.jpg";
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [rawAlbum("The Soul Cages", image)],
        count: 1,
      }),
    );
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums("Sting The Soul Cages", 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toEqual({
        name: "The Soul Cages",
        coverArtUrl: `http://localhost:9000${image}`,
      });
    }
  });

  it("omits coverArtUrl entirely when image is missing or empty", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [rawAlbum("No Image At All"), rawAlbum("Empty Image", "")],
        count: 2,
      }),
    );
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums("Sting", 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((album) => album.name)).toEqual([
        "No Image At All",
        "Empty Image",
      ]);
      expect(result.value.map((album) => "coverArtUrl" in album)).toEqual([
        false,
        false,
      ]);
      expect(result.value).toEqual([
        { name: "No Image At All" },
        { name: "Empty Image" },
      ]);
    }
  });

  it("skips entries whose name is blank", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [
          rawAlbum("   "),
          rawAlbum("Ten Summoner's Tales", "/imageproxy/cover.jpg"),
        ],
        count: 2,
      }),
    );
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums("Sting", 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          name: "Ten Summoner's Tales",
          coverArtUrl: "http://localhost:9000/imageproxy/cover.jpg",
        },
      ]);
    }
  });

  it("returns an empty list when loop_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums("Nonexistent Artist Album", 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it("propagates a Result error when executeCommand fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums("Madonna Aja", 5);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(networkError);
    }
  });

  it("rejects an empty query without calling executeCommand", async () => {
    const executeCommand = vi.fn();
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbums("   ", 5);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("EmptyQueryError");
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("builds the item_id:7_{query}.3 command with want_url:1", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [], count: 0 }));
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    await searchTidalAlbums("Madonna The Immaculate Collection", 5);

    expect(executeCommand.mock.calls[0]?.[0]).toEqual([
      "tidal",
      "items",
      0,
      5,
      "item_id:7_Madonna The Immaculate Collection.3",
      "search:Madonna The Immaculate Collection",
      "want_url:1",
    ]);
  });

  it("sanitizes a dotted query so item_id keeps exactly two path components (regression: 2026-08-19 OOM)", async () => {
    // LMS splits item_id on "." into a menu navigation path
    // (Slim::Control::XMLBrowser: split /\./, $item_id). A dot leaking
    // through here sent LMS into an unrelated, huge catalog node and
    // caused the 2026-08-19 production OOM — see
    // .scratch/analyse-2026-08-19-lms-oom-tag-suche.md.
    const { executeCommand, getCommand } = capturingExecuteCommand({
      loop_loop: [],
      count: 0,
    });
    const { searchTidalAlbums } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    await searchTidalAlbums("Good Night E.P.", 5);

    const { itemId, searchParam } = readItemIdAndSearchParams(getCommand());

    expect(itemId.split(".").length).toBe(2);
    // search: carries the unchanged original title — sanitization must not
    // touch it, or search relevance would suffer.
    expect(searchParam).toBe("search:Good Night E.P.");
  });
});

describe("searchTidalArtists", () => {
  it("sanitizes a dotted query so item_id keeps exactly two path components (regression: 2026-08-19 OOM)", async () => {
    const { executeCommand, getCommand } = capturingExecuteCommand({
      loop_loop: [],
      count: 0,
    });
    const { searchTidalArtists } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    await searchTidalArtists("Mr. Bungle", 0, 10);

    const { itemId, searchParam } = readItemIdAndSearchParams(getCommand());

    expect(itemId.split(".").length).toBe(2);
    expect(searchParam).toBe("search:Mr. Bungle");
  });
});
