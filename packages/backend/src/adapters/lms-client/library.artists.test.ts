/**
 * LMS Library Adapter — getLibraryArtists
 *
 * Sibling of library.test.ts: command construction, the empty-payload paths,
 * and the decision that a row without an `artist` tag is skipped, never
 * delivered as a nameless entry.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createLibraryMethods } from "./library.js";
import type { ExecuteDeps } from "./execute.js";
import type { LmsError } from "./types.js";

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

const emptyArtistsPayload = ok({ artists_loop: [], count: 0 });

describe("getLibraryArtists command", () => {
  it("sends the plain artists command when no search is given", async () => {
    const executeCommand = vi.fn().mockResolvedValue(emptyArtistsPayload);
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    await getLibraryArtists(40, 20);

    expect(executeCommand.mock.calls[0]?.[0]).toEqual(["artists", 40, 20]);
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it("appends the search term", async () => {
    const executeCommand = vi.fn().mockResolvedValue(emptyArtistsPayload);
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    await getLibraryArtists(0, 250, { search: "floyd" });

    expect(executeCommand.mock.calls[0]?.[0]).toEqual([
      "artists",
      0,
      250,
      "search:floyd",
    ]);
  });

  it("trims the search term before sending it", async () => {
    const executeCommand = vi.fn().mockResolvedValue(emptyArtistsPayload);
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    await getLibraryArtists(0, 250, { search: "  floyd  " });

    expect(executeCommand.mock.calls[0]?.[0]).toEqual([
      "artists",
      0,
      250,
      "search:floyd",
    ]);
  });

  it("omits the search param for a blank search term", async () => {
    const executeCommand = vi.fn().mockResolvedValue(emptyArtistsPayload);
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    await getLibraryArtists(0, 250, { search: "   " });

    expect(executeCommand.mock.calls[0]?.[0]).toEqual(["artists", 0, 250]);
  });
});

describe("getLibraryArtists response", () => {
  it("returns the artists with the unpaginated count", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        artists_loop: [
          { id: 12, artist: "Pink Floyd" },
          { id: 7, artist: "Queen" },
        ],
        count: 431,
      }),
    );
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artists).toEqual([
        { id: 12, artist: "Pink Floyd" },
        { id: 7, artist: "Queen" },
      ]);
      expect(result.value.count).toBe(431);
    }
  });

  it("returns an empty list for an empty artists_loop", async () => {
    const executeCommand = vi.fn().mockResolvedValue(emptyArtistsPayload);
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artists).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("returns an empty list when LMS omits artists_loop", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artists).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("defaults a missing count to zero", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ artists_loop: [{ id: 1, artist: "Queen" }] }));
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(0);
    }
  });

  // Decision: one untagged row is skipped, the rest of the page still ships —
  // an entry with an empty name would be unopenable in the UI.
  it("skips a row without an artist field instead of naming it empty", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        artists_loop: [
          { id: 12, artist: "Pink Floyd" },
          { id: 99 },
          { id: 7, artist: "Queen" },
        ],
        count: 3,
      }),
    );
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artists.map((artist) => artist.artist)).toEqual([
        "Pink Floyd",
        "Queen",
      ]);
    }
  });

  it("skips a row whose artist name is only whitespace", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        artists_loop: [
          { id: 99, artist: "   " },
          { id: 7, artist: "Queen" },
        ],
        count: 2,
      }),
    );
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artists.map((artist) => artist.artist)).toEqual([
        "Queen",
      ]);
    }
  });

  it("propagates the error when the artists query fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getLibraryArtists } = createLibraryMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getLibraryArtists(0, 250);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
