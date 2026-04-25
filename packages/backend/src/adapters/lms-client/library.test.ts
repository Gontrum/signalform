/**
 * LMS Library Adapter Unit Tests
 *
 * Tests the error paths and sorting logic that are invisible when
 * route integration tests mock the entire LmsClient.
 *
 * Focus:
 * - getLibraryAlbums: graceful degradation when songs-genre query fails
 * - getAlbumTracks: URL-primary + tracknum-fallback sort order
 * - getRescanProgress: JsonParseError propagation
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createLibraryMethods } from "./library.js";
import type { ExecuteDeps } from "./execute.js";
import type { LmsError } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── getLibraryAlbums — genre enrichment ─────────────────────────────────────

describe("getLibraryAlbums", () => {
  it("returns albums with genre when songs query succeeds", async () => {
    const executeCommand = vi
      .fn()
      // First call: albums
      .mockResolvedValueOnce(
        ok({
          albums_loop: [
            {
              id: 1,
              album: "Dark Side",
              artist: "Pink Floyd",
              year: 1973,
              artwork_track_id: "art1",
            },
          ],
          count: 1,
        }),
      )
      // Second call: songs (genre enrichment)
      .mockResolvedValueOnce(
        ok({
          titles_loop: [{ album_id: "1", genre: "Rock" }],
        }),
      );
    const { getLibraryAlbums } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryAlbums(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums[0]?.genre).toBe("Rock");
      expect(result.value.count).toBe(1);
    }
  });

  it("returns albums without genre (genre=undefined) when songs query fails — graceful degradation", async () => {
    const executeCommand = vi
      .fn()
      // First call: albums succeeds
      .mockResolvedValueOnce(
        ok({
          albums_loop: [
            {
              id: 1,
              album: "Dark Side",
              artist: "Pink Floyd",
              year: 1973,
              artwork_track_id: "art1",
            },
            {
              id: 2,
              album: "The Wall",
              artist: "Pink Floyd",
              year: 1979,
              artwork_track_id: "art2",
            },
          ],
          count: 2,
        }),
      )
      // Second call: songs fails (network error, timeout, or parse error)
      .mockResolvedValueOnce(err(networkError));
    const { getLibraryAlbums } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryAlbums(0, 250);

    // Must still return ok — the songs failure is graceful degradation
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(2);
      expect(result.value.count).toBe(2);
      // Genre should be absent (undefined), not throw
      expect(result.value.albums[0]?.genre).toBeUndefined();
      expect(result.value.albums[1]?.genre).toBeUndefined();
    }
  });

  it("propagates error when albums query itself fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getLibraryAlbums } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryAlbums(0, 250);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
    // Songs query should not be attempted when albums fails
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it("only assigns first genre per album when multiple songs share the same album_id", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          albums_loop: [
            {
              id: 5,
              album: "Mixed",
              artist: "Various",
              year: 2020,
              artwork_track_id: "art5",
            },
          ],
          count: 1,
        }),
      )
      .mockResolvedValueOnce(
        ok({
          titles_loop: [
            { album_id: "5", genre: "Rock" },
            { album_id: "5", genre: "Pop" }, // Second genre for same album → ignored
          ],
        }),
      );
    const { getLibraryAlbums } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryAlbums(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums[0]?.genre).toBe("Rock"); // First genre wins
    }
  });
});

// ─── getAlbumTracks — sort order ─────────────────────────────────────────────

describe("getAlbumTracks", () => {
  it("sorts tracks by URL first (global file order for multi-disc albums)", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        titles_loop: [
          // Disc 2, Track 1 (URL sorts after Disc 1 tracks)
          {
            id: 4,
            title: "Disc2 Track1",
            tracknum: "1",
            url: "file:///disc2/01.flac",
          },
          // Disc 1, Track 2
          {
            id: 2,
            title: "Disc1 Track2",
            tracknum: "2",
            url: "file:///disc1/02.flac",
          },
          // Disc 1, Track 1 (URL sorts first)
          {
            id: 1,
            title: "Disc1 Track1",
            tracknum: "1",
            url: "file:///disc1/01.flac",
          },
          // Disc 2, Track 2
          {
            id: 5,
            title: "Disc2 Track2",
            tracknum: "2",
            url: "file:///disc2/02.flac",
          },
        ],
      }),
    );
    const { getAlbumTracks } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getAlbumTracks("42");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((t) => t.title)).toEqual([
        "Disc1 Track1",
        "Disc1 Track2",
        "Disc2 Track1",
        "Disc2 Track2",
      ]);
    }
  });

  it("falls back to tracknum sort when URLs are identical", async () => {
    // Some LMS responses don't include URL — all empty/undefined → tracknum decides
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        titles_loop: [
          { id: 3, title: "Track 3", tracknum: "3" },
          { id: 1, title: "Track 1", tracknum: "1" },
          { id: 2, title: "Track 2", tracknum: "2" },
        ],
      }),
    );
    const { getAlbumTracks } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getAlbumTracks("42");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((t) => t.title)).toEqual([
        "Track 1",
        "Track 2",
        "Track 3",
      ]);
    }
  });

  it("returns empty array when album has no tracks", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ titles_loop: [] }));
    const { getAlbumTracks } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getAlbumTracks("42");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("returns EmptyQueryError when albumId is empty", async () => {
    const executeCommand = vi.fn();
    const { getAlbumTracks } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getAlbumTracks("");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("EmptyQueryError");
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getAlbumTracks } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getAlbumTracks("42");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

// ─── getRescanProgress — JsonParseError ──────────────────────────────────────

// Helper: create a minimal Response-compatible object without unsafe casting
const makeFakeResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const makeFailingJsonResponse = (): Response =>
  ({
    ...makeFakeResponse({}),
    json: (): Promise<unknown> =>
      Promise.reject(new SyntaxError("Unexpected token < in JSON")),
  }) as Response;

describe("getRescanProgress", () => {
  it("returns JsonParseError when response body is not valid JSON", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeFailingJsonResponse());

    const executeCommand = vi.fn();
    const { getRescanProgress } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getRescanProgress();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("JsonParseError");
      expect(result.error.message).toContain("Unexpected token");
    }

    fetchSpy.mockRestore();
  });

  it("returns NetworkError when fetch itself fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNREFUSED"));

    const executeCommand = vi.fn();
    const { getRescanProgress } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getRescanProgress();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
      expect(result.error.message).toContain("ECONNREFUSED");
    }

    fetchSpy.mockRestore();
  });

  it("returns scanning=true when rescan field is 1", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFakeResponse({
        result: { rescan: 1, steps: "Rescanning...", totaltime: 0 },
      }),
    );

    const executeCommand = vi.fn();
    const { getRescanProgress } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getRescanProgress();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scanning).toBe(true);
      expect(result.value.step).toBe("Rescanning...");
    }

    fetchSpy.mockRestore();
  });

  it("returns scanning=false when rescan field is 0", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        makeFakeResponse({ result: { rescan: 0, steps: "", totaltime: 12 } }),
      );

    const executeCommand = vi.fn();
    const { getRescanProgress } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getRescanProgress();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scanning).toBe(false);
    }

    fetchSpy.mockRestore();
  });
});
