import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { ok } from "@signalform/shared";
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

const parseAlbumsBody = (body: string): AlbumsBody => {
  const parsed = JSON.parse(body) as unknown;
  expect(isRecord(parsed)).toBe(true);
  if (!isRecord(parsed)) {
    return { albums: [], hasMore: false, totalCandidates: 0 };
  }

  return {
    albums: Array.isArray(parsed["albums"])
      ? parsed["albums"].filter(isRecord)
      : [],
    hasMore: parsed["hasMore"] === true,
    totalCandidates:
      typeof parsed["totalCandidates"] === "number"
        ? parsed["totalCandidates"]
        : 0,
  };
};

const titleOf = (album: Record<string, unknown>): string =>
  typeof album["title"] === "string" ? album["title"] : "";

describe("GET /api/tags/discogs/albums — availability and cover source", () => {
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

  it("returns a local-only candidate with the artwork_track_id cover and its albumId", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Madonna - The Immaculate Collection", year: 1990 },
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
        ],
        count: 1,
      }),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=qsound&q=local-only&limit=1");

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
    ]);
  });

  it("returns a Tidal-only candidate with the Tidal cover and without an albumId", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Sting - The Soul Cages", year: 1991 },
    ]);
    mockLmsClient.searchTidalAlbums.mockResolvedValue(
      ok([
        {
          name: "The Soul Cages",
          coverArtUrl: "https://tidal.test/soul-cages.jpg",
        },
      ]),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=qsound&q=tidal-only&limit=1");

    expect(response.statusCode).toBe(200);
    const album = parseAlbumsBody(response.body).albums[0] ?? {};
    expect(album).toEqual({
      artist: "Sting",
      title: "The Soul Cages",
      year: 1991,
      coverArtUrl: "https://tidal.test/soul-cages.jpg",
      source: "tidal",
    });
    expect("albumId" in album).toBe(false);
  });

  it("prefers the local source when a candidate is available both locally and on Tidal", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Steely Dan - Aja", year: 1977 },
    ]);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({
        albums: [
          {
            id: 42,
            album: "Aja",
            artist: "Steely Dan",
            artwork_track_id: "20",
          },
        ],
        count: 1,
      }),
    );
    mockLmsClient.searchTidalAlbums.mockResolvedValue(
      ok([{ name: "Aja", coverArtUrl: "https://tidal.test/aja.jpg" }]),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(server, "tag=qsound&q=local-wins&limit=1");

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).albums).toEqual([
      {
        artist: "Steely Dan",
        title: "Aja",
        year: 1977,
        coverArtUrl: "http://localhost:9000/music/20/cover.jpg",
        source: "local",
        albumId: "42",
      },
    ]);
  });

  it("falls back to the album_id cover URL when the local match has no artwork_track_id", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Madonna - The Immaculate Collection", year: 1990 },
    ]);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({
        albums: [
          { id: 883, album: "The Immaculate Collection", artist: "Madonna" },
        ],
        count: 1,
      }),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=no-artwork-track-id&limit=1",
    );

    expect(response.statusCode).toBe(200);
    const album = parseAlbumsBody(response.body).albums[0] ?? {};
    expect(album["coverArtUrl"]).toBe(
      "http://localhost:9000/music/0/cover.jpg?album_id=883",
    );
    expect(album["source"]).toBe("local");
  });

  it("drops candidates that are available neither locally nor on Tidal", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Test Artist - Nowhere Album", year: 2000 },
      { title: "Kraftwerk - Autobahn", year: 1974 },
      { title: "Other Artist - Also Nowhere", year: 2005 },
    ]);
    mockLmsClient.searchTidalAlbums.mockImplementation(async (query) =>
      query === "Kraftwerk Autobahn"
        ? ok([
            {
              name: "Autobahn",
              coverArtUrl: "https://tidal.test/autobahn.jpg",
            },
          ])
        : ok([{ name: "Something Else", coverArtUrl: "https://tidal.test/x" }]),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=unavailable&limit=10",
    );

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).albums).toEqual([
      {
        artist: "Kraftwerk",
        title: "Autobahn",
        year: 1974,
        coverArtUrl: "https://tidal.test/autobahn.jpg",
        source: "tidal",
      },
    ]);
  });

  it("drops a Tidal match that carries no cover art", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      {
        title: "Sting - The Soul Cages",
        year: 1991,
        coverImageUrl: "https://discogs.test/soul-cages.jpg",
      },
    ]);
    mockLmsClient.searchTidalAlbums.mockResolvedValue(
      ok([{ name: "The Soul Cages" }]),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=tidal-no-cover&limit=1",
    );

    expect(response.statusCode).toBe(200);
    expect(parseAlbumsBody(response.body).albums).toEqual([]);
  });

  it("keeps hasMore and totalCandidates on the candidate list when most of a page is filtered out", async () => {
    givenDiscogsReturns(mockDiscogsClient, [
      { title: "Artist One - Album One", year: 2001 },
      { title: "Artist Two - Album Two", year: 2002 },
      { title: "Artist Three - Album Three", year: 2003 },
      { title: "Artist Four - Album Four", year: 2004 },
    ]);
    mockLmsClient.searchTidalAlbums.mockImplementation(async (query) =>
      query === "Artist Two Album Two"
        ? ok([{ name: "Album Two", coverArtUrl: "https://tidal.test/two.jpg" }])
        : ok([]),
    );
    server = await startServer(mockLmsClient, mockDiscogsClient);

    const response = await getAlbums(
      server,
      "tag=qsound&q=mostly-filtered&limit=3",
    );

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.albums).toHaveLength(1);
    expect(body.albums.map(titleOf)).toEqual(["Album Two"]);
    expect(body.totalCandidates).toBe(4);
    expect(body.hasMore).toBe(true);
  });
});
