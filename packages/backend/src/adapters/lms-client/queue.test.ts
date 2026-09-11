/**
 * LMS Queue Adapter Unit Tests
 *
 * Tests the queue domain methods directly — specifically the logic
 * that is invisible when routes mock the entire LmsClient.
 *
 * Focus: addTidalAlbumToQueue command shape, addToQueue validation,
 * and getQueue index parsing. All network I/O is replaced by a mocked
 * executeCommand.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createQueueMethods, SAVED_PLAYLISTS_PAGE_LIMIT } from "./queue.js";
import type { ExecuteDeps } from "./execute.js";
import type { LmsError } from "./types.js";

const makeExecuteDeps = (
  executeCommand: ExecuteDeps["executeCommand"],
): ExecuteDeps => ({
  executeCommand,
  executeCommandWithRetry: executeCommand, // not used in these tests
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

describe("addTidalAlbumToQueue", () => {
  it("sends the exact playlist add command with item_id", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith([
      "tidal",
      "playlist",
      "add",
      "item_id:4.0",
    ]);
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("addToQueue", () => {
  it("returns EmptyQueryError for empty string", async () => {
    const executeCommand = vi.fn();
    const { addToQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await addToQueue("");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("EmptyQueryError");
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns EmptyQueryError for whitespace-only URL", async () => {
    const executeCommand = vi.fn();
    const { addToQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await addToQueue("   ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("EmptyQueryError");
    }
  });

  it("returns ValidationError when URL has unsupported protocol", async () => {
    const executeCommand = vi.fn();
    const { addToQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await addToQueue("ftp://music.example.com/track.flac");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ValidationError");
      expect(result.error.message).toContain("Invalid track URL protocol");
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns ValidationError when URL exceeds maximum length", async () => {
    const executeCommand = vi.fn();
    const { addToQueue } = createQueueMethods(makeExecuteDeps(executeCommand));
    const longUrl = "tidal://" + "a".repeat(5000);

    const result = await addToQueue(longUrl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ValidationError");
      expect(result.error.message).toContain("maximum length");
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("accepts all valid protocols", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { addToQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const validUrls = [
      "file:///music/track.flac",
      "http://example.com/track.mp3",
      "https://example.com/track.mp3",
      "qobuz://track-id",
      "tidal://12345.flc",
      "spotify://track-id",
    ];

    await validUrls.reduce(async (prev, url) => {
      await prev;
      executeCommand.mockClear();
      const result = await addToQueue(url);
      expect(result.ok, `Expected ok for URL: ${url}`).toBe(true);
      expect(executeCommand).toHaveBeenCalledWith(["playlist", "add", url]);
    }, Promise.resolve());
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { addToQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await addToQueue("tidal://1234.flc");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("savePlaylist", () => {
  it("sends the playlist save command with the given name", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { savePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await savePlaylist("My Mix");

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith(["playlist", "save", "My Mix"]);
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { savePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await savePlaylist("My Mix");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("listSavedPlaylists", () => {
  it("sends the playlists list command", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValue(ok({ playlists_loop: [] }));
    const { listSavedPlaylists } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    await listSavedPlaylists();

    expect(executeCommand).toHaveBeenCalledWith(
      ["playlists", "0", SAVED_PLAYLISTS_PAGE_LIMIT],
      expect.any(Function),
    );
  });

  it("maps playlists_loop and coerces numeric ids to strings", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        playlists_loop: [
          { id: 12, playlist: "Morning" },
          { id: "34", playlist: "Evening" },
        ],
      }),
    );
    const { listSavedPlaylists } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await listSavedPlaylists();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { id: "12", name: "Morning" },
        { id: "34", name: "Evening" },
      ]);
    }
  });

  it("returns an empty array when playlists_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({}));
    const { listSavedPlaylists } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await listSavedPlaylists();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { listSavedPlaylists } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await listSavedPlaylists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("loadSavedPlaylist", () => {
  it("sends the playlistcontrol load command with the playlist_id", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { loadSavedPlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await loadSavedPlaylist("42");

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith([
      "playlistcontrol",
      "cmd:load",
      "playlist_id:42",
    ]);
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { loadSavedPlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await loadSavedPlaylist("42");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("deleteSavedPlaylist", () => {
  it("sends the playlists delete command with the playlist_id", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { deleteSavedPlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await deleteSavedPlaylist("42");

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "delete",
      "playlist_id:42",
    ]);
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { deleteSavedPlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await deleteSavedPlaylist("42");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("getQueue", () => {
  it("marks the track at playlist_cur_index as isCurrent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        playlist_cur_index: 1,
        playlist_loop: [
          { id: 1, title: "Track 1", url: "file:///1.flac" },
          { id: 2, title: "Track 2", url: "file:///2.flac" },
          { id: 3, title: "Track 3", url: "file:///3.flac" },
        ],
      }),
    );
    const { getQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await getQueue();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.isCurrent).toBe(false);
      expect(result.value[1]?.isCurrent).toBe(true);
      expect(result.value[2]?.isCurrent).toBe(false);
    }
  });

  it("keeps the LMS queue URL on each track for repeat protection", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        playlist_cur_index: 0,
        playlist_loop: [{ id: 1, title: "Creep", url: "tidal://58990486.flc" }],
      }),
    );
    const { getQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await getQueue();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.url).toBe("tidal://58990486.flc");
    }
  });

  it("sets isCurrent=false for all tracks when playlist_cur_index is undefined", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        playlist_loop: [
          { id: 1, title: "Track 1" },
          { id: 2, title: "Track 2" },
        ],
      }),
    );
    const { getQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await getQueue();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.every((t) => t.isCurrent === false)).toBe(true);
    }
  });

  it("handles playlist_cur_index as string (LMS returns strings for some players)", async () => {
    const executeCommand = vi.fn().mockResolvedValue(
      ok({
        playlist_cur_index: "2",
        playlist_loop: [
          { id: 1, title: "Track 1" },
          { id: 2, title: "Track 2" },
          { id: 3, title: "Track 3" },
        ],
      }),
    );
    const { getQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await getQueue();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[2]?.isCurrent).toBe(true);
    }
  });

  it("returns empty array when playlist_loop is absent", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok({}));
    const { getQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await getQueue();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getQueue } = createQueueMethods(makeExecuteDeps(executeCommand));

    const result = await getQueue();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
