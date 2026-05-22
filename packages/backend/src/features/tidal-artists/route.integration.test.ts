import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createTidalArtistsRoute } from "./shell/route.js";
import { createLmsClient } from "../../adapters/lms-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  TidalSearchArtistRaw,
} from "../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getTidalArtistAlbums: ReturnType<
    typeof vi.fn<LmsClient["getTidalArtistAlbums"]>
  >;
  readonly searchTidalArtists: ReturnType<
    typeof vi.fn<LmsClient["searchTidalArtists"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getTidalArtistAlbums: vi
    .fn<LmsClient["getTidalArtistAlbums"]>()
    .mockResolvedValue(ok({ albums: [], count: 0 })),
  searchTidalArtists: vi
    .fn<LmsClient["searchTidalArtists"]>()
    .mockResolvedValue(ok({ artists: [], count: 0 })),
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

const parseArtistsBody = (
  body: string,
): {
  readonly artists: readonly unknown[];
  readonly totalCount: number;
} => {
  const parsed = parseJson(body);
  const artists =
    isRecord(parsed) && Array.isArray(parsed["artists"])
      ? parsed["artists"]
      : null;
  const totalCount =
    isRecord(parsed) && typeof parsed["totalCount"] === "number"
      ? parsed["totalCount"]
      : null;
  expect(artists).not.toBeNull();
  expect(totalCount).not.toBeNull();
  return { artists: artists ?? [], totalCount: totalCount ?? 0 };
};

const makeArtistSearchResult = (
  count: number = 2,
): {
  readonly artists: readonly TidalSearchArtistRaw[];
  readonly count: number;
} => ({
  // Story 8.9 AC3: LMS returns full format "7_{rawQuery}_{urlEncodedName}.2.{idx}"
  artists: Array.from({ length: count }, (_, i) => ({
    id: `7_sabrina carpenter_sabrina%20carpenter.2.${i}`,
    name: i === 0 ? "Sabrina Carpenter" : `Sabrina Carpenter ${i}`,
    image: `/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc${i}%2F320x320.jpg/image.jpg`,
    type: "outline",
    isaudio: 0,
  })),
  count,
});

describe("GET /api/tidal/artists/search", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalArtistsRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  // AC2: returns 200 with artists array on success
  it("returns 200 with artists array and totalCount on success", async () => {
    mockLmsClient.searchTidalArtists.mockResolvedValue(
      ok(makeArtistSearchResult(2)),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=Sabrina+Carpenter",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistsBody(response.body);
    expect(body.artists).toHaveLength(2);
    expect(body.totalCount).toBe(2);
  });

  // AC2 + Story 8.9 AC3: artist domain fields mapped; ID normalized from LMS raw format
  it("maps artist domain fields (artistId, name, coverArtUrl) correctly", async () => {
    mockLmsClient.searchTidalArtists.mockResolvedValue(
      ok({
        artists: [
          {
            // LMS returns full format — normalized to "7_sabrina carpenter.2.0" in service
            id: "7_sabrina carpenter_sabrina%20carpenter.2.0",
            name: "Sabrina Carpenter",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc%2F320x320.jpg/image.jpg",
            type: "outline",
            isaudio: 0,
          },
        ],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=Sabrina+Carpenter",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistsBody(response.body);
    const artist = body.artists[0];
    // Normalized: encoded-name suffix stripped
    expect(isRecord(artist) ? artist["artistId"] : undefined).toBe(
      "7_sabrina carpenter.2.0",
    );
    expect(isRecord(artist) ? artist["name"] : undefined).toBe(
      "Sabrina Carpenter",
    );
    expect(isRecord(artist) ? artist["coverArtUrl"] : undefined).toContain(
      "/imageproxy/http%3A%2F%2Fresources.tidal.com",
    );
  });

  // AC2: artist without image → empty string coverArtUrl
  it("returns empty string coverArtUrl when artist has no image", async () => {
    mockLmsClient.searchTidalArtists.mockResolvedValue(
      ok({
        artists: [{ id: "7_test_test.2.0", name: "Test Artist" }],
        count: 1,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=test",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistsBody(response.body);
    const artist = body.artists[0];
    expect(isRecord(artist) ? artist["coverArtUrl"] : undefined).toBe("");
  });

  // LMS error → 503
  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.searchTidalArtists.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=Sabrina+Carpenter",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  // Empty results → 200 with empty array
  it("returns empty artists array with 0 totalCount when no results found", async () => {
    mockLmsClient.searchTidalArtists.mockResolvedValue(
      ok({ artists: [], count: 0 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=unknownartist",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistsBody(response.body);
    expect(body.artists).toHaveLength(0);
    expect(body.totalCount).toBe(0);
  });

  // Passes query to LMS client correctly
  it("passes query to lmsClient.searchTidalArtists with offset=0 and limit=10", async () => {
    mockLmsClient.searchTidalArtists.mockResolvedValue(
      ok(makeArtistSearchResult(0)),
    );

    await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=Pink+Floyd",
    });

    expect(mockLmsClient.searchTidalArtists).toHaveBeenCalledWith(
      "Pink Floyd",
      0,
      10,
    );
  });

  // Validation: missing q → 400
  it("returns 400 when q parameter is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  // Validation: empty q → 400
  it("returns 400 when q parameter is empty string", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tidal/artists/search?q=",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });
});
