import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCachedAlbum,
  setCachedAlbum,
  clearAlbumCache,
  ALBUM_CACHE_TTL_MS,
  MAX_ALBUM_CACHE_SIZE,
} from "./cache.js";
import type { AlbumDetail } from "../core/types.js";

const mockAlbum: AlbumDetail = {
  id: "42",
  title: "Test Album",
  artist: "Test Artist",
  releaseYear: 2021,
  coverArtUrl: "http://localhost:9000/music/1/cover.jpg",
  tracks: [],
};

describe("Album Metadata Cache", () => {
  beforeEach(() => {
    clearAlbumCache();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  it("returns null for cache miss", () => {
    expect(getCachedAlbum("42")).toBeNull();
  });

  it("returns cached value for cache hit", () => {
    setCachedAlbum("42", mockAlbum);
    expect(getCachedAlbum("42")).toEqual(mockAlbum);
  });

  it("returns null for expired entry", () => {
    setCachedAlbum("42", mockAlbum);
    vi.advanceTimersByTime(ALBUM_CACHE_TTL_MS + 1);
    expect(getCachedAlbum("42")).toBeNull();
  });

  it("returns null at exact TTL expiry", () => {
    setCachedAlbum("42", mockAlbum);
    vi.advanceTimersByTime(ALBUM_CACHE_TTL_MS);
    expect(getCachedAlbum("42")).toBeNull();
  });

  it("returns value just before TTL expiry", () => {
    setCachedAlbum("42", mockAlbum);
    vi.advanceTimersByTime(ALBUM_CACHE_TTL_MS - 1);
    expect(getCachedAlbum("42")).toEqual(mockAlbum);
  });

  it("clearAlbumCache removes all entries", () => {
    setCachedAlbum("42", mockAlbum);
    setCachedAlbum("99", mockAlbum);
    clearAlbumCache();
    expect(getCachedAlbum("42")).toBeNull();
    expect(getCachedAlbum("99")).toBeNull();
  });

  it("does not store new entries when cache is at max capacity", () => {
    Array.from({ length: MAX_ALBUM_CACHE_SIZE }, (_, i) => {
      setCachedAlbum(String(i), mockAlbum);
    });
    setCachedAlbum("overflow", mockAlbum);
    expect(getCachedAlbum("overflow")).toBeNull();
  });

  it("different albumIds are cached independently", () => {
    const album2: AlbumDetail = {
      ...mockAlbum,
      id: "99",
      title: "Other Album",
    };
    setCachedAlbum("42", mockAlbum);
    setCachedAlbum("99", album2);
    expect(getCachedAlbum("42")).toEqual(mockAlbum);
    expect(getCachedAlbum("99")).toEqual(album2);
  });
});
