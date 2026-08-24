import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { clearLocalAlbumsCache, getAllLocalAlbums } from "./local-albums.js";
import { createLibraryRoute } from "../../library/shell/route.js";
import { clearLibraryCache } from "../../library/shell/service.js";
import {
  createLmsClient,
  type LibraryAlbumRaw,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";

const defaultLmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getLibraryAlbums: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbums"]>
  >;
  readonly rescanLibrary: ReturnType<typeof vi.fn<LmsClient["rescanLibrary"]>>;
  readonly getRescanProgress: ReturnType<
    typeof vi.fn<LmsClient["getRescanProgress"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  getLibraryAlbums: vi.fn<LmsClient["getLibraryAlbums"]>(),
  rescanLibrary: vi
    .fn<LmsClient["rescanLibrary"]>()
    .mockResolvedValue(ok(undefined)),
  getRescanProgress: vi.fn<LmsClient["getRescanProgress"]>().mockResolvedValue(
    ok({
      scanning: false,
      step: "",
      info: "",
      totalTime: "00:00:04",
    }),
  ),
});

const albumsFrom = (
  startId: number,
  count: number,
): readonly LibraryAlbumRaw[] =>
  Array.from({ length: count }, (_unused, index) => ({
    id: startId + index,
    album: `Album ${startId + index}`,
    artist: "Artist",
  }));

describe("getAllLocalAlbums", () => {
  let mockLmsClient: MockLmsClient;

  beforeEach(() => {
    clearLocalAlbumsCache();
    mockLmsClient = createMockLmsClient();
  });

  it("pages past the 999-row LMS limit and returns every album, including index > 999", async () => {
    const firstPage = albumsFrom(0, 999);
    const secondPage = albumsFrom(999, 501);
    mockLmsClient.getLibraryAlbums.mockImplementation(async (offset) =>
      offset === 0
        ? ok({ albums: firstPage, count: 1500 })
        : ok({ albums: secondPage, count: 1500 }),
    );

    const result = await getAllLocalAlbums(mockLmsClient);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1500);
    expect(result.value.find((album) => album.id === 1200)).toEqual({
      id: 1200,
      album: "Album 1200",
      artist: "Artist",
    });
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(2);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenNthCalledWith(
      1,
      0,
      999,
      {},
    );
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenNthCalledWith(
      2,
      999,
      999,
      {},
    );
  });

  it("advances by the rows actually delivered when LMS returns a short page", async () => {
    mockLmsClient.getLibraryAlbums.mockImplementation(async (offset) =>
      offset === 0
        ? ok({ albums: albumsFrom(0, 500), count: 1500 })
        : ok({ albums: albumsFrom(500, 1000), count: 1500 }),
    );

    const result = await getAllLocalAlbums(mockLmsClient);

    expect(mockLmsClient.getLibraryAlbums).toHaveBeenNthCalledWith(
      2,
      500,
      999,
      {},
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1500);
    // Albums 500..998 exist only if the second page started at 500 instead of
    // at the requested page size — the silent hole this guards against.
    expect(result.value.find((album) => album.id === 750)).toEqual({
      id: 750,
      album: "Album 750",
      artist: "Artist",
    });
  });

  it("stops instead of looping when LMS keeps returning no rows below its own count", async () => {
    const CALL_CEILING = 5;
    mockLmsClient.getLibraryAlbums.mockImplementation(async () => {
      if (mockLmsClient.getLibraryAlbums.mock.calls.length > CALL_CEILING) {
        return err({ type: "NetworkError", message: "runaway paging" });
      }
      return ok({ albums: [], count: 1500 });
    });

    const result = await getAllLocalAlbums(mockLmsClient);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(1);
  });

  it("makes exactly one call for a library at the real-world size of 807 albums", async () => {
    const albums = albumsFrom(0, 807);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({ albums, count: 807 }),
    );

    const result = await getAllLocalAlbums(mockLmsClient);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(807);
    }
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(1);
  });

  it("fails the whole fetch, not just the missing page, when the second page errors", async () => {
    mockLmsClient.getLibraryAlbums.mockImplementation(async (offset) => {
      if (offset === 0) {
        return ok({ albums: albumsFrom(0, 999), count: 1500 });
      }
      return err({ type: "NetworkError", message: "LMS hung" });
    });

    const result = await getAllLocalAlbums(mockLmsClient);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "NetworkError",
        message: "LMS hung",
      });
    }
  });

  it("caches the full album list across calls within the TTL", async () => {
    const albums = albumsFrom(0, 807);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({ albums, count: 807 }),
    );

    const first = await getAllLocalAlbums(mockLmsClient);
    const second = await getAllLocalAlbums(mockLmsClient);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(1);
  });
});

describe("local album cache invalidation on library rescan", () => {
  let mockLmsClient: MockLmsClient;
  let server: FastifyInstance;

  const givenLibraryHolds = (title: string): void => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({ albums: [{ id: 1, album: title, artist: "Artist" }], count: 1 }),
    );
  };

  const titlesOf = async (): Promise<readonly string[]> => {
    const result = await getAllLocalAlbums(mockLmsClient);
    expect(result.ok).toBe(true);
    return result.ok ? result.value.map((album) => album.album) : [];
  };

  beforeEach(async () => {
    clearLibraryCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createLibraryRoute(server, mockLmsClient, defaultLmsConfig);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("drops the cached album list together with the library caches on rescan", async () => {
    givenLibraryHolds("Before");
    await titlesOf();
    await titlesOf();
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();

    await server.inject({ method: "POST", url: "/api/library/rescan" });
    await server.inject({ method: "GET", url: "/api/library/rescan/status" });
    givenLibraryHolds("After");

    expect(await titlesOf()).toEqual(["After"]);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(2);
  });

  it("keeps the cached album list for a status poll without a preceding rescan", async () => {
    givenLibraryHolds("Before");
    await titlesOf();

    await server.inject({ method: "GET", url: "/api/library/rescan/status" });
    givenLibraryHolds("After");

    expect(await titlesOf()).toEqual(["Before"]);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();
  });
});
