/**
 * LMS Playlist Folder Pref Adapter Tests
 *
 * getPlaylistDir exists to tell "LMS is down" apart from "LMS cannot write
 * playlists at all", so the command it sends is as much of the contract as the
 * value it reports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLmsClient } from "./client.js";
import type { LmsConfig } from "./types.js";

const fetchMock = vi.fn();

const config: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
  retryBaseDelayMs: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const sentCommandAt = (callIndex: number): readonly unknown[] => {
  const requestInit = fetchMock.mock.calls[callIndex]?.[1];
  const body = isRecord(requestInit) ? requestInit["body"] : undefined;
  const parsed: unknown = JSON.parse(typeof body === "string" ? body : "{}");
  const params =
    isRecord(parsed) && Array.isArray(parsed["params"]) ? parsed["params"] : [];
  const command = params[1];
  return Array.isArray(command) ? command : [];
};

const givenResult = (result: unknown): void => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ result, id: 1, error: null }),
  });
};

describe("getPlaylistDir", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the server for the playlistdir pref", async () => {
    givenResult({ _p2: "/music/playlists" });
    const client = createLmsClient(config);

    await client.getPlaylistDir();

    expect(sentCommandAt(0)).toEqual(["pref", "playlistdir", "?"]);
  });

  it("reports the configured folder", async () => {
    givenResult({ _p2: "/music/playlists" });
    const client = createLmsClient(config);

    const result = await client.getPlaylistDir();

    expect(result).toEqual({ ok: true, value: "/music/playlists" });
  });

  it("reports an empty string when no folder is configured", async () => {
    givenResult({ _p2: "" });
    const client = createLmsClient(config);

    const result = await client.getPlaylistDir();

    expect(result).toEqual({ ok: true, value: "" });
  });

  it("reports an empty string when the field is missing entirely", async () => {
    givenResult({});
    const client = createLmsClient(config);

    const result = await client.getPlaylistDir();

    expect(result).toEqual({ ok: true, value: "" });
  });

  it("reports an empty string for a whitespace-only folder", async () => {
    givenResult({ _p2: "   " });
    const client = createLmsClient(config);

    const result = await client.getPlaylistDir();

    expect(result).toEqual({ ok: true, value: "" });
  });

  it("propagates a network failure instead of guessing a folder", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createLmsClient(config);

    const result = await client.getPlaylistDir();

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.type).toBe("NetworkError");
  });

  it("does not retry — the caller asks once, after a write already failed", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createLmsClient(config);

    await client.getPlaylistDir();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
