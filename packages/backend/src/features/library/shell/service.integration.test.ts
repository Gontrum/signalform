import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ok, err } from "@signalform/shared";
import {
  getLibraryAlbums,
  clearLibraryCache,
  MAX_LIBRARY_CACHE_SIZE,
} from "./service.js";
import type {
  LmsClient,
  LmsConfig,
  LibraryAlbumRaw,
} from "../../../adapters/lms-client/index.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

const makeRawAlbum = (
  overrides: Partial<LibraryAlbumRaw> = {},
): LibraryAlbumRaw => ({
  id: 42,
  album: "The Wall",
  artist: "Pink Floyd",
  year: 1979,
  artwork_track_id: "abc123",
  genre: undefined,
  ...overrides,
});

type MockLmsClient = LmsClient & {
  readonly getLibraryAlbums: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbums"]>
  >;
};

const makeMockClient = (
  albums: ReadonlyArray<LibraryAlbumRaw>,
  count: number,
): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getLibraryAlbums: vi
    .fn<LmsClient["getLibraryAlbums"]>()
    .mockResolvedValue(ok({ albums, count })),
});

/** Runs async tasks one after another, waiting for each to complete before starting the next. */
const runInSequence = (
  tasks: ReadonlyArray<() => Promise<unknown>>,
): Promise<void> =>
  tasks.reduce(
    async (
      chain: Promise<void>,
      task: () => Promise<unknown>,
    ): Promise<void> => {
      await chain;
      await task();
    },
    Promise.resolve(),
  );

describe("getLibraryAlbums service", () => {
  beforeEach(() => {
    clearLibraryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps raw albums to domain LibraryAlbum objects", async () => {
    const client = makeMockClient([makeRawAlbum()], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      const album = result.value.albums[0];
      expect(album?.id).toBe("42");
      expect(album?.title).toBe("The Wall");
      expect(album?.artist).toBe("Pink Floyd");
      expect(album?.releaseYear).toBe(1979);
      expect(album?.coverArtUrl).toContain("abc123");
    }
  });

  it("uses artwork_track_id for cover art URL when present", async () => {
    const client = makeMockClient(
      [makeRawAlbum({ artwork_track_id: "abc123" })],
      1,
    );

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.coverArtUrl).toBe(
        "http://localhost:9000/music/abc123/cover.jpg",
      );
    }
  });

  it("falls back to album id for cover art URL when artwork_track_id absent", async () => {
    const client = makeMockClient(
      [makeRawAlbum({ artwork_track_id: undefined })],
      1,
    );

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.coverArtUrl).toBe(
        "http://localhost:9000/music/0/cover.jpg?album_id=42",
      );
    }
  });

  it("maps year=0 to releaseYear=null", async () => {
    const client = makeMockClient([makeRawAlbum({ year: 0 })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.releaseYear).toBeNull();
    }
  });

  it("maps absent year to releaseYear=null", async () => {
    const client = makeMockClient([makeRawAlbum({ year: undefined })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.releaseYear).toBeNull();
    }
  });

  it("maps absent artist to empty string", async () => {
    const client = makeMockClient([makeRawAlbum({ artist: undefined })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.artist).toBe("");
    }
  });

  it("returns totalCount from LMS count field", async () => {
    const client = makeMockClient([makeRawAlbum()], 767);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.totalCount).toBe(767);
    }
  });

  it("returns empty albums array when LMS returns empty list", async () => {
    const client = makeMockClient([], 0);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(0);
      expect(result.value.totalCount).toBe(0);
    }
  });

  // Story 7.3: genre mapping tests (Task 0 — AC genre pipeline)
  it("maps raw.genre string to genre field in domain album", async () => {
    const client = makeMockClient([makeRawAlbum({ genre: "Rock" })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.genre).toBe("Rock");
    }
  });

  it("maps raw.genre empty string to genre null", async () => {
    const client = makeMockClient([makeRawAlbum({ genre: "" })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.genre).toBeNull();
    }
  });

  it("maps absent raw.genre to genre null", async () => {
    const client = makeMockClient([makeRawAlbum({ genre: undefined })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.genre).toBeNull();
    }
  });

  it("trims whitespace from raw.genre before mapping", async () => {
    const client = makeMockClient([makeRawAlbum({ genre: "  Jazz  " })], 1);

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    if (result.ok) {
      expect(result.value.albums[0]?.genre).toBe("Jazz");
    }
  });

  it("returns LmsError when LMS client fails", async () => {
    const client: MockLmsClient = {
      ...makeMockClient([], 0),
      getLibraryAlbums: vi
        .fn<LmsClient["getLibraryAlbums"]>()
        .mockResolvedValue(
          err({ type: "NetworkError", message: "Connection refused" }),
        ),
    };

    const result = await getLibraryAlbums(0, 250, client, defaultConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("LmsError");
      expect(result.error.message).toBe("Connection refused");
    }
  });

  // AC3 — Caching tests (Task 0: written RED before cache implementation)
  describe("AC3 — 1-hour TTL cache", () => {
    it("AC3a: second call with same offset/limit is served from cache (lmsClient called only once)", async () => {
      const client = makeMockClient([makeRawAlbum()], 1);

      await getLibraryAlbums(0, 250, client, defaultConfig);
      await getLibraryAlbums(0, 250, client, defaultConfig);

      expect(client.getLibraryAlbums).toHaveBeenCalledOnce();
    });

    it("AC3b: different offset/limit = separate cache entries (lmsClient called twice)", async () => {
      const client = makeMockClient([makeRawAlbum()], 1);

      await getLibraryAlbums(0, 250, client, defaultConfig);
      await getLibraryAlbums(250, 250, client, defaultConfig);

      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(2);
    });

    it("AC3c: cache expires after TTL — re-fetches from LMS", async () => {
      const mockNow = vi.spyOn(Date, "now");
      mockNow.mockReturnValue(0);

      const client = makeMockClient([makeRawAlbum()], 1);

      // First call — populates cache at t=0
      await getLibraryAlbums(0, 250, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledOnce();

      // Within TTL (t=30min) — served from cache
      mockNow.mockReturnValue(30 * 60 * 1000);
      await getLibraryAlbums(0, 250, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledOnce();

      // After TTL (t=1h+1s) — re-fetches
      mockNow.mockReturnValue(3601 * 1000);
      await getLibraryAlbums(0, 250, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(2);
    });

    it("AC3d: LMS error on first call is NOT cached (next call retries LMS)", async () => {
      const errorClient: MockLmsClient = {
        ...makeMockClient([], 0),
        getLibraryAlbums: vi
          .fn<LmsClient["getLibraryAlbums"]>()
          .mockResolvedValueOnce(
            err({ type: "NetworkError", message: "Connection refused" }),
          )
          .mockResolvedValueOnce(ok({ albums: [makeRawAlbum()], count: 1 })),
      };

      const firstResult = await getLibraryAlbums(
        0,
        250,
        errorClient,
        defaultConfig,
      );
      expect(firstResult.ok).toBe(false);

      const secondResult = await getLibraryAlbums(
        0,
        250,
        errorClient,
        defaultConfig,
      );
      expect(secondResult.ok).toBe(true);
      expect(errorClient.getLibraryAlbums).toHaveBeenCalledTimes(2);
    });

    it("AC3b-limit: different limit with same offset = separate cache entries", async () => {
      const client = makeMockClient([makeRawAlbum()], 1);

      await getLibraryAlbums(0, 100, client, defaultConfig);
      await getLibraryAlbums(0, 250, client, defaultConfig);

      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(2);
    });

    it("AC3-ttl-boundary: cache entry at exact TTL boundary (expireAt) is expired", async () => {
      const mockNow = vi.spyOn(Date, "now");
      mockNow.mockReturnValue(0); // t=0, expireAt = 3600000

      const client = makeMockClient([makeRawAlbum()], 1);

      await getLibraryAlbums(0, 250, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledOnce();

      // At exact expiry: Date.now() === expireAt → NOT < expireAt → expired
      mockNow.mockReturnValue(3600 * 1000);
      await getLibraryAlbums(0, 250, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(2);
    });

    it("evicts oldest cache entry when MAX_LIBRARY_CACHE_SIZE is reached", async () => {
      const client = makeMockClient([makeRawAlbum()], 1);

      // Fill cache to capacity (keys "0:1" through "${MAX-1}:1")
      await runInSequence(
        Array.from(
          { length: MAX_LIBRARY_CACHE_SIZE },
          (_, i): (() => Promise<unknown>) =>
            () =>
              getLibraryAlbums(i, 1, client, defaultConfig),
        ),
      );
      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(
        MAX_LIBRARY_CACHE_SIZE,
      );

      // 101st unique entry triggers eviction of oldest ("0:1")
      await getLibraryAlbums(MAX_LIBRARY_CACHE_SIZE, 1, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(
        MAX_LIBRARY_CACHE_SIZE + 1,
      );

      // Evicted entry is now a cache miss — LMS is called again
      await getLibraryAlbums(0, 1, client, defaultConfig);
      expect(client.getLibraryAlbums).toHaveBeenCalledTimes(
        MAX_LIBRARY_CACHE_SIZE + 2,
      );
    });

    it("AC3e: cached response has same shape as non-cached response", async () => {
      const client = makeMockClient([makeRawAlbum()], 1);

      const firstResult = await getLibraryAlbums(0, 250, client, defaultConfig);
      const secondResult = await getLibraryAlbums(
        0,
        250,
        client,
        defaultConfig,
      );

      expect(firstResult.ok).toBe(true);
      expect(secondResult.ok).toBe(true);
      if (firstResult.ok && secondResult.ok) {
        expect(secondResult.value.albums).toHaveLength(
          firstResult.value.albums.length,
        );
        expect(secondResult.value.totalCount).toBe(
          firstResult.value.totalCount,
        );
        const first = firstResult.value.albums[0];
        const second = secondResult.value.albums[0];
        expect(second?.id).toBe(first?.id);
        expect(second?.title).toBe(first?.title);
        expect(second?.artist).toBe(first?.artist);
        expect(second?.coverArtUrl).toBe(first?.coverArtUrl);
        expect(second?.releaseYear).toBe(first?.releaseYear);
        expect(second?.genre).toBe(first?.genre);
      }
    });
  });
});
