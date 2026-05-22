/**
 * LMS Tidal Search Adapter Unit Tests
 *
 * Tests findTidalSearchAlbumId matching logic: primary startsWith match,
 * secondary classical "Composer: Work" match, null fallback, empty title,
 * and network error propagation.
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

describe("findTidalSearchAlbumId", () => {
  it("primary match: returns id when album name startsWith title (exact case-insensitive)", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [
          { id: "7_short n' sweet.3.0", name: "Short n' Sweet" },
          { id: "7_short n' sweet.3.1", name: "Short n' Sweet [E]" },
        ],
      }),
    );
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId(
      "Short n' Sweet",
      "Sabrina Carpenter",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("7_short n' sweet.3.0");
    }
  });

  it("primary match fails, secondary match finds album via work title (startsWith)", async () => {
    // Tidal returns "Symphony No. 5" — does not startsWith "mahler: symphony no. 5"
    // but does startsWith the work title "symphony no. 5"
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [
          { id: "7_mahler: symphony no. 5.3.0", name: "Symphony No. 5" },
          { id: "7_mahler: symphony no. 5.3.1", name: "Symphony No. 5 [E]" },
        ],
      }),
    );
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId(
      "Mahler: Symphony No. 5",
      "Berliner Philharmoniker",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("7_mahler: symphony no. 5.3.0");
    }
  });

  it("secondary match via includes when album name contains work title as substring", async () => {
    // "symphony no. 5 in c# minor" includes "symphony no. 5"
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [
          {
            id: "7_mahler: symphony no. 5.3.0",
            name: "Symphony No. 5 in C# Minor",
          },
        ],
      }),
    );
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId(
      "Mahler: Symphony No. 5",
      "Berliner Philharmoniker",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("7_mahler: symphony no. 5.3.0");
    }
  });

  it("returns null when no primary or secondary match found", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        loop_loop: [{ id: "7_other.3.0", name: "Completely Different Album" }],
      }),
    );
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
  });

  it("returns null for empty title without calling executeCommand", async () => {
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

  it("propagates LMS network error from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { findTidalSearchAlbumId } = createTidalSearchMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await findTidalSearchAlbumId(
      "Short n' Sweet",
      "Sabrina Carpenter",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
