import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createTidalAlbumsRoute } from "./shell/route.js";
import type { LmsClient, LmsConfig } from "../../adapters/lms-client/index.js";
import { createLmsClient } from "../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getTidalAlbums: ReturnType<
    typeof vi.fn<LmsClient["getTidalAlbums"]>
  >;
  readonly getTidalAlbumTracks: ReturnType<
    typeof vi.fn<LmsClient["getTidalAlbumTracks"]>
  >;
  readonly findTidalSearchAlbumId: ReturnType<
    typeof vi.fn<LmsClient["findTidalSearchAlbumId"]>
  >;
  readonly getTidalFeaturedAlbums: ReturnType<
    typeof vi.fn<LmsClient["getTidalFeaturedAlbums"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getTidalAlbums: vi
    .fn<LmsClient["getTidalAlbums"]>()
    .mockResolvedValue(ok({ albums: [], count: 0 })),
  getTidalAlbumTracks: vi
    .fn<LmsClient["getTidalAlbumTracks"]>()
    .mockResolvedValue(ok({ tracks: [], count: 0 })),
  findTidalSearchAlbumId: vi
    .fn<LmsClient["findTidalSearchAlbumId"]>()
    .mockResolvedValue(ok(null)),
  getTidalFeaturedAlbums: vi
    .fn<LmsClient["getTidalFeaturedAlbums"]>()
    .mockResolvedValue(ok({ albums: [], count: 0 })),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const parseCodeBody = (body: string): { readonly code: string } => {
  const parsed = parseJson(body);
  const code =
    isRecord(parsed) && typeof parsed["code"] === "string"
      ? parsed["code"]
      : null;
  expect(code).not.toBeNull();
  return { code: code ?? "" };
};

const parseAlbumsBody = (
  body: string,
): {
  readonly albums: readonly unknown[];
  readonly totalCount: number;
} => {
  const parsed = parseJson(body);
  const albums =
    isRecord(parsed) && Array.isArray(parsed["albums"])
      ? parsed["albums"]
      : null;
  const totalCount =
    isRecord(parsed) && typeof parsed["totalCount"] === "number"
      ? parsed["totalCount"]
      : null;
  expect(albums).not.toBeNull();
  expect(totalCount).not.toBeNull();
  return { albums: albums ?? [], totalCount: totalCount ?? 0 };
};

const parseTracksBody = (
  body: string,
): {
  readonly tracks: readonly unknown[];
  readonly totalCount: number;
} => {
  const parsed = parseJson(body);
  const tracks =
    isRecord(parsed) && Array.isArray(parsed["tracks"])
      ? parsed["tracks"]
      : null;
  const totalCount =
    isRecord(parsed) && typeof parsed["totalCount"] === "number"
      ? parsed["totalCount"]
      : null;
  expect(tracks).not.toBeNull();
  expect(totalCount).not.toBeNull();
  return { tracks: tracks ?? [], totalCount: totalCount ?? 0 };
};

const parseAlbumIdBody = (
  body: string,
): { readonly albumId: string | null } => {
  const parsed = parseJson(body);
  const albumId =
    isRecord(parsed) &&
    (typeof parsed["albumId"] === "string" || parsed["albumId"] === null)
      ? parsed["albumId"]
      : null;
  return { albumId };
};

// Live-probe 2026-03-15: LMS format confirmed — name = "{title} - {artist}", image = relative path
const makeTidalResult = (
  count: number = 2,
): {
  readonly albums: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly type: string;
    readonly isaudio: number;
    readonly hasitems: number;
  }>;
  readonly count: number;
} => ({
  albums: Array.from({ length: count }, (_, i) => ({
    id: `4.${i}`,
    name: `Album ${i + 1} - Artist ${i + 1}`,
    image: `/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc${i}%2F1280x1280.jpg/image.jpg`,
    type: "playlist",
    isaudio: 1,
    hasitems: 1,
  })),
  count,
});

describe("GET /api/tidal/albums", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalAlbumsRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with albums array and totalCount on success", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(ok(makeTidalResult(3)));

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.albums).toHaveLength(3);
    expect(body.totalCount).toBe(3);
  });

  it("maps album domain fields (id, title, artist, coverArtUrl) correctly in HTTP response body", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(
      ok({
        albums: [
          {
            id: "4.0",
            name: "Monica - Jack Harlow",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F72a8c00c%2F842c%2F48b1%2F80f1%2F87b9038f0104%2F1280x1280.jpg/image.jpg",
            type: "playlist",
            isaudio: 1,
            hasitems: 1,
          },
        ],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    const album = body.albums[0];
    expect(isRecord(album)).toBe(true);
    expect(isRecord(album) ? album["id"] : undefined).toBe("4.0");
    expect(isRecord(album) ? album["title"] : undefined).toBe("Monica");
    expect(isRecord(album) ? album["artist"] : undefined).toBe("Jack Harlow");
    expect(isRecord(album) ? album["coverArtUrl"] : undefined).toContain(
      "/imageproxy/http%3A%2F%2Fresources.tidal.com",
    );
    expect(body.totalCount).toBe(1);
  });

  it("returns empty string coverArtUrl when album has no image field", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(
      ok({
        albums: [
          {
            id: "4.0",
            name: "Unknown Album - Unknown Artist",
            type: "playlist",
            isaudio: 1,
            hasitems: 1,
          },
        ],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    const album = body.albums[0];
    expect(isRecord(album) ? album["coverArtUrl"] : undefined).toBe("");
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("returns empty albums array with 0 totalCount when Tidal returns no albums", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(
      ok({ albums: [], count: 0 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.albums).toHaveLength(0);
    expect(body.totalCount).toBe(0);
  });

  it("uses default limit=250 and offset=0 when no query params given", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(ok(makeTidalResult(0)));

    await server.inject({ method: "GET", url: "/api/tidal/albums" });

    expect(mockLmsClient.getTidalAlbums).toHaveBeenCalledWith(0, 250);
  });

  it("passes limit and offset from query params to client", async () => {
    mockLmsClient.getTidalAlbums.mockResolvedValue(ok(makeTidalResult(0)));

    await server.inject({
      method: "GET",
      url: "/api/tidal/albums?limit=50&offset=100",
    });

    expect(mockLmsClient.getTidalAlbums).toHaveBeenCalledWith(100, 50);
  });

  it("returns 400 when limit is 0", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums?limit=0",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when limit exceeds 500", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums?limit=501",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when offset is negative", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums?offset=-1",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });
});

// Live-probe 2026-03-15: browsing item_id:{albumId} returns tracks of that album
const makeTidalTracksResult = (
  count: number = 3,
): {
  readonly tracks: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly duration: number;
    readonly type: string;
    readonly isaudio: number;
  }>;
  readonly count: number;
} => ({
  tracks: Array.from({ length: count }, (_, i) => ({
    id: `4.0.${i}`,
    name: `Track ${i + 1}`,
    url: `tidal://${1000000 + i}.flc`,
    duration: 240 + i * 10,
    type: "audio",
    isaudio: 1,
  })),
  count,
});

describe("GET /api/tidal/albums/:albumId/tracks", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalAlbumsRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with tracks array and totalCount on success", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      ok(makeTidalTracksResult(3)),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/4.0/tracks",
    });

    expect(response.statusCode).toBe(200);
    const body = parseTracksBody(response.body);
    expect(body.tracks).toHaveLength(3);
    expect(body.totalCount).toBe(3);
  });

  it("maps track fields (id, trackNumber, title, url, duration) correctly", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      ok({
        tracks: [
          {
            id: "4.0.0",
            name: "Creep",
            url: "tidal://58990486.flc",
            duration: 238,
            type: "audio",
            isaudio: 1,
          },
        ],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/4.0/tracks",
    });

    expect(response.statusCode).toBe(200);
    const body = parseTracksBody(response.body);
    const track = body.tracks[0];
    expect(isRecord(track) ? track["id"] : undefined).toBe("4.0.0");
    expect(isRecord(track) ? track["trackNumber"] : undefined).toBe(1);
    expect(isRecord(track) ? track["title"] : undefined).toBe("Creep");
    expect(isRecord(track) ? track["url"] : undefined).toBe(
      "tidal://58990486.flc",
    );
    expect(isRecord(track) ? track["duration"] : undefined).toBe(238);
  });

  it("passes albumId from URL path to lmsClient.getTidalAlbumTracks", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      ok(makeTidalTracksResult(0)),
    );

    await server.inject({
      method: "GET",
      url: "/api/tidal/albums/4.7/tracks",
    });

    expect(mockLmsClient.getTidalAlbumTracks).toHaveBeenCalledWith(
      "4.7",
      0,
      999,
    );
  });

  it("AC2: handles artist-browse albumId '6.0.1.0' format correctly", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      ok(makeTidalTracksResult(2)),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/6.0.1.0/tracks",
    });

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.getTidalAlbumTracks).toHaveBeenCalledWith(
      "6.0.1.0",
      0,
      999,
    );
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/4.0/tracks",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("returns empty tracks array when album has no audio tracks", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      ok({ tracks: [], count: 0 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/4.0/tracks",
    });

    expect(response.statusCode).toBe(200);
    const body = parseTracksBody(response.body);
    expect(body.tracks).toHaveLength(0);
    expect(body.totalCount).toBe(0);
  });
});

// Story 9.14: GET /api/tidal/albums/resolve — resolve Tidal search album to browse ID
describe("GET /api/tidal/albums/resolve", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalAlbumsRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("AC3: returns 200 with albumId when browse resolution succeeds", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(ok("4.123456"));

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/resolve?title=OK+Computer&artist=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumIdBody(response.body);
    expect(body.albumId).toBe("4.123456");
  });

  it("AC4: returns 200 with albumId null when browse resolution finds no match", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(ok(null));

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/resolve?title=Unknown+Album&artist=Unknown+Artist",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumIdBody(response.body);
    expect(body.albumId).toBeNull();
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/resolve?title=OK+Computer&artist=Radiohead",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("returns 400 when title query param is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/resolve?artist=Radiohead",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when artist query param is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/albums/resolve?title=OK+Computer",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("passes title and artist from query params to findTidalSearchAlbumId", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(ok(null));

    await server.inject({
      method: "GET",
      url: "/api/tidal/albums/resolve?title=OK+Computer&artist=Radiohead",
    });

    expect(mockLmsClient.findTidalSearchAlbumId).toHaveBeenCalledWith(
      "OK Computer",
      "Radiohead",
    );
  });
});

// Story 8.9 AC2: Featured Tidal albums (item_id:1.0.1 = Featured → Neu → Alben)
const makeFeaturedResult = (
  count: number = 3,
): ReturnType<typeof makeTidalResult> => ({
  albums: Array.from({ length: count }, (_, i) => ({
    id: `1.0.1.${i}`,
    name: `Featured Album ${i + 1} - Artist ${i + 1}`,
    image: `/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc${i}%2F1280x1280.jpg/image.jpg`,
    type: "playlist",
    isaudio: 1,
    hasitems: 1,
  })),
  count,
});

describe("GET /api/tidal/featured-albums", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalAlbumsRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("AC2: returns 200 with albums array and totalCount on success", async () => {
    mockLmsClient.getTidalFeaturedAlbums.mockResolvedValue(
      ok(makeFeaturedResult(3)),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/featured-albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.albums).toHaveLength(3);
    expect(body.totalCount).toBe(3);
  });

  it("AC2: maps album fields (splits 'Title - Artist' name format)", async () => {
    mockLmsClient.getTidalFeaturedAlbums.mockResolvedValue(
      ok({
        albums: [
          {
            id: "1.0.1.0",
            name: "Monica - Jack Harlow",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc%2F1280x1280.jpg/image.jpg",
          },
        ],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/featured-albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    const album = body.albums[0];
    expect(isRecord(album) ? album["id"] : undefined).toBe("1.0.1.0");
    expect(isRecord(album) ? album["title"] : undefined).toBe("Monica");
    expect(isRecord(album) ? album["artist"] : undefined).toBe("Jack Harlow");
    expect(isRecord(album) ? album["coverArtUrl"] : undefined).toContain(
      "/imageproxy/http%3A%2F%2Fresources.tidal.com",
    );
  });

  it("AC2: returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getTidalFeaturedAlbums.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/featured-albums",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });
});
