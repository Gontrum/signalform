/**
 * LMS Queue Adapter Unit Tests
 *
 * Tests the queue domain methods directly — specifically the logic
 * that is invisible when routes mock the entire LmsClient.
 *
 * Focus: addTidalAlbumToQueue orchestration logic, addToQueue validation,
 * and getQueue index parsing. All network I/O is replaced by a mocked
 * executeCommand.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createQueueMethods } from "./queue.js";
import type { ExecuteDeps } from "./execute.js";
import type { LmsError } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// A minimal tidal tracks payload — matches tidalTracksPayloadParser schema
const makeTidalTracksPayload = (
  tracks: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly url?: string; // undefined = omit field entirely (simulates missing URL)
    readonly isaudio?: number;
  }>,
): {
  readonly loop_loop: readonly Record<string, unknown>[];
  readonly count: number;
} => ({
  loop_loop: tracks.map((t) => {
    const base = {
      id: t.id,
      title: t.title,
      isaudio: t.isaudio ?? 1,
      type: "audio",
      hasitems: 0,
    };
    // Only include url if explicitly provided — undefined means field is absent
    return t.url !== undefined ? { ...base, url: t.url } : base;
  }),
  count: tracks.length,
});

// ─── addTidalAlbumToQueue ─────────────────────────────────────────────────────

describe("addTidalAlbumToQueue", () => {
  it("returns EmptyQueryError when albumId is empty string", async () => {
    const executeCommand = vi.fn();
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("EmptyQueryError");
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns EmptyQueryError when albumId is whitespace-only", async () => {
    const executeCommand = vi.fn();
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("   ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("EmptyQueryError");
    }
  });

  it("propagates NetworkError from getTidalAlbumTracks fetch", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
    // Only the tracks-fetch was called, no playlist add
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it("returns LmsApiError when album has no playable audio tracks", async () => {
    const executeCommand = vi.fn().mockResolvedValueOnce(
      ok(
        makeTidalTracksPayload([
          { id: "4.0.0", title: "Non-audio item", url: "", isaudio: 0 },
          { id: "4.0.1", title: "No URL item", url: undefined, isaudio: 1 },
        ]),
      ),
    );
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("LmsApiError");
      expect(result.error.message).toContain("No playable tracks");
    }
    // Only the tracks-fetch was called, no playlist add
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it("calls playlist add for each audio track in order", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok(
          makeTidalTracksPayload([
            { id: "4.0.0", title: "Track 1", url: "tidal://1001.flc" },
            { id: "4.0.1", title: "Track 2", url: "tidal://1002.flc" },
            { id: "4.0.2", title: "Track 3", url: "tidal://1003.flc" },
          ]),
        ),
      )
      .mockResolvedValue(ok(undefined)); // playlist add calls
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(true);
    // 1 tracks-fetch + 3 playlist adds = 4 total calls
    expect(executeCommand).toHaveBeenCalledTimes(4);
    expect(executeCommand).toHaveBeenNthCalledWith(2, [
      "playlist",
      "add",
      "tidal://1001.flc",
    ]);
    expect(executeCommand).toHaveBeenNthCalledWith(3, [
      "playlist",
      "add",
      "tidal://1002.flc",
    ]);
    expect(executeCommand).toHaveBeenNthCalledWith(4, [
      "playlist",
      "add",
      "tidal://1003.flc",
    ]);
  });

  it("stops after first failed playlist add and returns the error", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok(
          makeTidalTracksPayload([
            { id: "4.0.0", title: "Track 1", url: "tidal://1001.flc" },
            { id: "4.0.1", title: "Track 2", url: "tidal://1002.flc" },
            { id: "4.0.2", title: "Track 3", url: "tidal://1003.flc" },
          ]),
        ),
      )
      .mockResolvedValueOnce(ok(undefined)) // Track 1 succeeds
      .mockResolvedValueOnce(err(networkError)) // Track 2 fails
      .mockResolvedValue(ok(undefined)); // Track 3 would succeed but should not be called
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
    // tracks-fetch + track1-add + track2-add (fail) — track3 must NOT be called
    expect(executeCommand).toHaveBeenCalledTimes(3);
  });

  it("skips non-audio items and items with empty URLs, adds only valid tracks", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok(
          makeTidalTracksPayload([
            {
              id: "4.0.0",
              title: "Audio",
              url: "tidal://1001.flc",
              isaudio: 1,
            },
            {
              id: "4.0.1",
              title: "Non-audio",
              url: "tidal://1002.flc",
              isaudio: 0,
            },
            { id: "4.0.2", title: "No URL", url: "", isaudio: 1 },
            {
              id: "4.0.3",
              title: "Also Audio",
              url: "tidal://1003.flc",
              isaudio: 1,
            },
          ]),
        ),
      )
      .mockResolvedValue(ok(undefined));
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await addTidalAlbumToQueue("4.0");

    expect(result.ok).toBe(true);
    // 1 fetch + 2 adds (only the 2 valid audio tracks)
    expect(executeCommand).toHaveBeenCalledTimes(3);
    const calls = executeCommand.mock.calls;
    expect(calls[1]?.[0]).toEqual(["playlist", "add", "tidal://1001.flc"]);
    expect(calls[2]?.[0]).toEqual(["playlist", "add", "tidal://1003.flc"]);
  });

  it("trims albumId before using it in the fetch command", async () => {
    const executeCommand = vi
      .fn()
      .mockResolvedValueOnce(
        ok(
          makeTidalTracksPayload([
            { id: "4.0.0", title: "Track", url: "tidal://1001.flc" },
          ]),
        ),
      )
      .mockResolvedValue(ok(undefined));
    const { addTidalAlbumToQueue } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    await addTidalAlbumToQueue("  4.0  ");

    // The first call should use the trimmed ID
    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      ["tidal", "items", 0, 999, "item_id:4.0", "want_url:1"],
      expect.anything(),
    );
  });
});

// ─── addToQueue validation ────────────────────────────────────────────────────

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

// ─── getQueue index parsing ───────────────────────────────────────────────────

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
