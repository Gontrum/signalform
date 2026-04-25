/**
 * Setup Discovery Parser Unit Tests
 *
 * Tests the pure parser and utility functions extracted from shell/discovery.ts.
 * No I/O, no network, no mocks required.
 */

import { describe, it, expect } from "vitest";
import {
  isJsonObject,
  parseServerStatusResult,
  toParsedPlayer,
  parsePlayersResult,
  appendUnique,
  computeDirectedBroadcast,
  extractBroadcastAddresses,
} from "./discovery-parsers.js";

// ─── isJsonObject ─────────────────────────────────────────────────────────────

describe("isJsonObject", () => {
  it("returns true for a plain object", () => {
    expect(isJsonObject({ key: "value" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isJsonObject(null)).toBe(false);
  });

  it("returns true for an array (arrays are objects in JS — callers must guard separately if needed)", () => {
    // The function is used to check JSON-RPC response objects, not arrays.
    // Callers never pass raw arrays here in practice.
    expect(isJsonObject([])).toBe(true);
  });

  it("returns false for a string", () => {
    expect(isJsonObject("string")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isJsonObject(42)).toBe(false);
  });
});

// ─── parseServerStatusResult ─────────────────────────────────────────────────

describe("parseServerStatusResult", () => {
  it("returns server_name and version when both present", () => {
    const result = parseServerStatusResult({
      result: { server_name: "My LMS", version: "8.3.2" },
    });
    expect(result.result?.server_name).toBe("My LMS");
    expect(result.result?.version).toBe("8.3.2");
  });

  it("returns {} for null input", () => {
    expect(parseServerStatusResult(null)).toEqual({});
  });

  it("returns {} for non-object input", () => {
    expect(parseServerStatusResult("not an object")).toEqual({});
    expect(parseServerStatusResult(42)).toEqual({});
  });

  it("returns {} when result field is missing", () => {
    expect(parseServerStatusResult({})).toEqual({});
  });

  it("returns {} when result field is not an object", () => {
    expect(parseServerStatusResult({ result: "bad" })).toEqual({});
  });

  it("returns undefined for server_name when it is not a string", () => {
    const result = parseServerStatusResult({
      result: { server_name: 42, version: "1.0" },
    });
    expect(result.result?.server_name).toBeUndefined();
    expect(result.result?.version).toBe("1.0");
  });

  it("returns undefined for version when it is not a string", () => {
    const result = parseServerStatusResult({
      result: { server_name: "My LMS", version: null },
    });
    expect(result.result?.server_name).toBe("My LMS");
    expect(result.result?.version).toBeUndefined();
  });
});

// ─── toParsedPlayer ──────────────────────────────────────────────────────────

describe("toParsedPlayer", () => {
  it("returns a ParsedPlayer when playerid and name are present", () => {
    const player = toParsedPlayer({
      playerid: "00:11:22:33:44:55",
      name: "Living Room",
      model: "squeezebox3",
      connected: 1,
    });
    expect(player).toEqual({
      playerid: "00:11:22:33:44:55",
      name: "Living Room",
      model: "squeezebox3",
      connected: 1,
    });
  });

  it("returns null for null input", () => {
    expect(toParsedPlayer(null)).toBeNull();
  });

  it("returns null when playerid is missing", () => {
    expect(toParsedPlayer({ name: "Player" })).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(toParsedPlayer({ playerid: "00:11:22:33:44:55" })).toBeNull();
  });

  it("returns null when playerid is not a string", () => {
    expect(toParsedPlayer({ playerid: 123, name: "Player" })).toBeNull();
  });

  it("returns player with optional model=undefined when model is absent", () => {
    const player = toParsedPlayer({
      playerid: "aa:bb:cc:dd:ee:ff",
      name: "Kitchen",
    });
    expect(player).not.toBeNull();
    expect(player?.model).toBeUndefined();
  });

  it("returns player with optional connected=undefined when connected is absent", () => {
    const player = toParsedPlayer({
      playerid: "aa:bb:cc:dd:ee:ff",
      name: "Kitchen",
    });
    expect(player?.connected).toBeUndefined();
  });
});

// ─── parsePlayersResult ──────────────────────────────────────────────────────

describe("parsePlayersResult", () => {
  it("returns players_loop with valid players", () => {
    const result = parsePlayersResult({
      result: {
        players_loop: [
          { playerid: "00:11:22:33:44:55", name: "Living Room" },
          { playerid: "aa:bb:cc:dd:ee:ff", name: "Kitchen" },
        ],
      },
    });
    expect(result.result?.players_loop).toHaveLength(2);
    expect(result.result?.players_loop?.[0]?.name).toBe("Living Room");
  });

  it("filters out invalid player entries (missing playerid)", () => {
    const result = parsePlayersResult({
      result: {
        players_loop: [
          { playerid: "00:11:22:33:44:55", name: "Good Player" },
          { name: "Bad Player" }, // missing playerid
        ],
      },
    });
    expect(result.result?.players_loop).toHaveLength(1);
    expect(result.result?.players_loop?.[0]?.name).toBe("Good Player");
  });

  it("returns {} for null input", () => {
    expect(parsePlayersResult(null)).toEqual({});
  });

  it("returns players_loop=undefined when players_loop field is absent", () => {
    const result = parsePlayersResult({ result: {} });
    expect(result.result?.players_loop).toBeUndefined();
  });

  it("returns players_loop=[] when players_loop is empty", () => {
    const result = parsePlayersResult({ result: { players_loop: [] } });
    expect(result.result?.players_loop).toEqual([]);
  });
});

// ─── appendUnique ────────────────────────────────────────────────────────────

describe("appendUnique", () => {
  it("appends a new value", () => {
    expect(appendUnique(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("does not append a duplicate value", () => {
    expect(appendUnique(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("returns a new array reference even when value is new", () => {
    const original = ["a"];
    const result = appendUnique(original, "b");
    expect(result).not.toBe(original);
  });

  it("returns the original array reference when value already exists", () => {
    const original = ["a", "b"];
    const result = appendUnique(original, "a");
    expect(result).toBe(original);
  });
});

// ─── computeDirectedBroadcast ─────────────────────────────────────────────────

describe("computeDirectedBroadcast", () => {
  it("computes broadcast for /24 network (255.255.255.0)", () => {
    expect(computeDirectedBroadcast("192.168.1.5", "255.255.255.0")).toBe(
      "192.168.1.255",
    );
  });

  it("computes broadcast for /16 network (255.255.0.0)", () => {
    expect(computeDirectedBroadcast("10.0.5.3", "255.255.0.0")).toBe(
      "10.0.255.255",
    );
  });

  it("computes broadcast for /8 network (255.0.0.0)", () => {
    expect(computeDirectedBroadcast("10.1.2.3", "255.0.0.0")).toBe(
      "10.255.255.255",
    );
  });

  it("computes broadcast for /32 network (255.255.255.255) — host route", () => {
    // /32 = host-only, broadcast = same as address
    expect(computeDirectedBroadcast("192.168.1.1", "255.255.255.255")).toBe(
      "192.168.1.1",
    );
  });

  it("computes broadcast for /23 network (255.255.254.0)", () => {
    expect(computeDirectedBroadcast("192.168.10.100", "255.255.254.0")).toBe(
      "192.168.11.255",
    );
  });
});

// ─── extractBroadcastAddresses ───────────────────────────────────────────────

describe("extractBroadcastAddresses", () => {
  it("always includes 255.255.255.255 as global broadcast", () => {
    const result = extractBroadcastAddresses({});
    expect(result).toContain("255.255.255.255");
  });

  it("adds directed broadcast for a /24 IPv4 interface", () => {
    const result = extractBroadcastAddresses({
      eth0: [
        { address: "192.168.1.100", netmask: "255.255.255.0", family: "IPv4" },
      ],
    });
    expect(result).toContain("192.168.1.255");
  });

  it("skips loopback addresses (127.x.x.x)", () => {
    const result = extractBroadcastAddresses({
      lo: [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4" }],
    });
    // loopback broadcast should not be added, only the global fallback
    expect(result).toEqual(["255.255.255.255"]);
  });

  it("skips IPv6 entries", () => {
    const result = extractBroadcastAddresses({
      eth0: [
        { address: "::1", netmask: "ffff::", family: "IPv6" },
        { address: "192.168.1.5", netmask: "255.255.255.0", family: "IPv4" },
      ],
    });
    // Only IPv4 broadcast added
    expect(result).toHaveLength(2);
    expect(result).toContain("192.168.1.255");
  });

  it("deduplicates when two interfaces have the same directed broadcast", () => {
    const result = extractBroadcastAddresses({
      eth0: [
        { address: "192.168.1.5", netmask: "255.255.255.0", family: "IPv4" },
      ],
      eth1: [
        { address: "192.168.1.6", netmask: "255.255.255.0", family: "IPv4" },
      ],
    });
    // Both resolve to 192.168.1.255 — should appear only once
    expect(result.filter((a) => a === "192.168.1.255")).toHaveLength(1);
  });

  it("handles numeric family field (as returned by some Node.js versions)", () => {
    const result = extractBroadcastAddresses({
      eth0: [
        { address: "10.0.0.1", netmask: "255.0.0.0", family: 4 }, // numeric 4 = IPv4
      ],
    });
    expect(result).toContain("10.255.255.255");
  });

  it("handles undefined interface entries gracefully", () => {
    const result = extractBroadcastAddresses({
      eth0: undefined,
    });
    expect(result).toEqual(["255.255.255.255"]);
  });
});
