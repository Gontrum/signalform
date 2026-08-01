/**
 * LMS Playback Modes Adapter Tests
 *
 * Covers both directions of the shuffle/repeat mapping through the real
 * client: the command each mode sends, and the mode each LMS status field
 * value produces. fetch is the only thing mocked, so the zod status schema
 * runs for real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RepeatMode, ShuffleMode } from "@signalform/shared";
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

const givenLmsAcceptsCommands = (): void => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ result: {}, id: 1, error: null }),
  });
};

const givenLmsIsUnreachable = (): void => {
  fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
};

const givenLmsStatusPayload = (
  extraFields: Readonly<Record<string, unknown>>,
): void => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      result: {
        mode: "play",
        time: 12,
        duration: 240,
        "mixer volume": 50,
        ...extraFields,
      },
      id: 1,
      error: null,
    }),
  });
};

describe("setShuffle", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Each mode is asserted on its own: a swapped 1 ↔ 2 wiring stays invisible
  // when only one representative mode is checked.
  it.each<readonly [ShuffleMode, string]>([
    ["off", "0"],
    ["songs", "1"],
    ["albums", "2"],
  ])("sends playlist shuffle %s as %s", async (mode, lmsValue) => {
    givenLmsAcceptsCommands();
    const client = createLmsClient(config);

    const result = await client.setShuffle(mode);

    expect(result.ok).toBe(true);
    expect(sentCommandAt(0)).toEqual(["playlist", "shuffle", lmsValue]);
  });

  it("returns a NetworkError when LMS is unreachable", async () => {
    givenLmsIsUnreachable();
    const client = createLmsClient(config);

    const result = await client.setShuffle("songs");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("setRepeat", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<readonly [RepeatMode, string]>([
    ["off", "0"],
    ["track", "1"],
    ["playlist", "2"],
  ])("sends playlist repeat %s as %s", async (mode, lmsValue) => {
    givenLmsAcceptsCommands();
    const client = createLmsClient(config);

    const result = await client.setRepeat(mode);

    expect(result.ok).toBe(true);
    expect(sentCommandAt(0)).toEqual(["playlist", "repeat", lmsValue]);
  });

  it("returns a NetworkError when LMS is unreachable", async () => {
    givenLmsIsUnreachable();
    const client = createLmsClient(config);

    const result = await client.setRepeat("playlist");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("getStatus - shuffle and repeat", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<readonly [number, ShuffleMode]>([
    [0, "off"],
    [1, "songs"],
    [2, "albums"],
  ])("reads numeric shuffle %i as %s", async (raw, expected) => {
    givenLmsStatusPayload({ "playlist shuffle": raw });
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.shuffle).toBe(expected);
    }
  });

  it.each<readonly [number, RepeatMode]>([
    [0, "off"],
    [1, "track"],
    [2, "playlist"],
  ])("reads numeric repeat %i as %s", async (raw, expected) => {
    givenLmsStatusPayload({ "playlist repeat": raw });
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repeat).toBe(expected);
    }
  });

  it.each<readonly [string, ShuffleMode]>([
    ["0", "off"],
    ["1", "songs"],
    ["2", "albums"],
  ])("reads string shuffle %s as %s", async (raw, expected) => {
    givenLmsStatusPayload({ "playlist shuffle": raw });
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.shuffle).toBe(expected);
    }
  });

  it.each<readonly [string, RepeatMode]>([
    ["0", "off"],
    ["1", "track"],
    ["2", "playlist"],
  ])("reads string repeat %s as %s", async (raw, expected) => {
    givenLmsStatusPayload({ "playlist repeat": raw });
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repeat).toBe(expected);
    }
  });

  it("keeps the two fields apart instead of reading one for both", async () => {
    givenLmsStatusPayload({
      "playlist shuffle": 1,
      "playlist repeat": 2,
    });
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.shuffle).toBe("songs");
      expect(result.value.repeat).toBe("playlist");
    }
  });

  it("falls back to off when both fields are absent, without failing the status", async () => {
    givenLmsStatusPayload({});
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.shuffle).toBe("off");
      expect(result.value.repeat).toBe("off");
      expect(result.value.mode).toBe("play");
    }
  });

  it("falls back to off on values no LMS version documents, without failing the status", async () => {
    givenLmsStatusPayload({
      "playlist shuffle": 7,
      "playlist repeat": "sometimes",
    });
    const client = createLmsClient(config);

    const result = await client.getStatus();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.shuffle).toBe("off");
      expect(result.value.repeat).toBe("off");
      expect(result.value.volume).toBe(50);
    }
  });
});
