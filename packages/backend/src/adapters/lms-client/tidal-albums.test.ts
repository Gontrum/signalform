/**
 * LMS Tidal Albums Adapter Unit Tests
 *
 * Covers all 5 methods in createTidalAlbumsMethods:
 *   getTidalAlbums, getTidalAlbumTracks, getTidalArtistAlbums,
 *   getTidalFeaturedAlbums, getTidalAlbumParentItems
 *
 * Per method: happy path, error propagation, empty result (missing loop_loop key).
 * getTidalAlbumParentItems has additional branch coverage for its ID-parsing guards.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createTidalAlbumsMethods } from "./tidal-albums.js";
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

// Raw album item matching tidalItemSchema (used by tidalAlbumsPayloadParser)
const rawAlbum = {
  id: "4.0",
  name: "Dark Side of the Moon - Pink Floyd",
  image: "/imageproxy/art/4.0",
  type: "playlist",
  hasitems: 1,
};

// Raw artist-album item matching tidalItemSchema (used by tidalArtistAlbumsPayloadParser)
const rawArtistAlbum = {
  id: "6.0.1.0",
  name: "Dark Side of the Moon",
  image: "/imageproxy/art/6.0.1.0",
  type: "playlist",
  hasitems: 1,
};

// Raw track item matching tidalTrackSchema (used by tidalTracksPayloadParser)
const rawTrack = {
  id: "4.0.0",
  name: "Speak to Me",
  url: "tidal://track/12345",
  duration: 68,
  type: "audio",
  isaudio: 1,
};

// ─── getTidalAlbums ───────────────────────────────────────────────────────────

describe("getTidalAlbums", () => {
  it("returns albums and count on happy path", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawAlbum], count: 1 }));
    const { getTidalAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbums(0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.albums[0]?.id).toBe("4.0");
      expect(result.value.count).toBe(1);
    }
  });

  it("propagates error when executeCommand fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getTidalAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbums(0, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(networkError);
    }
  });

  it("returns empty albums and zero count when loop_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { getTidalAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbums(0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("defaults count to 0 when count field is absent", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawAlbum] }));
    const { getTidalAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbums(0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(0);
    }
  });
});

// ─── getTidalAlbumTracks ──────────────────────────────────────────────────────

describe("getTidalAlbumTracks", () => {
  it("returns tracks and count on happy path", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawTrack], count: 1 }));
    const { getTidalAlbumTracks } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumTracks("4.0", 0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0]?.id).toBe("4.0.0");
      expect(result.value.count).toBe(1);
    }
  });

  it("propagates error when executeCommand fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getTidalAlbumTracks } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumTracks("4.0", 0, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(networkError);
    }
  });

  it("returns empty tracks and zero count when loop_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { getTidalAlbumTracks } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumTracks("4.0", 0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("defaults count to 0 when count field is absent", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawTrack] }));
    const { getTidalAlbumTracks } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumTracks("4.0", 0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(0);
    }
  });
});

// ─── getTidalArtistAlbums ─────────────────────────────────────────────────────

describe("getTidalArtistAlbums", () => {
  it("returns albums and count on happy path", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawArtistAlbum], count: 1 }));
    const { getTidalArtistAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalArtistAlbums("6.0", 0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.albums[0]?.id).toBe("6.0.1.0");
      expect(result.value.count).toBe(1);
    }
  });

  it("propagates error when executeCommand fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getTidalArtistAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalArtistAlbums("6.0", 0, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(networkError);
    }
  });

  it("returns empty albums and zero count when loop_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { getTidalArtistAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalArtistAlbums("6.0", 0, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("appends .1 to artistId to target the Alben submenu", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [], count: 0 }));
    const { getTidalArtistAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    await getTidalArtistAlbums("6.3", 0, 10);

    // The command must use item_id:6.3.1 — the .1 Alben submenu
    const calledCommand = executeCommand.mock.calls[0]?.[0];
    expect(calledCommand).toContain("item_id:6.3.1");
  });
});

// ─── getTidalFeaturedAlbums ───────────────────────────────────────────────────

describe("getTidalFeaturedAlbums", () => {
  it("returns albums and count on happy path", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawAlbum], count: 52 }));
    const { getTidalFeaturedAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalFeaturedAlbums(0, 100);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.count).toBe(52);
    }
  });

  it("propagates error when executeCommand fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getTidalFeaturedAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalFeaturedAlbums(0, 100);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(networkError);
    }
  });

  it("returns empty albums and zero count when loop_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { getTidalFeaturedAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalFeaturedAlbums(0, 100);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("uses item_id:1.0.1 for the Featured albums entry point", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [], count: 0 }));
    const { getTidalFeaturedAlbums } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    await getTidalFeaturedAlbums(0, 100);

    const calledCommand = executeCommand.mock.calls[0]?.[0];
    expect(calledCommand).toContain("item_id:1.0.1");
  });
});

// ─── getTidalAlbumParentItems ─────────────────────────────────────────────────

describe("getTidalAlbumParentItems", () => {
  it("returns items and count on happy path", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawArtistAlbum], count: 1 }));
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    // albumId "6.0.1.0" → parentId "6.0.1", albumIndex 0
    const result = await getTidalAlbumParentItems("6.0.1.0");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]?.id).toBe("6.0.1.0");
      expect(result.value.count).toBe(1);
    }
  });

  it("propagates error when executeCommand fails", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumParentItems("6.0.1.2");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(networkError);
    }
  });

  it("returns empty items and zero count when loop_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({ count: 0 }));
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumParentItems("6.0.1.0");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("returns empty items immediately when albumId has no dot (no parent)", async () => {
    const executeCommand = vi.fn();
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumParentItems("nodot");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      expect(result.value.count).toBe(0);
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns empty items immediately when the last segment is not a number", async () => {
    const executeCommand = vi.fn();
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    // Last segment "abc" → parseInt returns NaN
    const result = await getTidalAlbumParentItems("6.0.abc");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      expect(result.value.count).toBe(0);
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("uses offset=albumIndex and limit=1 in the command", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [], count: 0 }));
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    // albumId "6.0.1.3" → parentId "6.0.1", albumIndex 3
    await getTidalAlbumParentItems("6.0.1.3");

    const calledCommand = executeCommand.mock.calls[0]?.[0];
    // command: ["tidal", "items", albumIndex=3, limit=1, "item_id:6.0.1", "want_url:1"]
    expect(calledCommand).toEqual([
      "tidal",
      "items",
      3,
      1,
      "item_id:6.0.1",
      "want_url:1",
    ]);
  });

  it("defaults count to 0 when count field is absent", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ loop_loop: [rawArtistAlbum] }));
    const { getTidalAlbumParentItems } = createTidalAlbumsMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getTidalAlbumParentItems("6.0.1.0");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(0);
    }
  });
});
