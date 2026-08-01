/**
 * LMS Queue Adapter — renamePlaylist Unit Tests
 *
 * Sibling of queue.test.ts (kept separate for file size). All network I/O is
 * replaced by a mocked executeCommand.
 */

import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { createQueueMethods } from "./queue.js";
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

describe("renamePlaylist", () => {
  it("sends the playlists rename command with both prefixed parameters", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { renamePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await renamePlaylist("42", "Evening");

    expect(result.ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "rename",
      "playlist_id:42",
      "newname:Evening",
    ]);
  });

  it("passes a name containing spaces through unchanged", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { renamePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    await renamePlaylist("42", "Late Night Drive");

    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "rename",
      "playlist_id:42",
      "newname:Late Night Drive",
    ]);
  });

  // Colons separate parameter name from value in LMS commands, so a name that
  // contains one is the interesting case: like the other adapter methods, the
  // value is handed over verbatim and never escaped.
  it("passes a name containing colons and umlauts through unchanged", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { renamePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    await renamePlaylist("42", "Grüße: Frühstück");

    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "rename",
      "playlist_id:42",
      "newname:Grüße: Frühstück",
    ]);
  });

  it("passes an id containing a colon through unchanged", async () => {
    const executeCommand = vi.fn().mockResolvedValue(ok(undefined));
    const { renamePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    await renamePlaylist("a:b", "Mix");

    expect(executeCommand).toHaveBeenCalledWith([
      "playlists",
      "rename",
      "playlist_id:a:b",
      "newname:Mix",
    ]);
  });

  it("propagates NetworkError from executeCommand", async () => {
    const executeCommand = vi.fn().mockResolvedValue(err(networkError));
    const { renamePlaylist } = createQueueMethods(
      makeExecuteDeps(executeCommand),
    );

    const result = await renamePlaylist("42", "Evening");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
