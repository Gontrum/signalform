import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok } from "@signalform/shared";
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
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseBody = (body: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(body);
  expect(isRecord(parsed)).toBe(true);
  return isRecord(parsed) ? parsed : {};
};

const albumTitles = (body: string): readonly string[] => {
  const albums = parseBody(body)["albums"];
  return (Array.isArray(albums) ? albums.filter(isRecord) : []).map((album) =>
    typeof album["title"] === "string" ? album["title"] : "",
  );
};

const hasMoreOf = (body: string): boolean | undefined => {
  const value = parseBody(body)["hasMore"];
  return typeof value === "boolean" ? value : undefined;
};

type YearAlbums = Readonly<Record<number, readonly LibraryAlbumRaw[]>>;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const albumsForYear = (
  year: number,
  count: number,
): readonly LibraryAlbumRaw[] =>
  Array.from({ length: count }, (_, index) => ({
    id: year * 100 + index,
    album: `${year}-${LETTERS[index] ?? String(index)}`,
    artist: `Artist ${year}`,
    year,
    artwork_track_id: `art${year}${index}`,
  }));

const buildYearAlbums = (
  counts: readonly (readonly [number, number])[],
): YearAlbums =>
  counts.reduce<YearAlbums>(
    (acc, [year, count]) => ({ ...acc, [year]: albumsForYear(year, count) }),
    {},
  );

const rowsFor = (
  albumsByYear: YearAlbums,
  year: number | undefined,
): readonly LibraryAlbumRaw[] =>
  year === undefined ? [] : (albumsByYear[year] ?? []);

const GENRE_ID = 7;

/**
 * Serves years, per-year counts and per-year pages from a fixture. A genre
 * filter switches to the second fixture, so a year can hold albums overall and
 * none under the genre.
 */
const installLibrary = (
  client: MockLmsClient,
  years: readonly number[],
  albumsByYear: YearAlbums,
  genreAlbumsByYear: YearAlbums = {},
): void => {
  const viewFor = (genreId: number | undefined): YearAlbums =>
    genreId === GENRE_ID ? genreAlbumsByYear : albumsByYear;

  client.getLibraryYears.mockResolvedValue(ok(years));
  client.getLibraryAlbumCount.mockImplementation(async (filters) =>
    ok(rowsFor(viewFor(filters?.genreId), filters?.year).length),
  );
  client.getLibraryAlbums.mockImplementation(async (offset, limit, filters) => {
    const rows = rowsFor(viewFor(filters?.genreId), filters?.year);
    return ok({
      albums: rows.slice(offset, offset + limit),
      count: rows.length,
    });
  });
};

/** The window the route must deliver, derived from the fixture alone. */
const expectedWindow = (
  albumsByYear: YearAlbums,
  years: readonly number[],
  offset: number,
  limit: number,
): readonly string[] =>
  [...years]
    .sort((left, right) => right - left)
    .flatMap((year) => rowsFor(albumsByYear, year))
    .slice(offset, offset + limit)
    .map((album) => album.album);

const countedYears = (client: MockLmsClient): readonly number[] =>
  client.getLibraryAlbumCount.mock.calls.map((call) => call[0]?.year ?? -1);

const requestedAlbumYears = (client: MockLmsClient): readonly number[] =>
  client.getLibraryAlbums.mock.calls.map((call) => call[2]?.year ?? -1);

// Ascending, as LMS lists them — the decade page must flip that itself.
const OLDER_YEARS: readonly number[] = Array.from(
  { length: 20 },
  (_, index) => 1970 + index,
);

// Deliberately uneven: with equal counts a broken slice mapping still lands on
// the right album boundaries. The eight newest already hold 68 albums.
const NEWEST_EIGHT_COUNTS: readonly (readonly [number, number])[] = [
  [1989, 7],
  [1988, 12],
  [1987, 9],
  [1986, 10],
  [1985, 6],
  [1984, 11],
  [1983, 8],
  [1982, 5],
];

const OLDER_ALBUMS: YearAlbums = buildYearAlbums([
  ...NEWEST_EIGHT_COUNTS,
  ...OLDER_YEARS.filter((year) => year <= 1981).map(
    (year): readonly [number, number] => [year, 4],
  ),
]);

const PAGE_SIZE = 60;

const LIBRARY_YEARS: readonly number[] = [0, ...OLDER_YEARS, 2005];

describe("GET /api/library/albums — decade paging", () => {
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

  describe("counting stops once another page is proven", () => {
    beforeEach(() => {
      installLibrary(mockLmsClient, LIBRARY_YEARS, OLDER_ALBUMS);
    });

    it("counts one concurrency group instead of every year of the decade", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&limit=${PAGE_SIZE}&offset=0`,
      });

      expect(response.statusCode).toBe(200);
      // 68 albums in the newest eight years already exceed offset+limit.
      expect(countedYears(mockLmsClient)).toEqual([
        1989, 1988, 1987, 1986, 1985, 1984, 1983, 1982,
      ]);
    });

    it("never asks for the counts of years the page cannot reach", async () => {
      await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&limit=${PAGE_SIZE}&offset=0`,
      });

      expect(countedYears(mockLmsClient)).not.toContain(1981);
      expect(countedYears(mockLmsClient)).not.toContain(1970);
    });

    it("delivers exactly the albums a full count would have delivered", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&limit=${PAGE_SIZE}&offset=0`,
      });

      expect(albumTitles(response.body)).toEqual(
        expectedWindow(OLDER_ALBUMS, OLDER_YEARS, 0, PAGE_SIZE),
      );
      // 7+12+9+10+6+11 = 55 albums, then five of 1983's eight.
      expect(albumTitles(response.body)).toHaveLength(PAGE_SIZE);
      expect(albumTitles(response.body)[0]).toBe("1989-a");
      expect(albumTitles(response.body)[PAGE_SIZE - 1]).toBe("1983-e");
      expect(requestedAlbumYears(mockLmsClient)).not.toContain(1982);
    });

    it("delivers a later window from the same early-exit prefix", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?decade=older&limit=10&offset=25",
      });

      expect(albumTitles(response.body)).toEqual(
        expectedWindow(OLDER_ALBUMS, OLDER_YEARS, 25, 10),
      );
      expect(albumTitles(response.body)[0]).toBe("1987-g");
      expect(hasMoreOf(response.body)).toBe(true);
    });

    it("reports hasMore while albums remain behind the window", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&limit=${PAGE_SIZE}&offset=0`,
      });

      expect(hasMoreOf(response.body)).toBe(true);
    });

    it("counts every year and reports no further page when nothing proves one", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&limit=${PAGE_SIZE}&offset=${PAGE_SIZE}`,
      });

      // 68 + 12*4 = 116 albums in total, so the window at 60..119 is the last.
      expect(hasMoreOf(response.body)).toBe(false);
      expect(countedYears(mockLmsClient)).toHaveLength(OLDER_YEARS.length);
      expect(countedYears(mockLmsClient)).toContain(1970);
      expect(albumTitles(response.body)).toEqual(
        expectedWindow(OLDER_ALBUMS, OLDER_YEARS, PAGE_SIZE, PAGE_SIZE),
      );
    });
  });

  describe("years without matches under a genre filter", () => {
    // Only three of twelve years hold albums of the genre; the gaps sit between
    // them, so a cursor that stalls on a zero count delivers a short page.
    const GENRE_ALBUMS: YearAlbums = buildYearAlbums([
      [1986, 2],
      [1980, 4],
      [1975, 3],
    ]);

    const GENRE_YEARS: readonly number[] = Array.from(
      { length: 12 },
      (_, index) => 1975 + index,
    );

    beforeEach(() => {
      installLibrary(
        mockLmsClient,
        GENRE_YEARS,
        buildYearAlbums(
          GENRE_YEARS.map((year): readonly [number, number] => [year, 9]),
        ),
        GENRE_ALBUMS,
      );
    });

    it("fills the page across the empty years", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&genreId=${GENRE_ID}&limit=6&offset=0`,
      });

      expect(albumTitles(response.body)).toEqual([
        "1986-a",
        "1986-b",
        "1980-a",
        "1980-b",
        "1980-c",
        "1980-d",
      ]);
      expect(requestedAlbumYears(mockLmsClient)).toEqual([1986, 1980]);
      // The first counting group sums to exactly 6: stopping on equality would
      // deliver these same six albums and claim they are the last ones.
      expect(hasMoreOf(response.body)).toBe(true);
    });

    it("keeps walking past the empty years for a later window", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&genreId=${GENRE_ID}&limit=6&offset=6`,
      });

      expect(albumTitles(response.body)).toEqual([
        "1975-a",
        "1975-b",
        "1975-c",
      ]);
      expect(hasMoreOf(response.body)).toBe(false);
    });

    it("reports no further page for a decade whose years hold nothing", async () => {
      installLibrary(mockLmsClient, GENRE_YEARS, GENRE_ALBUMS, {});

      const response = await server.inject({
        method: "GET",
        url: `/api/library/albums?decade=older&genreId=${GENRE_ID}&limit=6&offset=0`,
      });

      expect(response.statusCode).toBe(200);
      expect(albumTitles(response.body)).toEqual([]);
      expect(hasMoreOf(response.body)).toBe(false);
      expect(mockLmsClient.getLibraryAlbums).not.toHaveBeenCalled();
    });
  });

  describe("hasMore on the paths without a decade filter", () => {
    it("reports hasMore for a backward-paginated page", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(7));
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: albumsForYear(1999, 3), count: 7 }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest&limit=3&offset=3",
      });

      expect(hasMoreOf(response.body)).toBe(true);
    });

    it("reports no further page on the last backward-paginated page", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(7));
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: albumsForYear(1999, 1), count: 7 }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=year-newest&limit=3&offset=6",
      });

      expect(hasMoreOf(response.body)).toBe(false);
    });

    it("reports no further page past the recently-added hard limit", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(799));

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=recently-added&limit=50&offset=120",
      });

      expect(response.statusCode).toBe(200);
      expect(albumTitles(response.body)).toEqual([]);
      expect(hasMoreOf(response.body)).toBe(false);
      expect(mockLmsClient.getLibraryAlbums).not.toHaveBeenCalled();
    });

    it("reports hasMore below the recently-added hard limit", async () => {
      mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(799));
      mockLmsClient.getLibraryAlbums.mockResolvedValue(
        ok({ albums: albumsForYear(2026, 5), count: 799 }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/library/albums?sort=recently-added&limit=50&offset=0",
      });

      // 799 albums exist, but the capped list ends at 100.
      expect(hasMoreOf(response.body)).toBe(true);
    });
  });
});
