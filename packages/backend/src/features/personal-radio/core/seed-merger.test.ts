/**
 * Personal Radio — spreadSample Unit Tests
 *
 * Appended to the existing seed-merger test file.
 * Covers all specified edge cases for spreadSample.
 */

import { describe, it, test, expect } from "vitest";
import {
  pickChannel,
  mergeTrackPools,
  spreadSample,
  fisherYatesShuffle,
} from "./seed-merger.js";

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

// ---------------------------------------------------------------------------
// spreadSample
// ---------------------------------------------------------------------------

describe("spreadSample", () => {
  test("empty array → []", () => {
    expect(spreadSample([], 5)).toEqual([]);
  });

  test("n=0 → []", () => {
    expect(spreadSample(["a", "b", "c"], 0)).toEqual([]);
  });

  test("single-element array with n=5 → [that element]", () => {
    expect(spreadSample(["a"], 5)).toEqual(["a"]);
  });

  test("array of 5, n=5 → all 5 elements in order", () => {
    expect(spreadSample(["a", "b", "c", "d", "e"], 5)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  test("n=1 → only first element", () => {
    expect(spreadSample(["a", "b", "c"], 1)).toEqual(["a"]);
  });

  test("array of 10, n=5 → 5 elements including first and last", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const result = spreadSample(arr, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("a");
    expect(result[result.length - 1]).toBe("j");
  });

  test("array of 10, n=3 → 3 elements including first and last", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const result = spreadSample(arr, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("a");
    expect(result[result.length - 1]).toBe("j");
  });

  test("deduplication: array shorter than n returns unique elements only", () => {
    // arr of length 3, n=10 → should return arr as-is (no duplicates)
    const result = spreadSample(["x", "y", "z"], 10);
    expect(result).toEqual(["x", "y", "z"]);
    // Verify no duplicates
    expect(new Set(result).size).toBe(result.length);
  });

  test("n=2 → first and last element", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const result = spreadSample(arr, 2);
    expect(result).toEqual(["a", "e"]);
  });

  test("evenly spread: array of 9, n=5 → indices 0,2,4,6,8", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    // Math.round(i * 8 / 4) for i in 0..4 → 0, 2, 4, 6, 8
    const result = spreadSample(arr, 5);
    expect(result).toEqual(["a", "c", "e", "g", "i"]);
  });
});

describe("fisherYatesShuffle", () => {
  it("returns empty array for empty input", () => {
    expect(fisherYatesShuffle([], Math.random)).toEqual([]);
  });

  it("returns single element unchanged", () => {
    expect(fisherYatesShuffle([42], Math.random)).toEqual([42]);
  });

  it("preserves all elements (set equality)", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = fisherYatesShuffle(arr, Math.random);
    expect(new Set(result)).toEqual(new Set(arr));
  });

  it("preserves length", () => {
    const arr = ["a", "b", "c", "d"];
    expect(fisherYatesShuffle(arr, Math.random)).toHaveLength(arr.length);
  });

  it("produces an exact deterministic order for a fixed random sequence", () => {
    const arr = ["a", "b", "c", "d"];
    // Fixed sequence of "random" values, one per reduce step (i = 0..3).
    const sequence = [0.9, 0.5, 0.1, 0.0];
    let call = 0;
    const random = (): number => sequence[call++] ?? 0;

    // Trace of the algorithm (acc starts as [...arr] = ["a","b","c","d"]):
    //
    // i=0: remaining=4, j=floor(0.9*4)=3
    //   acc[3]="d" (item), acc[3]="d" (last, remaining-1=3)
    //   → map: idx3 -> last("d"), idx3(again, last branch wins in ternary) -> item("d")
    //   Note: j === remaining-1 here (3===3), so the ternary's second branch wins
    //   for idx 3 ("idx === remaining - 1 ? item : el"), leaving acc unchanged:
    //   acc = ["a","b","c","d"]
    //
    // i=1: remaining=3, j=floor(0.5*3)=1
    //   item=acc[1]="b", last=acc[2]="c"
    //   idx1 -> last("c"), idx2 -> item("b"), others unchanged
    //   acc = ["a","c","b","d"]
    //
    // i=2: remaining=2, j=floor(0.1*2)=0
    //   item=acc[0]="a", last=acc[1]="c"
    //   idx0 -> last("c"), idx1 -> item("a")
    //   acc = ["c","a","b","d"]
    //
    // i=3: remaining=1, j=floor(0.0*1)=0
    //   item=acc[0]="c", last=acc[0]="c" (remaining-1=0)
    //   idx0 -> last wins over item in ternary ("idx === remaining - 1 ? item : el")
    //   since idx===0===remaining-1, idx0 -> item("c"): acc unchanged
    //   acc = ["c","a","b","d"]
    expect(fisherYatesShuffle(arr, random)).toEqual(["c", "a", "b", "d"]);
  });
});
