/**
 * LMS Queue Adapter — getSavedPlaylistTracks / removeSavedPlaylistTrack
 *
 * Sibling of queue.test.ts (kept separate for file size). The fake
 * executeCommand runs the parser it is handed, exactly like the real one, so
 * these cases exercise the zod schema and not just the mapping.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err, type Result } from "@signalform/shared";
import { createQueueMethods } from "./queue.js";
import type { ExecuteDeps, LmsResultParser } from "./execute.js";
import type { LmsCommand, LmsError } from "./types.js";

const config: ExecuteDeps["config"] = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type Probe = {
  readonly methods: ReturnType<typeof createQueueMethods>;
  readonly sentCommand: () => LmsCommand;
};

const givenLmsReturns = (payload: unknown): Probe => {
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
    config,
  };

  return {
    methods: createQueueMethods(deps),
    sentCommand: () => sentCommand,
  };
};

const makeExecuteDeps = (
  executeCommand: ExecuteDeps["executeCommand"],
): ExecuteDeps => ({
  executeCommand,
  executeCommandWithRetry: executeCommand,
  config,
});

const networkError: LmsError = {
  type: "NetworkError",
  message: "ECONNREFUSED",
};

describe("getSavedPlaylistTracks", () => {
  it("sends the playlists tracks command with paging, id prefix and tags", async () => {
    const probe = givenLmsReturns({ playlisttracks_loop: [], count: 0 });

    const result = await probe.methods.getSavedPlaylistTracks("42", 20, 50);

    expect(result.ok).toBe(true);
    expect(probe.sentCommand()).toEqual([
      "playlists",
      "tracks",
      20,
      50,
      "playlist_id:42",
      "tags:a,l,d,A",
    ]);
  });

  // Asserted on the tag string itself: sampler tracks have no track artist, so
  // dropping A while reordering the tags would silently blank their artist again.
  it("requests the albumartist tag A", async () => {
    const probe = givenLmsReturns({ playlisttracks_loop: [], count: 0 });

    await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    const tags = probe
      .sentCommand()
      .find(
        (part): part is string =>
          typeof part === "string" && part.startsWith("tags:"),
      );

    expect(tags).toBeDefined();
    expect(tags?.slice("tags:".length).split(",")).toContain("A");
  });

  it("passes an id containing a colon through unchanged", async () => {
    const probe = givenLmsReturns({ playlisttracks_loop: [], count: 0 });

    await probe.methods.getSavedPlaylistTracks("a:b", 0, 10);

    expect(probe.sentCommand()).toEqual([
      "playlists",
      "tracks",
      0,
      10,
      "playlist_id:a:b",
      "tags:a,l,d,A",
    ]);
  });

  it("maps title, artist, album and duration of every entry", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [
        {
          title: "Teardrop",
          artist: "Massive Attack",
          album: "Mezzanine",
          duration: 330,
        },
        {
          title: "Angel",
          artist: "Massive Attack",
          album: "Mezzanine",
          duration: 379,
        },
      ],
      count: 2,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toEqual([
        {
          index: 0,
          title: "Teardrop",
          artist: "Massive Attack",
          album: "Mezzanine",
          duration: 330,
        },
        {
          index: 1,
          title: "Angel",
          artist: "Massive Attack",
          album: "Mezzanine",
          duration: 379,
        },
      ]);
      expect(result.value.count).toBe(2);
    }
  });

  it("reports the playlist's total count, not the page length", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Only one on this page" }],
      count: 137,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(137);
    }
  });

  it("numbers tracks by their position in the playlist, not in the page", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [
        { title: "eleventh" },
        { title: "twelfth" },
        { title: "thirteenth" },
      ],
      count: 40,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 10, 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks.map((track) => track.index)).toEqual([
        10, 11, 12,
      ]);
    }
  });

  it("reads a numeric duration as seconds", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Teardrop", duration: 330 }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBe(330);
    }
  });

  it("reads a string duration as the same number", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Teardrop", duration: "330" }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBe(330);
    }
  });

  it("keeps the fractional part of a string duration", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Teardrop", duration: "330.5" }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBe(330.5);
    }
  });

  // NaN is falsy, so a `!duration` check downstream would hide it — the value
  // has to be undefined, which is asserted explicitly here.
  it("yields undefined, not NaN, for a missing duration", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Teardrop" }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBeUndefined();
      expect(result.value.tracks[0]?.duration).not.toBeNaN();
    }
  });

  it("yields undefined, not NaN, for an unparsable duration", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Teardrop", duration: "unknown" }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBeUndefined();
      expect(result.value.tracks[0]?.duration).not.toBeNaN();
    }
  });

  it("yields undefined, not NaN, for an empty-string duration", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Teardrop", duration: "" }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBeUndefined();
    }
  });

  it("falls back to empty strings for a missing artist and album", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "Untagged" }],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]).toEqual({
        index: 0,
        title: "Untagged",
        artist: "",
        album: "",
        duration: undefined,
      });
    }
  });

  it("prefers the track artist over the album artist", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [
        {
          title: "Teardrop",
          artist: "Massive Attack",
          albumartist: "Various Artists",
          album: "Mezzanine",
        },
      ],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.artist).toBe("Massive Attack");
    }
  });

  // The reported bug: sampler tracks come back with an album artist only, so
  // without the fallback this row shows no artist while the queue shows one.
  it("uses the album artist when the track has no artist", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [
        {
          title: "Mein Boy bist Du",
          albumartist: "Various Artists",
          album: "Arne Hits",
        },
      ],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.artist).toBe("Various Artists");
    }
  });

  // LMS sends an empty artist for some tracks and omits the field for others —
  // both mean "no track artist", so blank falls through to the album artist.
  it("treats a blank track artist as missing and uses the album artist", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [
        { title: "empty string", artist: "", albumartist: "Various Artists" },
        { title: "whitespace", artist: "   ", albumartist: "Various Artists" },
      ],
      count: 2,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks.map((track) => track.artist)).toEqual([
        "Various Artists",
        "Various Artists",
      ]);
    }
  });

  it("leaves the artist empty when both tags are blank — no invented placeholder", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [
        { title: "Untagged", artist: "", albumartist: " " },
      ],
      count: 1,
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.artist).toBe("");
    }
  });

  it("returns an empty page for an empty playlisttracks_loop", async () => {
    const probe = givenLmsReturns({ playlisttracks_loop: [], count: 0 });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("returns an empty page when playlisttracks_loop is absent", async () => {
    const probe = givenLmsReturns({ count: 0 });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toEqual([]);
      expect(result.value.count).toBe(0);
    }
  });

  it("falls back to the page length when LMS omits the count", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "one" }, { title: "two" }],
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(2);
    }
  });

  it("reads a string count as a number", async () => {
    const probe = givenLmsReturns({
      playlisttracks_loop: [{ title: "one" }],
      count: "137",
    });

    const result = await probe.methods.getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(137);
    }
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { getSavedPlaylistTracks } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await getSavedPlaylistTracks("42", 0, 50);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("removeSavedPlaylistTrack", () => {
  it("sends the playlists edit command with all prefixed parameters", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { removeSavedPlaylistTrack } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await removeSavedPlaylistTrack("42", 3);

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "edit",
      "cmd:delete",
      "playlist_id:42",
      "index:3",
    ]);
  });

  // The first track is an ordinary case; a truthy check on the index would
  // drop it or send a malformed command.
  it("sends index:0 for the first track", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { removeSavedPlaylistTrack } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await removeSavedPlaylistTrack("42", 0);

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "edit",
      "cmd:delete",
      "playlist_id:42",
      "index:0",
    ]);
  });

  it("passes an id containing a colon through unchanged", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { removeSavedPlaylistTrack } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    await removeSavedPlaylistTrack("a:b", 7);

    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "edit",
      "cmd:delete",
      "playlist_id:a:b",
      "index:7",
    ]);
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { removeSavedPlaylistTrack } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await removeSavedPlaylistTrack("42", 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
