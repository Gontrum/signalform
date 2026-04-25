import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createLibraryRoute } from "./route.js";
import { clearLibraryCache } from "./service.js";
import {
  createLmsClient,
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
};

type AlbumsBody = {
  readonly albums: readonly unknown[];
  readonly totalCount: number;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getLibraryAlbums: vi
    .fn<LmsClient["getLibraryAlbums"]>()
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

const parseAlbumsBody = (body: string): AlbumsBody => {
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

const makeLibraryResult = (
  count: number = 2,
): {
  readonly albums: ReadonlyArray<{
    readonly id: number;
    readonly album: string;
    readonly artist: string;
    readonly year: number;
    readonly artwork_track_id: string;
  }>;
  readonly count: number;
} => ({
  albums: Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    album: `Album ${i + 1}`,
    artist: "Test Artist",
    year: 2020,
    artwork_track_id: `art${i}`,
  })),
  count,
});

describe("GET /api/library/albums", () => {
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

  it("returns 200 with albums and totalCount on success", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(ok(makeLibraryResult(2)));

    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.albums).toHaveLength(2);
    expect(body.totalCount).toBe(2);
  });

  it("uses default limit=250 and offset=0 when no query params given", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(ok(makeLibraryResult(0)));

    await server.inject({
      method: "GET",
      url: "/api/library/albums",
    });

    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(0, 250);
  });

  it("passes limit and offset from query params to service", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(ok(makeLibraryResult(0)));

    await server.inject({
      method: "GET",
      url: "/api/library/albums?limit=50&offset=100",
    });

    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledWith(100, 50);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("returns 400 when limit is 0", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums?limit=0",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when limit exceeds 999", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums?limit=1000",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when offset is negative", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums?offset=-1",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("maps album domain fields correctly in HTTP response body", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({
        albums: [
          {
            id: 42,
            album: "The Wall",
            artist: "Pink Floyd",
            year: 1979,
            artwork_track_id: "abc123",
          },
        ],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.totalCount).toBe(1);
    const album = body.albums[0];
    expect(isRecord(album) ? album["id"] : undefined).toBe("42");
    expect(isRecord(album) ? album["title"] : undefined).toBe("The Wall");
    expect(isRecord(album) ? album["artist"] : undefined).toBe("Pink Floyd");
    expect(isRecord(album) ? album["releaseYear"] : undefined).toBe(1979);
    expect(isRecord(album) ? album["coverArtUrl"] : undefined).toContain(
      "abc123",
    );
    expect(isRecord(album) ? album["genre"] : undefined).toBeNull();
  });

  it("returns 400 when limit is a non-integer float", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums?limit=1.5",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns empty albums array with 0 totalCount for empty library", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(
      ok({ albums: [], count: 0 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/library/albums",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumsBody(response.body);
    expect(body.albums).toHaveLength(0);
    expect(body.totalCount).toBe(0);
  });
});
