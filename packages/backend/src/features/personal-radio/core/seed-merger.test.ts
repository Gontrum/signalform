/**
 * Personal Radio — Seed Merger Unit Tests
 *
 * No mocks needed — pure functions only.
 * Covers pickChannel and mergeTrackPools with all specified cases.
 */

import { describe, test, expect } from "vitest";
import { pickChannel, mergeTrackPools } from "./seed-merger.js";

// ---------------------------------------------------------------------------
// pickChannel
// ---------------------------------------------------------------------------

describe("pickChannel", () => {
  test("discoveryRatio=0, cycle=0 → comfort (no discovery ever)", () => {
    expect(pickChannel(0, 0)).toBe("comfort");
  });

  test("discoveryRatio=100, cycle=0 → discovery (always discovery)", () => {
    expect(pickChannel(0, 100)).toBe("discovery");
  });

  test("discoveryRatio=50, cycle=49 → discovery (49 < 50 = true)", () => {
    expect(pickChannel(49, 50)).toBe("discovery");
  });

  test("discoveryRatio=50, cycle=50 → comfort (50 < 50 = false)", () => {
    expect(pickChannel(50, 50)).toBe("comfort");
  });

  test("discoveryRatio=70, cycle=69 → discovery (69 < 70 = true)", () => {
    expect(pickChannel(69, 70)).toBe("discovery");
  });

  test("discoveryRatio=70, cycle=70 → comfort (70 < 70 = false)", () => {
    expect(pickChannel(70, 70)).toBe("comfort");
  });

  test("cycle=150, discoveryRatio=50 → comfort (150 % 100 = 50, 50 < 50 = false)", () => {
    expect(pickChannel(150, 50)).toBe("comfort");
  });

  test("cycle=149, discoveryRatio=50 → discovery (149 % 100 = 49, 49 < 50 = true)", () => {
    expect(pickChannel(149, 50)).toBe("discovery");
  });
});

// ---------------------------------------------------------------------------
// mergeTrackPools
// ---------------------------------------------------------------------------

describe("mergeTrackPools", () => {
  // Typed comfort and discovery pools for reuse
  const comfort8 = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
  const discovery8 = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] as const;

  test("discoveryRatio=0, totalSlots=8 → 8 comfort items, 0 discovery", () => {
    const result = mergeTrackPools(comfort8, discovery8, 0, 8);
    expect(result).toHaveLength(8);
    // All items must come from comfortPool
    expect(result).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
  });

  test("discoveryRatio=100, totalSlots=8 → 8 discovery items, 0 comfort", () => {
    const result = mergeTrackPools(comfort8, discovery8, 100, 8);
    expect(result).toHaveLength(8);
    // All items must come from discoveryPool
    expect(result).toEqual(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]);
  });

  test("discoveryRatio=50, totalSlots=8 → 4 discovery + 4 comfort", () => {
    const result = mergeTrackPools(comfort8, discovery8, 50, 8);
    expect(result).toHaveLength(8);
    // discovery first, then comfort
    expect(result).toEqual(["d1", "d2", "d3", "d4", "c1", "c2", "c3", "c4"]);
  });

  test("discoveryRatio=25, totalSlots=8 → 2 discovery + 6 comfort (round(8*25/100)=2)", () => {
    // Math.round(8 * 25 / 100) = Math.round(2) = 2
    const result = mergeTrackPools(comfort8, discovery8, 25, 8);
    expect(result).toHaveLength(8);
    expect(result).toEqual(["d1", "d2", "c1", "c2", "c3", "c4", "c5", "c6"]);
  });

  test("discovery pool shorter than discoverySlots → returns all of discovery + enough comfort", () => {
    // discoveryRatio=50, totalSlots=8 → 4 discovery slots, 4 comfort slots
    // but discoveryPool only has 2 items
    const shortDiscovery = ["d1", "d2"];
    const result = mergeTrackPools(comfort8, shortDiscovery, 50, 8);
    // discoveryPool contributes 2 (all available), comfortPool contributes 4
    expect(result).toEqual(["d1", "d2", "c1", "c2", "c3", "c4"]);
    expect(result).toHaveLength(6);
  });

  test("generic type: works with string arrays", () => {
    const comfortStrings: readonly string[] = ["alpha", "beta", "gamma"];
    const discoveryStrings: readonly string[] = ["delta", "epsilon"];
    const result = mergeTrackPools(comfortStrings, discoveryStrings, 50, 4);
    // discoverySlots = Math.round(4 * 50 / 100) = 2, comfortSlots = 2
    expect(result).toEqual(["delta", "epsilon", "alpha", "beta"]);
  });

  test("comfort pool shorter than comfortSlots → returns what is available", () => {
    const shortComfort = ["c1", "c2"];
    // discoveryRatio=0 → all comfort, 8 slots but only 2 available
    const result = mergeTrackPools(shortComfort, discovery8, 0, 8);
    expect(result).toEqual(["c1", "c2"]);
    expect(result).toHaveLength(2);
  });

  test("both pools empty → returns empty array", () => {
    const result = mergeTrackPools([], [], 50, 8);
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  test("totalSlots=0 → returns empty array regardless of ratio", () => {
    const result = mergeTrackPools(comfort8, discovery8, 50, 0);
    expect(result).toHaveLength(0);
  });
});
