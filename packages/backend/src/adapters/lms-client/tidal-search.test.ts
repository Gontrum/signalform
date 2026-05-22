/**
 * LMS Tidal Search Adapter Unit Tests
 *
 * Tests for:
 * - findTidalSearchAlbumId: always returns ok(null) (Albums section disabled to prevent LMS OOM)
 * - searchTidalAlbumTracks: queries Tidal Tracks section, enriches with tidal_info, returns results
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createTidalSearchMethods } from "./tidal-search.js";
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

// ─── findTidalSearchAlbumId ───────────────────────────────────────────────────
// Albums section (.3) is permanently disabled to prevent LMS OOM crashes.
// All calls return ok(null) regardless of input.

describe("findTidalSearchAlbumId", () => {
  it("always returns ok(null) for any non-empty title (Albums section disabled)", async () => {
    const executeCommand = vi.fn();
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId(
      "Short n' Sweet",
      "Sabrina Carpenter",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
    // Albums section call must never happen (would OOM LMS)
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns ok(null) for classical works (Albums section disabled)", async () => {
    const executeCommand = vi.fn();
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId(
      "Mahler: Symphony No. 5",
      "Berliner Philharmoniker",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns ok(null) for empty title without calling executeCommand", async () => {
    const executeCommand = vi.fn();
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId("", "Some Artist");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

// ─── searchTidalAlbumTracks ───────────────────────────────────────────────────

describe("searchTidalAlbumTracks", () => {
  it("returns empty array for empty albumTitle without calling executeCommand", async () => {
    const executeCommand = vi.fn();
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbumTracks("", "Radiohead");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("builds query from artist + work title and calls Tracks section (.4)", async () => {
    // First call: tidal items (track search), subsequent calls: tidal_info (enrichment)
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(ok({ loop_loop: [] })) // empty track search
      .mockResolvedValue(ok({ loop_loop: [] })); // enrichment fallback
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    await searchTidalAlbumTracks("OK Computer", "Radiohead");

    expect(executeCommand).toHaveBeenCalledWith(
      expect.arrayContaining([
        "tidal",
        "items",
        0,
        50,
        "item_id:7_Radiohead OK Computer.4",
        "want_url:1",
      ]),
      expect.anything(),
    );
  });

  it("strips 'Composer: ' prefix for classical works in query", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ loop_loop: [] }));
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    await searchTidalAlbumTracks(
      "Mahler: Symphony No. 5",
      "Berliner Philharmoniker",
    );

    expect(executeCommand).toHaveBeenCalledWith(
      expect.arrayContaining([
        "item_id:7_Berliner Philharmoniker Symphony No. 5.4",
      ]),
      expect.anything(),
    );
  });

  it("uses only work title when artist is empty", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ loop_loop: [] }));
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    await searchTidalAlbumTracks("OK Computer", "");

    expect(executeCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["item_id:7_OK Computer.4"]),
      expect.anything(),
    );
  });

  it("filters out non-audio items (isaudio !== 1)", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          loop_loop: [
            { id: "node1", name: "Section Header", isaudio: 0 },
            {
              id: "tidal://111.flc",
              name: "Airbag",
              url: "tidal://111.flc",
              isaudio: 1,
            },
            { id: "node2", name: "No URL Item", isaudio: 1 }, // no url
          ],
        }),
      )
      .mockResolvedValue(ok({ loop_loop: [] })); // enrichment
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbumTracks("OK Computer", "Radiohead");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Airbag");
      expect(result.value[0]?.url).toBe("tidal://111.flc");
    }
  });

  it("enriches tracks with albumName via tidal_info", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          loop_loop: [
            {
              id: "tidal://111.flc",
              name: "Airbag",
              url: "tidal://111.flc",
              isaudio: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({
          loop_loop: [
            { id: "2", name: "Album: OK Computer" },
            { id: "3", name: "Interpret: Radiohead" },
          ],
        }),
      );
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbumTracks("OK Computer", "Radiohead");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.albumName).toBe("OK Computer");
    }
  });

  it("keeps track with undefined albumName when enrichment returns empty loop_loop", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          loop_loop: [
            {
              id: "tidal://111.flc",
              name: "Airbag",
              url: "tidal://111.flc",
              isaudio: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(ok({ loop_loop: [] })); // no album info
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbumTracks("OK Computer", "Radiohead");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.albumName).toBeUndefined();
    }
  });

  it("propagates LMS network error from track search command", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { searchTidalAlbumTracks } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await searchTidalAlbumTracks("OK Computer", "Radiohead");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
