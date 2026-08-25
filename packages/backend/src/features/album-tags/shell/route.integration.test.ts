import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { ok, err } from "@signalform/shared";
import { createAlbumTagsRoute } from "./route.js";
import { clearLocalAlbumsCache } from "./local-albums.js";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
} from "../../../adapters/lms-client/index.js";
import {
  createDiscogsClient,
  type DiscogsClient,
  type DiscogsSearchResult,
} from "../../../adapters/discogs-client/index.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getLibraryAlbums: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbums"]>
  >;
  readonly searchTidalAlbums: ReturnType<
    typeof vi.fn<LmsClient["searchTidalAlbums"]>
  >;
};

type MockDiscogsClient = DiscogsClient & {
  readonly searchReleases: ReturnType<
    typeof vi.fn<DiscogsClient["searchReleases"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  getLibraryAlbums: vi
    .fn<LmsClient["getLibraryAlbums"]>()
    .mockResolvedValue(ok({ albums: [], count: 0 })),
  searchTidalAlbums: vi
    .fn<LmsClient["searchTidalAlbums"]>()
    .mockResolvedValue(ok([])),
});

const createMockDiscogsClient = (): MockDiscogsClient => ({
  ...createDiscogsClient(),
  searchReleases: vi
    .fn<DiscogsClient["searchReleases"]>()
    .mockResolvedValue(ok({ results: [], totalItems: 0 })),
});

const givenDiscogsReturns = (
  client: MockDiscogsClient,
  results: readonly DiscogsSearchResult[],
  totalItems: number = results.length,
): void => {
  client.searchReleases.mockResolvedValue(ok({ results, totalItems }));
};

const startServer = async (
  mockLmsClient: MockLmsClient,
  mockDiscogsClient: MockDiscogsClient,
): Promise<FastifyInstance> => {
  const server = Fastify({ logger: false });
  createAlbumTagsRoute(
    server,
    mockLmsClient,
    mockDiscogsClient,
    defaultLmsConfig,
  );
  await server.ready();
  return server;
};

const getAlbums = async (
  server: FastifyInstance,
  querystring: string,
): Promise<LightMyRequestResponse> =>
  await server.inject({
    method: "GET",
    url: `/api/tags/discogs/albums?${querystring}`,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type AlbumsBody = {
  readonly albums: readonly Record<string, unknown>[];
  readonly hasMore: boolean;
  readonly totalCandidates: number;
};

const EMPTY_ALBUMS_BODY: AlbumsBody = {
  albums: [],
  hasMore: false,
  totalCandidates: 0,
};

const parseAlbumsBody = (body: string): AlbumsBody => {
  const parsed = JSON.parse(body) as unknown;
  expect(isRecord(parsed)).toBe(true);
  if (!isRecord(parsed)) {
    return EMPTY_ALBUMS_BODY;
  }

  const albums = Array.isArray(parsed["albums"])
    ? parsed["albums"].filter(isRecord)
    : [];

  return {
    albums,
    hasMore: parsed["hasMore"] === true,
    totalCandidates:
      typeof parsed["totalCandidates"] === "number"
        ? parsed["totalCandidates"]
        : 0,
  };
};

const titleOf = (album: Record<string, unknown>): string =>
  typeof album["title"] === "string" ? album["title"] : "";

describe("GET /api/tags/discogs/albums", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockDiscogsClient: MockDiscogsClient;

  beforeEach(() => {
    clearLocalAlbumsCache();
    mockLmsClient = createMockLmsClient();
    mockDiscogsClient = createMockDiscogsClient();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns a page of available albums with hasMore and totalCandidates", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Amerie - All I Have", year: 2002 },
      { title: "Zapp - Zapp II", year: 1982 },
      { title: "Madonna - The Immaculate Collection", year: 1990 },
    ]);
    mockLmsClient.searchTidalAlbums.mockImplementation(async (query) =>
      query === "Amerie All I Have"
        ? ok([{ name: "All I Have", coverArtUrl: "https://tidal.test/a.jpg" }])
        : ok([{ name: "Zapp II", coverArtUrl: "https://tidal.test/z.jpg" }]),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=happy-path&offset=0&limit=2",
    );

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.totalCandidates).toBe(3);
    expect(body.hasMore).toBe(true);
    expect(body.albums).toEqual([
      {
        artist: "Amerie",
        title: "All I Have",
        year: 2002,
        coverArtUrl: "https://tidal.test/a.jpg",
        source: "tidal",
      },
      {
        artist: "Zapp",
        title: "Zapp II",
        year: 1982,
        coverArtUrl: "https://tidal.test/z.jpg",
        source: "tidal",
      },
    ]);
  });

  it("reports hasMore false on the last page", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Amerie - All I Have", year: 2002 },
      { title: "Zapp - Zapp II", year: 1982 },
    ]);
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=last-page&offset=0&limit=2",
    );

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).hasMore).toBe(false);
  });

  it("queries LMS with '<artist> <title>' and a limit of 5", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Madonna - The Immaculate Collection", year: 1990 },
    ]);
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=tidal-query-shape&limit=1",
    );

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.searchTidalAlbums).toHaveBeenCalledWith(
      "Madonna The Immaculate Collection",
      5,
    );
  });

  it("resolves candidates one at a time, never more than one Tidal lookup in flight", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Artist One - Album One", year: 2001 },
      { title: "Artist Two - Album Two", year: 2002 },
      { title: "Artist Three - Album Three", year: 2003 },
      { title: "Artist Four - Album Four", year: 2004 },
    ]);
    let inFlight = 0;
    let maxInFlight = 0;
    mockLmsClient.searchTidalAlbums.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok([]);
    });
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=tidal-no-overlap&limit=4",
    );

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.searchTidalAlbums).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBe(1);
  });

  it("treats a candidate as unavailable on Tidal when its LMS lookup fails, keeping the others", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Artist One - Album One", year: 2001 },
      { title: "Artist Two - Album Two", year: 2002 },
      { title: "Artist Three - Album Three", year: 2003 },
    ]);
    mockLmsClient.searchTidalAlbums.mockImplementation(async (query) => {
      if (query === "Artist Two Album Two") {
        return err({ type: "NetworkError", message: "LMS hung" });
      }
      const name = query.split(" ").slice(2).join(" ");
      return ok([{ name, coverArtUrl: `https://tidal.test/${name}.jpg` }]);
    });
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=tidal-partial-failure&limit=10",
    );

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).albums).toEqual([
      {
        artist: "Artist One",
        title: "Album One",
        year: 2001,
        coverArtUrl: "https://tidal.test/Album One.jpg",
        source: "tidal",
      },
      {
        artist: "Artist Three",
        title: "Album Three",
        year: 2003,
        coverArtUrl: "https://tidal.test/Album Three.jpg",
        source: "tidal",
      },
    ]);
    expect(mockLmsClient.searchTidalAlbums).toHaveBeenCalledTimes(3);
  });

  it("returns different albums on the second page", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Artist A - Album A", year: 2001 },
      { title: "Artist B - Album B", year: 2002 },
      { title: "Artist C - Album C", year: 2003 },
      { title: "Artist D - Album D", year: 2004 },
    ]);
    mockLmsClient.searchTidalAlbums.mockImplementation(async (query) => {
      const name = query.split(" ").slice(2).join(" ");
      return ok([{ name, coverArtUrl: `https://tidal.test/${name}.jpg` }]);
    });
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const firstPage = await getAlbums(
      server,
      "tag=qsound&q=pagination&offset=0&limit=2",
    );
    const secondPage = await getAlbums(
      server,
      "tag=qsound&q=pagination&offset=2&limit=2",
    );

    const firstBody = parseAlbumsBody(firstPage.body);
    const secondBody = parseAlbumsBody(secondPage.body);

    expect(firstBody.albums.map(titleOf)).toEqual(["Album A", "Album B"]);
    expect(firstBody.hasMore).toBe(true);
    expect(secondBody.albums.map(titleOf)).toEqual(["Album C", "Album D"]);
    expect(secondBody.hasMore).toBe(false);
  });

  it("passes tag and text to Discogs as two separate coordinates", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Sting - The Soul Cages", year: 1991 },
    ]);
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=sacd&q=%20sting%20&offset=0&limit=1",
    );

    expect(response.statusCode).toBe(200);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledWith({
      tag: { id: "sacd", label: "SACD", mode: "format", term: "SACD" },
      text: "sting",
    });
  });

  it("omits the text coordinate entirely for a tag-only request", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Sting - The Soul Cages", year: 1991 },
    ]);
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=hdcd&offset=0&limit=1");

    expect(response.statusCode).toBe(200);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledWith({
      tag: { id: "hdcd", label: "HDCD", mode: "format", term: "HDCD" },
    });
  });

  it("rejects a request without tag", async () => {
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "q=sting&offset=0&limit=12");

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Invalid request",
      code: "INVALID_INPUT",
    });
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(0);
    expect(mockLmsClient.searchTidalAlbums).toHaveBeenCalledTimes(0);
  });

  it("rejects a tag id that is in no vocabulary entry", async () => {
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=not-a-tag&offset=0&limit=12");

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Invalid request",
      code: "INVALID_INPUT",
    });
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(0);
    expect(mockLmsClient.searchTidalAlbums).toHaveBeenCalledTimes(0);
  });

  it("rejects free text longer than 100 characters", async () => {
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, `tag=qsound&q=${"a".repeat(101)}`);

    expect(response.statusCode).toBe(400);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(0);
  });

  it("rejects a limit above the maximum of 15", async () => {
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=qsound&q=too-many&limit=50");

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Invalid request",
      code: "INVALID_INPUT",
    });
  });

  it("answers 503 when Discogs is unreachable", async () => {
    mockDiscogsClient.searchReleases.mockResolvedValue(
      err({ type: "NetworkError", message: "Discogs unreachable" }),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=qsound&q=discogs-down");

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      message: "Discogs unavailable",
      code: "DISCOGS_UNREACHABLE",
    });
    expect(mockLmsClient.searchTidalAlbums).toHaveBeenCalledTimes(0);
  });

  it("keeps the Tidal-available albums (200) when the bulk local albums fetch fails", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Artist One - Album One", year: 2001 },
      { title: "Artist Two - Album Two", year: 2002 },
    ]);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS hung" }),
    );
    mockLmsClient.searchTidalAlbums.mockImplementation(async (query) =>
      query === "Artist Two Album Two"
        ? ok([{ name: "Album Two", coverArtUrl: "https://tidal.test/two.jpg" }])
        : ok([]),
    );

    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=bulk-lms-error&limit=10",
    );

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).albums).toEqual([
      {
        artist: "Artist Two",
        title: "Album Two",
        year: 2002,
        coverArtUrl: "https://tidal.test/two.jpg",
        source: "tidal",
      },
    ]);
  });

  it("resolves local availability for the whole page with a single getLibraryAlbums call, not one per candidate", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Madonna - The Immaculate Collection", year: 1990 },
      { title: "Steely Dan - Aja", year: 1977 },
    ]);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({
        albums: [
          {
            id: 883,
            album: "The Immaculate Collection",
            artist: "Madonna",
            artwork_track_id: "1010",
          },
          {
            id: 42,
            album: "Aja",
            artist: "Steely Dan",
            artwork_track_id: "2020",
          },
        ],
        count: 2,
      }),
    );

    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=single-bulk-call&offset=0&limit=2",
    );

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).albums).toEqual([
      {
        artist: "Madonna",
        title: "The Immaculate Collection",
        year: 1990,
        coverArtUrl: "http://localhost:9000/music/1010/cover.jpg",
        source: "local",
        albumId: "883",
      },
      {
        artist: "Steely Dan",
        title: "Aja",
        year: 1977,
        coverArtUrl: "http://localhost:9000/music/2020/cover.jpg",
        source: "local",
        albumId: "42",
      },
    ]);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(1);
  });

  it("caches the Discogs candidate list across requests with different offsets", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Artist One - Album One", year: 2001 },
      { title: "Artist Two - Album Two", year: 2002 },
      { title: "Artist Three - Album Three", year: 2003 },
    ]);
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const first = await getAlbums(
      server,
      "tag=qsound&q=cache-proof&offset=0&limit=1",
    );
    const second = await getAlbums(
      server,
      "tag=qsound&q=cache-proof&offset=1&limit=1",
    );

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(1);
  });
});
