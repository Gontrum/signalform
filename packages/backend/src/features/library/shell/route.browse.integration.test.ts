import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createLibraryRoute } from "./route.js";
import { clearLibraryCache } from "./service.js";
import {
  createLmsClient,
  type LibraryAlbumRaw,
  type LmsClient,
  type LmsConfig,
} from "../../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getLibraryAlbums: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbums"]>
  >;
  readonly getLibraryAlbumCount: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbumCount"]>
  >;
  readonly getLibraryYears: ReturnType<
    typeof vi.fn<LmsClient["getLibraryYears"]>
  >;
  readonly getGenres: ReturnType<typeof vi.fn<LmsClient["getGenres"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getLibraryAlbums: vi
    .fn<LmsClient["getLibraryAlbums"]>()
    .mockResolvedValue(ok({ albums: [], count: 0 })),
  getLibraryAlbumCount: vi
    .fn<LmsClient["getLibraryAlbumCount"]>()
    .mockResolvedValue(ok(0)),
  getLibraryYears: vi
    .fn<LmsClient["getLibraryYears"]>()
    .mockResolvedValue(ok([])),
  getGenres: vi.fn<LmsClient["getGenres"]>().mockResolvedValue(ok([])),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asRecords = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const parseBody = (body: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(body);
  expect(isRecord(parsed)).toBe(true);
  return isRecord(parsed) ? parsed : {};
};

const albumTitles = (body: string): readonly string[] =>
  asRecords(parseBody(body)["albums"]).map((album) =>
    typeof album["title"] === "string" ? album["title"] : "",
  );

const totalCountOf = (body: string): number => {
  const value = parseBody(body)["totalCount"];
  return typeof value === "number" ? value : -1;
};

const genresOf = (
  body: string,
): readonly { readonly name: string; readonly albumCount: unknown }[] =>
  asRecords(parseBody(body)["genres"]).map((genre) => ({
    name: typeof genre["name"] === "string" ? genre["name"] : "",
    albumCount: genre["albumCount"],
  }));

const messageOf = (body: string): string => {
  const value = parseBody(body)["message"];
  return typeof value === "string" ? value : "";
};

const rawAlbum = (
  id: number,
  title: string,
  year: number,
): LibraryAlbumRaw => ({
  id,
  album: title,
  artist: `Artist ${id}`,
  year,
  artwork_track_id: `art${id}`,
});

describe("GET /api/library/albums — sort, decade, genre, search", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearLibraryCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createLibraryRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  describe("sort mapping", () => {
    it.each([
      ["artist-az", "artistalbum"],
      ["title-az", "album"],
      ["year-newest", "yearalbum"],
      ["recently-added", "new"],
    ])("maps sort=%s to LMS sort:%s", async (sort, lmsSort) => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(12));
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: [rawAlbum(1, "Any", 2000)], count: 12 }),
      );

      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?limit=6&sort=${sort}`,
      });

      expect(response.statusCode).toBe(200);
      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ sort: lmsSort }),
      );
    });

    it("returns 400 for an unknown sort value", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=loudness",
      });

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.getLibraryAlbums).not.toHaveBeenCalled();
    });

    it("returns 400 for an unknown decade value", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=1980s",
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for a non-numeric genreId", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?genreId=rock",
      });

      expect(response.statusCode).toBe(400);
    });

    it("caps recently-added at the 100-album LMS browse limit", async () => {
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: [rawAlbum(1, "Fresh", 2026)], count: 799 }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=recently-added&limit=250",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(0, 100, {
        sort: "new",
      });
      expect(totalCountOf(response.body)).toBe(100);
    });

    it("answers past the recently-added cap without asking LMS for rows", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(799));

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=recently-added&offset=100&limit=50",
      });

      expect(response.statusCode).toBe(200);
      expect(albumTitles(response.body)).toEqual([]);
      expect(totalCountOf(response.body)).toBe(100);
      expect(mockLmsClient.getLibraryAlbums).not.toHaveBeenCalled();
    });
  });

  describe("year-newest backward pagination", () => {
    // LMS only sorts years ascending: the newest albums are the *last* rows.
    const ascendingRows: readonly LibraryAlbumRaw[] = [
      rawAlbum(1, "Oldest 1999", 1999),
      rawAlbum(2, "Middle 2001", 2001),
      rawAlbum(3, "Newest 2003", 2003),
    ];

    beforeEach(() => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(7));
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: ascendingRows, count: 7 }),
      );
    });

    it("requests the tail of the ascending result for page 0", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest&limit=3&offset=0",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(4, 3, {
        sort: "yearalbum",
      });
    });

    it("returns the fetched rows newest first", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest&limit=3&offset=0",
      });

      expect(albumTitles(response.body)).toEqual([
        "Newest 2003",
        "Middle 2001",
        "Oldest 1999",
      ]);
    });

    it("walks backward for the second page", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest&limit=3&offset=3",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(1, 3, {
        sort: "yearalbum",
      });
    });

    it("reports the filtered count from the count query", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest&limit=3&offset=0",
      });

      expect(totalCountOf(response.body)).toBe(7);
    });

    it("returns 503 when the count query fails", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(
        err({ type: "NetworkError", message: "Connection refused" }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest",
      });

      expect(response.statusCode).toBe(503);
    });
  });

  describe("decade filter", () => {
    // Ascending input on purpose: the decade page must come back newest year
    // first, so a missing sort would surface as 2011 rows before 2013 rows.
    const libraryYears: readonly number[] = [0, 1994, 2003, 2011, 2013, 2020];

    const yearAlbums: Readonly<Record<number, readonly LibraryAlbumRaw[]>> = {
      2011: [
        rawAlbum(11, "Eleven A", 2011),
        rawAlbum(12, "Eleven B", 2011),
        rawAlbum(13, "Eleven C", 2011),
      ],
      2013: [
        rawAlbum(31, "Thirteen A", 2013),
        rawAlbum(32, "Thirteen B", 2013),
      ],
    };

    beforeEach(() => {
      mockLmsClient.getLibraryYears.mockResolvedValue(ok(libraryYears));
      mockLmsClient.getLibraryAlbumCount.mockImplementation(async (filters) =>
        ok((yearAlbums[filters?.year ?? -1] ?? []).length),
      );
      mockLmsClient.getLibraryAlbums.mockImplementation(
        async (offset, limit, filters) => {
          const rows = yearAlbums[filters?.year ?? -1] ?? [];
          return ok({
            albums: rows.slice(offset, offset + limit),
            count: rows.length,
          });
        },
      );
    });

    it("returns a page that crosses a year boundary in newest-year-first order", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&limit=3&offset=1",
      });

      expect(response.statusCode).toBe(200);
      expect(albumTitles(response.body)).toEqual([
        "Thirteen B",
        "Eleven A",
        "Eleven B",
      ]);
    });

    it("returns the first page from the newest year of the decade", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&limit=2&offset=0",
      });

      expect(albumTitles(response.body)).toEqual(["Thirteen A", "Thirteen B"]);
    });

    it("sums the decade years into totalCount", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&limit=3&offset=1",
      });

      expect(totalCountOf(response.body)).toBe(5);
    });

    it("counts only the years belonging to the decade", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&limit=3&offset=0",
      });

      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledTimes(2);
      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledWith({
        year: 2013,
      });
      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledWith({
        year: 2011,
      });
    });

    it("sorts inside a year by album title, never by yearalbum", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&sort=year-newest&limit=2",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(
        0,
        2,
        expect.objectContaining({ sort: "album", year: 2013 }),
      );
    });

    it("keeps the chosen sort inside each year for artist-az", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&sort=artist-az&limit=2",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(
        0,
        2,
        expect.objectContaining({ sort: "artistalbum", year: 2013 }),
      );
    });

    it("caches the year list across requests", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&limit=2&offset=0",
      });
      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&limit=2&offset=2",
      });

      expect(mockLmsClient.getLibraryYears).toHaveBeenCalledOnce();
    });

    it("returns 400 when recently-added is combined with a decade", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=recently-added&decade=2010s",
      });

      expect(response.statusCode).toBe(400);
      expect(messageOf(response.body)).toContain("recently-added");
      expect(messageOf(response.body)).toContain("2010s");
      expect(mockLmsClient.getLibraryYears).not.toHaveBeenCalled();
    });

    it("returns an empty page for a decade without matching years", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=1990s&limit=10",
      });

      expect(response.statusCode).toBe(200);
      expect(albumTitles(response.body)).toEqual([]);
      expect(totalCountOf(response.body)).toBe(0);
    });

    it("returns 503 when the year list cannot be fetched", async () => {
      mockLmsClient.getLibraryYears.mockResolvedValue(
        err({ type: "NetworkError", message: "Connection refused" }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s",
      });

      expect(response.statusCode).toBe(503);
    });

    it("returns 503 when a per-year count fails", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(
        err({ type: "NetworkError", message: "Connection refused" }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s",
      });

      expect(response.statusCode).toBe(503);
    });

    it("returns 503 when one slice of the page fails", async () => {
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        err({ type: "NetworkError", message: "Connection refused" }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s",
      });

      expect(response.statusCode).toBe(503);
    });
  });

  describe("genre and search filters", () => {
    it("forwards genreId and search together with the sort", async () => {
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: [rawAlbum(1, "Kauf MICH!", 1993)], count: 15 }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?genreId=153&search=tote%20hosen&sort=title-az&limit=10",
      });

      expect(response.statusCode).toBe(200);
      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(0, 10, {
        sort: "album",
        genreId: 153,
        search: "tote hosen",
      });
      expect(totalCountOf(response.body)).toBe(15);
    });

    it("adds genreId and search to the per-year count of a decade page", async () => {
      mockLmsClient.getLibraryYears.mockResolvedValue(ok([2011, 2013]));
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(1));
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: [rawAlbum(1, "Only", 2013)], count: 1 }),
      );

      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s&genreId=153&search=die&limit=1",
      });

      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledWith({
        genreId: 153,
        search: "die",
        year: 2013,
      });
      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(0, 1, {
        sort: "artistalbum",
        genreId: 153,
        search: "die",
        year: 2013,
      });
    });

    it("treats a blank search as no search filter", async () => {
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: [], count: 0 }),
      );

      await server.inject({
        method: "GET",
        url: "/api/library/albums?search=%20%20",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(0, 250, {
        sort: "artistalbum",
      });
    });
  });

  describe("cache key covers every filter", () => {
    const albumsForSort = (
      sort: string | undefined,
    ): readonly LibraryAlbumRaw[] =>
      sort === "album"
        ? [rawAlbum(2, "Aardvark by Zed", 1990)]
        : [rawAlbum(1, "Zenith by Abba", 1990)];

    beforeEach(() => {
      mockLmsClient.getLibraryAlbums.mockImplementation(
        async (_offset, _limit, filters) =>
          ok({ albums: albumsForSort(filters?.sort), count: 1 }),
      );
    });

    it("does not serve a title-sorted page from the artist-sorted entry", async () => {
      const artistPage = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=artist-az&limit=10",
      });
      const titlePage = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=title-az&limit=10",
      });

      expect(albumTitles(artistPage.body)).toEqual(["Zenith by Abba"]);
      expect(albumTitles(titlePage.body)).toEqual(["Aardvark by Zed"]);
      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(2);
    });

    it("serves an identical request from cache", async () => {
      await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=artist-az&limit=10",
      });
      await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=artist-az&limit=10",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();
    });

    it("keeps genreId, search and decade apart in the cache key", async () => {
      mockLmsClient.getLibraryYears.mockResolvedValue(ok([2011]));
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(1));

      await server.inject({ method: "GET", url: "/api/library/albums" });
      await server.inject({
        method: "GET",
        url: "/api/library/albums?genreId=1",
      });
      await server.inject({
        method: "GET",
        url: "/api/library/albums?search=abba",
      });
      await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=2010s",
      });

      expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(4);
    });
  });
});

describe("GET /api/library/genres", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  // Insertion order is alphabetical on purpose, so the warm answer can only be
  // right if it really sorts by album count.
  const genreList = [
    { id: 1, name: "Ambient" },
    { id: 2, name: "Blues" },
    { id: 3, name: "Rock" },
  ] as const;

  const genreCounts: Readonly<Record<number, number>> = {
    1: 7,
    2: 50,
    3: 50,
  };

  const drainWarmup = async (calls: number): Promise<void> => {
    await vi.waitFor(() =>
      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledTimes(calls),
    );
  };

  beforeEach(async () => {
    clearLibraryCache();
    mockLmsClient = createMockLmsClient();
    mockLmsClient.getGenres.mockResolvedValue(ok(genreList));
    mockLmsClient.getLibraryAlbumCount.mockImplementation(async (filters) =>
      ok(genreCounts[filters?.genreId ?? -1] ?? 0),
    );
    server = Fastify({ logger: false });
    createLibraryRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("answers alphabetically without counts while cold", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/library/genres",
    });

    expect(response.statusCode).toBe(200);
    expect(genresOf(response.body)).toEqual([
      { name: "Ambient", albumCount: undefined },
      { name: "Blues", albumCount: undefined },
      { name: "Rock", albumCount: undefined },
    ]);

    await drainWarmup(genreList.length);
  });

  it("warms the counts in the background after a cold call", async () => {
    await server.inject({ method: "GET", url: "/api/library/genres" });

    await drainWarmup(genreList.length);
    expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledWith({
      genreId: 2,
    });
  });

  it("answers with counts, most albums first, once warm", async () => {
    await server.inject({ method: "GET", url: "/api/library/genres" });
    await drainWarmup(genreList.length);

    const response = await server.inject({
      method: "GET",
      url: "/api/library/genres",
    });

    expect(genresOf(response.body)).toEqual([
      { name: "Blues", albumCount: 50 },
      { name: "Rock", albumCount: 50 },
      { name: "Ambient", albumCount: 7 },
    ]);
  });

  it("starts the warm-up only once for two concurrent calls", async () => {
    await Promise.all([
      server.inject({ method: "GET", url: "/api/library/genres" }),
      server.inject({ method: "GET", url: "/api/library/genres" }),
    ]);

    await drainWarmup(genreList.length);
    expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledTimes(
      genreList.length,
    );
  });

  it("caches the genre list across calls", async () => {
    await server.inject({ method: "GET", url: "/api/library/genres" });
    await drainWarmup(genreList.length);
    await server.inject({ method: "GET", url: "/api/library/genres" });

    expect(mockLmsClient.getGenres).toHaveBeenCalledOnce();
  });

  it("stays degraded when a count query fails", async () => {
    mockLmsClient.getLibraryAlbumCount.mockImplementation(async (filters) =>
      filters?.genreId === 2
        ? err({ type: "NetworkError", message: "Connection refused" })
        : ok(genreCounts[filters?.genreId ?? -1] ?? 0),
    );

    await server.inject({ method: "GET", url: "/api/library/genres" });
    await drainWarmup(genreList.length);

    const response = await server.inject({
      method: "GET",
      url: "/api/library/genres",
    });

    expect(response.statusCode).toBe(200);
    expect(genresOf(response.body)).toEqual([
      { name: "Ambient", albumCount: undefined },
      { name: "Blues", albumCount: undefined },
      { name: "Rock", albumCount: undefined },
    ]);

    // The degraded answer re-armed the warm-up — let it finish inside this test.
    await drainWarmup(genreList.length * 2);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getGenres.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/library/genres",
    });

    expect(response.statusCode).toBe(503);
    expect(mockLmsClient.getLibraryAlbumCount).not.toHaveBeenCalled();
  });

  it("returns an empty list for a library without genres", async () => {
    mockLmsClient.getGenres.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "GET",
      url: "/api/library/genres",
    });

    expect(response.statusCode).toBe(200);
    expect(genresOf(response.body)).toEqual([]);
    expect(mockLmsClient.getLibraryAlbumCount).not.toHaveBeenCalled();
  });
});
