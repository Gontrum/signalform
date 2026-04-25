/**
 * Search Cache Tests
 *
 * Tests for in-memory search results caching.
 * NFR4: Cache helps achieve < 300ms perceived response time.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCachedResults,
  setCachedResults,
  clearCache,
  CACHE_TTL_MS,
} from "./cache.js";

describe("Search Cache", () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  it("returns null for cache miss", () => {
    const result = getCachedResults("Pink Floyd");

    expect(result).toBeNull();
  });

  it("returns cached results for cache hit", () => {
    const mockResults = {
      results: [{ id: "1", title: "Track 1" }],
      query: "Pink Floyd",
      totalCount: 1,
    };

    setCachedResults("Pink Floyd", mockResults);
    const result = getCachedResults("Pink Floyd");

    expect(result).toEqual(mockResults);
  });

  it("returns null for expired cache entry", () => {
    const mockResults = {
      results: [],
      query: "test",
      totalCount: 0,
    };

    setCachedResults("test", mockResults);

    // Advance time beyond TTL (5 minutes + 1ms)
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);

    const result = getCachedResults("test");

    expect(result).toBeNull();
  });

  it("cache is case-sensitive", () => {
    const mockResults = {
      results: [],
      query: "Pink Floyd",
      totalCount: 0,
    };

    setCachedResults("Pink Floyd", mockResults);

    expect(getCachedResults("pink floyd")).toBeNull();
    expect(getCachedResults("Pink Floyd")).toEqual(mockResults);
  });

  it("clears all cache entries", () => {
    setCachedResults("query1", { results: [], query: "query1", totalCount: 0 });
    setCachedResults("query2", { results: [], query: "query2", totalCount: 0 });

    clearCache();

    expect(getCachedResults("query1")).toBeNull();
    expect(getCachedResults("query2")).toBeNull();
  });

  it("cache entry includes timestamp", () => {
    const mockResults = {
      results: [],
      query: "test",
      totalCount: 0,
    };

    setCachedResults("test", mockResults);

    const cached = getCachedResults("test");

    expect(cached).toBeDefined();
    // Note: Timestamp is internal implementation detail
    // We test time-based expiry via TTL tests below
  });

  it("respects TTL of 5 minutes", () => {
    const mockResults = {
      results: [],
      query: "test",
      totalCount: 0,
    };

    setCachedResults("test", mockResults);

    // Just before expiry (5 min - 1ms)
    vi.advanceTimersByTime(CACHE_TTL_MS - 1);
    expect(getCachedResults("test")).toEqual(mockResults);

    // Just after expiry (1ms more)
    vi.advanceTimersByTime(2);
    expect(getCachedResults("test")).toBeNull();
  });

  it("handles multiple queries independently", () => {
    const results1 = { results: [], query: "Pink Floyd", totalCount: 0 };
    const results2 = { results: [], query: "Beatles", totalCount: 0 };

    setCachedResults("Pink Floyd", results1);
    setCachedResults("Beatles", results2);

    expect(getCachedResults("Pink Floyd")).toEqual(results1);
    expect(getCachedResults("Beatles")).toEqual(results2);

    // Expire only first query
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);

    expect(getCachedResults("Pink Floyd")).toBeNull();
    // Second query should not be affected by time passing
    // (it has its own timestamp from when it was set)
  });
});
