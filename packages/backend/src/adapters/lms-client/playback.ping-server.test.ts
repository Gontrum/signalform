/**
 * LMS Server Probe Adapter Tests
 *
 * pingServer exists to answer "is the server up?" without touching a player,
 * so the command it sends is as much of the contract as its result.
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

describe("pingServer", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the server itself, not the player", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { version: "9.1.1", player_count: 1 },
        id: 1,
        error: null,
      }),
    });
    const client = createLmsClient(config);

    const result = await client.pingServer();

    expect(result.ok).toBe(true);
    expect(sentCommandAt(0)).toEqual(["serverstatus", 0, 1]);
  });

  it("reports the server as unreachable when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createLmsClient(config);

    const result = await client.pingServer();

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.type).toBe("NetworkError");
  });

  it("does not retry — the poll loop decides when to ask again", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createLmsClient(config);

    await client.pingServer();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the server as unreachable when LMS answers with a JSON-RPC error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: null,
        id: 1,
        error: { code: -32601, message: "Method not found" },
      }),
    });
    const client = createLmsClient(config);

    const result = await client.pingServer();

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.type).toBe("LmsApiError");
  });
});
