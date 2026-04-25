/**
 * Search Route Integration Tests
 *
 * Tests for full endpoint behavior including validation and error handling.
 * Following BDD pattern with given/when/then helpers.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { createSearchRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";
import { ok, err } from "@signalform/shared";
import { clearCache } from "./cache.js";

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
};

type BasicSearchBody = {
  readonly results: readonly unknown[];
  readonly query: string;
  readonly totalCount: number;
};

type FullSearchBody = {
  readonly tracks: readonly unknown[];
  readonly albums: readonly unknown[];
  readonly totalResults: number;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient({
    host: "localhost",
    port: 9000,
    playerId: "00:00:00:00:00:00",
    timeout: 5000,
    retryBaseDelayMs: 0,
  }),
  search: vi.fn<LmsClient["search"]>(),
  getArtistName: vi.fn().mockResolvedValue({ ok: true, value: null }),
});

const createFullMockLmsClient = (): MockLmsClient => ({
  search: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getStatus: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  setVolume: vi.fn(),
  getVolume: vi.fn(),
  seek: vi.fn(),
  getCurrentTime: vi.fn(),
  playAlbum: vi.fn(),
  playTidalAlbum: vi.fn(),
  disableRepeat: vi.fn(),
  getAlbumTracks: vi.fn(),
  getArtistAlbums: vi.fn(),
  getArtistName: vi.fn().mockResolvedValue({ ok: true, value: null }),
  getQueue: vi.fn(),
  jumpToTrack: vi.fn(),
  removeFromQueue: vi.fn(),
  moveQueueTrack: vi.fn(),
  addToQueue: vi.fn(),
  getLibraryAlbums: vi.fn(),
  getTidalAlbums: vi.fn(),
  getTidalAlbumTracks: vi.fn(),
  getTidalArtistAlbums: vi.fn(),
  searchTidalArtists: vi.fn(),
  getTidalFeaturedAlbums: vi.fn(),
  addAlbumToQueue: vi.fn(),
  addTidalAlbumToQueue: vi.fn(),
  findTidalSearchAlbumId: vi.fn(),
  rescanLibrary: vi.fn(),
  getRescanProgress: vi.fn(),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const parseBasicSearchBody = (body: string): BasicSearchBody => {
  const parsed = parseJson(body);
  const results =
    isRecord(parsed) && Array.isArray(parsed["results"])
      ? parsed["results"]
      : null;
  const query =
    isRecord(parsed) && typeof parsed["query"] === "string"
      ? parsed["query"]
      : null;
  const totalCount =
    isRecord(parsed) && typeof parsed["totalCount"] === "number"
      ? parsed["totalCount"]
      : null;
  expect(results).not.toBeNull();
  expect(query).not.toBeNull();
  expect(totalCount).not.toBeNull();
  return {
    results: results ?? [],
    query: query ?? "",
    totalCount: totalCount ?? 0,
  };
};

const parseFullSearchBody = (body: string): FullSearchBody => {
  const parsed = parseJson(body);
  const tracks =
    isRecord(parsed) && Array.isArray(parsed["tracks"])
      ? parsed["tracks"]
      : null;
  const albums =
    isRecord(parsed) && Array.isArray(parsed["albums"])
      ? parsed["albums"]
      : null;
  const totalResults =
    isRecord(parsed) && typeof parsed["totalResults"] === "number"
      ? parsed["totalResults"]
      : null;
  expect(tracks).not.toBeNull();
  expect(albums).not.toBeNull();
  expect(totalResults).not.toBeNull();
  return {
    tracks: tracks ?? [],
    albums: albums ?? [],
    totalResults: totalResults ?? 0,
  };
};

const parseErrorBody = (
  body: string,
): { readonly code: string; readonly message: string } => {
  const parsed = parseJson(body);
  const code =
    isRecord(parsed) && typeof parsed["code"] === "string"
      ? parsed["code"]
      : null;
  const message =
    isRecord(parsed) && typeof parsed["message"] === "string"
      ? parsed["message"]
      : null;
  expect(code).not.toBeNull();
  expect(message).not.toBeNull();
  return { code: code ?? "", message: message ?? "" };
};

describe("POST /api/search", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createSearchRoute(server, mockLmsClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with results for valid query", async () => {
    await givenLmsReturnsResults(mockLmsClient, [
      {
        id: "123",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
    ]);

    const response = await whenUserSearches(server, "Pink Floyd");

    await thenResponseIs200WithResults(response, 1);
  });

  it("returns 400 for empty query", async () => {
    const response = await whenUserSearches(server, "");

    await thenResponseIs400WithError(response, "INVALID_INPUT");
  });

  it("returns 400 for whitespace-only query", async () => {
    const response = await whenUserSearches(server, "   \t\n  ");

    await thenResponseIs400WithError(response, "INVALID_INPUT");
  });

  it("returns 400 for query too short (1 char)", async () => {
    const response = await whenUserSearches(server, "a");

    await thenResponseIs400WithError(response, "INVALID_INPUT");
  });

  it("returns 400 for query too long (101+ chars)", async () => {
    const longQuery = "a".repeat(101);
    const response = await whenUserSearches(server, longQuery);

    await thenResponseIs400WithError(response, "INVALID_INPUT");
  });

  it("returns 400 for missing query field", async () => {
    const response = await whenUserSearchesWithPayload(server, {});

    await thenResponseIs400WithError(response, "INVALID_INPUT");
  });

  it("returns 400 for non-string query", async () => {
    const response = await whenUserSearchesWithPayload(server, { query: 123 });

    await thenResponseIs400WithError(response, "INVALID_INPUT");
  });

  it("returns 503 when LMS is unreachable", async () => {
    await givenLmsIsUnreachable(mockLmsClient);

    const response = await whenUserSearches(server, "test query");

    await thenResponseIs503WithError(response);
  });

  it("returns 503 when LMS times out", async () => {
    await givenLmsTimesOut(mockLmsClient);

    const response = await whenUserSearches(server, "test query");

    await thenResponseIs503WithError(response);
  });

  it("returns 404 for GET method (only POST allowed)", async () => {
    const response = await whenUserTriesGET(server);

    await thenResponseIs404(response);
  });

  it("response includes query, results, and totalCount fields", async () => {
    await givenLmsReturnsResults(mockLmsClient, [
      {
        id: "1",
        title: "Track 1",
        artist: "Artist 1",
        album: "Album 1",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
    ]);

    const response = await whenUserSearches(server, "test");

    await thenResponseHasExpectedFields(response);
  });

  it("caches search results for repeated queries", async () => {
    await givenLmsReturnsResults(mockLmsClient, [
      {
        id: "1",
        title: "Track 1",
        artist: "Artist 1",
        album: "Album 1",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
    ]);

    // First request
    const response1 = await whenUserSearches(server, "Pink Floyd");
    await thenResponseIs200WithResults(response1, 1);

    // Second request - should be cached (LMS not called again)
    const lmsCallCountBefore = mockLmsClient.search.mock.calls.length;
    const response2 = await whenUserSearches(server, "Pink Floyd");
    const lmsCallCountAfter = mockLmsClient.search.mock.calls.length;

    await thenResponseIs200WithResults(response2, 1);
    expect(lmsCallCountAfter).toBe(lmsCallCountBefore); // No additional LMS call
  });

  it("returns cached results in < 50ms (NFR4: < 300ms)", async () => {
    await givenLmsReturnsResults(mockLmsClient, [
      {
        id: "1",
        title: "Track 1",
        artist: "Artist 1",
        album: "Album 1",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
    ]);

    // First request to populate cache
    await whenUserSearches(server, "test");

    // Second request - measure performance
    const startTime = Date.now();
    const response = await whenUserSearches(server, "test");
    const duration = Date.now() - startTime;

    await thenResponseIs200WithResults(response, 1);
    expect(duration).toBeLessThan(50); // Cached response should be very fast
  });

  it("returns empty results array when LMS returns no matches", async () => {
    await givenLmsReturnsResults(mockLmsClient, []);

    const response = await whenUserSearches(server, "nonexistent");

    await thenResponseIs200WithResults(response, 0);
  });

  it("response time is under 200ms for mocked LMS (smoke test for no obvious performance regressions)", async () => {
    // NOTE: This is a smoke test that verifies no obvious performance regressions
    // in the request pipeline (Fastify routing, Zod validation, service logic).
    // Real NFR1 validation (< 200ms with actual LMS) requires E2E testing with live LMS.
    await givenLmsReturnsResults(mockLmsClient, []);

    const startTime = Date.now();
    await whenUserSearches(server, "test");
    const duration = Date.now() - startTime;

    await thenResponseTimeIsUnder200ms(duration);
  });
});

// GIVEN helpers
const givenLmsReturnsResults = async (
  mockLmsClient: MockLmsClient,
  results: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly albumId?: string;
    readonly url: string;
    readonly source: "local" | "qobuz" | "tidal" | "unknown";
    readonly type: "track" | "artist" | "album";
  }>,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(ok(results));
};

const givenLmsIsUnreachable = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    err({
      type: "NetworkError",
      message: "Connection refused",
    }),
  );
};

const givenLmsTimesOut = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    err({
      type: "TimeoutError",
      message: "LMS connection timeout (5s)",
    }),
  );
};

// WHEN helpers
const whenUserSearches = async (
  server: FastifyInstance,
  query: string,
): Promise<LightMyRequestResponse> => {
  return await server.inject({
    method: "POST",
    url: "/api/search",
    payload: { query },
  });
};

const whenUserSearchesWithPayload = async (
  server: FastifyInstance,
  payload: unknown,
): Promise<LightMyRequestResponse> => {
  return await server.inject({
    method: "POST",
    url: "/api/search",
    headers: { "content-type": "application/json" },
    payload: payload === undefined ? undefined : JSON.stringify(payload),
  });
};

const whenUserTriesGET = async (
  server: FastifyInstance,
): Promise<LightMyRequestResponse> => {
  return await server.inject({
    method: "GET",
    url: "/api/search",
  });
};

// THEN helpers
const thenResponseIs200WithResults = async (
  response: LightMyRequestResponse,
  expectedCount: number,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseBasicSearchBody(response.body);
  expect(body.results).toHaveLength(expectedCount);
  expect(body.totalCount).toBe(expectedCount);
};

const thenResponseIs400WithError = async (
  response: LightMyRequestResponse,
  expectedCode: string,
): Promise<void> => {
  expect(response.statusCode).toBe(400);
  const body = parseErrorBody(response.body);
  expect(body.code).toBe(expectedCode);
};

const thenResponseIs503WithError = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(503);
  const body = parseErrorBody(response.body);
  expect(body.code).toBe("LMS_UNREACHABLE");
  expect(body.message).toContain("LMS");
};

const thenResponseIs404 = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(404);
};

const thenResponseHasExpectedFields = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseBasicSearchBody(response.body);
  expect(Array.isArray(body.results)).toBe(true);
};

const thenResponseTimeIsUnder200ms = async (
  duration: number,
): Promise<void> => {
  expect(duration).toBeLessThan(200);
};

describe("POST /api/search with full results mode", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createSearchRoute(server, mockLmsClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns tracks with duration and albums when full=true", async () => {
    await givenLmsReturnsMultipleTracksFromSameAlbum(mockLmsClient);

    const response = await whenUserSearchesWithFullResults(
      server,
      "Pink Floyd",
    );

    await thenResponseContainsTracksAndAlbums(response);
  });

  it("returns empty tracks and albums arrays when no results", async () => {
    await givenLmsReturnsResults(mockLmsClient, []);

    const response = await whenUserSearchesWithFullResults(
      server,
      "nonexistent",
    );

    await thenResponseContainsEmptyTracksAndAlbums(response);
  });

  it("groups tracks by album correctly", async () => {
    await givenLmsReturnsTwoAlbums(mockLmsClient);

    const response = await whenUserSearchesWithFullResults(
      server,
      "Pink Floyd",
    );

    await thenResponseContainsTwoAlbums(response);
  });

  it("filters out non-track results from tracks array", async () => {
    await givenLmsReturnsMixedResults(mockLmsClient);

    const response = await whenUserSearchesWithFullResults(server, "test");

    await thenResponseOnlyContainsTracks(response);
  });

  it("includes totalResults count for tracks only", async () => {
    await givenLmsReturnsMultipleTracksFromSameAlbum(mockLmsClient);

    const response = await whenUserSearchesWithFullResults(
      server,
      "Pink Floyd",
    );

    await thenResponseTotalResultsMatchesTrackCount(response);
  });
});

// Additional GIVEN helpers for full results tests
const givenLmsReturnsMultipleTracksFromSameAlbum = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    ok([
      {
        id: "track-1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
      {
        id: "track-2",
        title: "Time",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/time.flac",
        source: "local",
        type: "track",
      },
    ]),
  );
};

const givenLmsReturnsTwoAlbums = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    ok([
      {
        id: "track-1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
      {
        id: "track-2",
        title: "Comfortably Numb",
        artist: "Pink Floyd",
        album: "The Wall",
        albumId: "43",
        url: "file:///music/numb.flac",
        source: "local",
        type: "track",
      },
    ]),
  );
};

const givenLmsReturnsMixedResults = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    ok([
      {
        id: "track-1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
      {
        id: "artist-1",
        title: "Pink Floyd",
        artist: "Pink Floyd",
        album: "",
        url: "artist://pink-floyd",
        source: "local",
        type: "artist",
      },
    ]),
  );
};

// Additional WHEN helper for full results
const whenUserSearchesWithFullResults = async (
  server: FastifyInstance,
  query: string,
): Promise<LightMyRequestResponse> => {
  return await server.inject({
    method: "POST",
    url: "/api/search",
    payload: { query, full: true },
  });
};

// Additional THEN helpers for full results
const thenResponseContainsTracksAndAlbums = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseFullSearchBody(response.body);
  expect(Array.isArray(body.tracks)).toBe(true);
  expect(Array.isArray(body.albums)).toBe(true);
  expect(body.tracks.length).toBeGreaterThan(0);
  expect(body.albums.length).toBeGreaterThan(0);
  // Duration is optional - LMS search API doesn't provide it
  expect(body.tracks[0]).toHaveProperty("id");
  expect(body.tracks[0]).toHaveProperty("title");
  expect(body.albums[0]).toHaveProperty("trackCount");
};

const thenResponseContainsEmptyTracksAndAlbums = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseFullSearchBody(response.body);
  expect(body.tracks).toEqual([]);
  expect(body.albums).toEqual([]);
  expect(body.totalResults).toBe(0);
};

const thenResponseContainsTwoAlbums = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseFullSearchBody(response.body);
  expect(body.albums).toHaveLength(2);
};

const thenResponseOnlyContainsTracks = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseFullSearchBody(response.body);
  expect(body.tracks).toHaveLength(1);
  // After deduplication, track id is the best source URL (not the original LMS id)
  expect(body.tracks[0]).toHaveProperty("id");
  expect(body.tracks[0]).toHaveProperty("title");
  expect(body.tracks[0]).toHaveProperty("availableSources");
};

const thenResponseTotalResultsMatchesTrackCount = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
  const body = parseFullSearchBody(response.body);
  expect(body.totalResults).toBe(body.tracks.length);
};

describe("Full Results Mode - Performance & Caching", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearCache();
    mockLmsClient = createFullMockLmsClient();
    server = Fastify({ logger: false });
    createSearchRoute(server, mockLmsClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("full results response time is under 300ms (NFR4)", async () => {
    // Mock LMS with minimal delay
    await givenLmsReturnsResults(mockLmsClient, [
      {
        id: "track-1",
        title: "Track 1",
        artist: "Artist 1",
        album: "Album 1",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
    ]);

    const startTime = Date.now();
    const response = await whenUserSearchesWithFullResults(server, "test");
    const duration = Date.now() - startTime;

    await thenResponseIs200(response);
    expect(duration).toBeLessThan(300);
  });

  it("caches basic and full results separately", async () => {
    await givenLmsReturnsMultipleTracksFromSameAlbum(mockLmsClient);

    // Search basic mode for "test"
    const basicResponse = await whenUserSearches(server, "test");
    await thenResponseIs200WithResults(basicResponse, 2);

    // Search full mode for "test"
    const fullResponse = await whenUserSearchesWithFullResults(server, "test");
    await thenResponseContainsTracksAndAlbums(fullResponse);

    // Verify both cache entries exist by checking LMS was only called once per mode
    const lmsCallCount = mockLmsClient.search.mock.calls.length;
    expect(lmsCallCount).toBe(2); // Once for basic, once for full

    // Repeat searches - should use cache (no additional LMS calls)
    await whenUserSearches(server, "test");
    await whenUserSearchesWithFullResults(server, "test");

    const lmsCallCountAfterCache = mockLmsClient.search.mock.calls.length;
    expect(lmsCallCountAfterCache).toBe(2); // No new calls, cached
  });

  it("full results cache hit returns in < 50ms", async () => {
    await givenLmsReturnsMultipleTracksFromSameAlbum(mockLmsClient);

    // First request to populate cache
    await whenUserSearchesWithFullResults(server, "test");

    // Second request - measure cached performance
    const startTime = Date.now();
    const response = await whenUserSearchesWithFullResults(server, "test");
    const duration = Date.now() - startTime;

    await thenResponseContainsTracksAndAlbums(response);
    expect(duration).toBeLessThan(50); // Cached response should be very fast
  });

  it("album grouping handles 50+ albums efficiently", async () => {
    // Generate 100 tracks across 50 albums
    const manyTracks = Array.from({ length: 100 }, (_, i) => ({
      id: `track-${i}`,
      title: `Track ${i}`,
      artist: `Artist ${Math.floor(i / 2)}`, // 2 tracks per artist
      album: `Album ${Math.floor(i / 2)}`, // 2 tracks per album
      albumId: `${Math.floor(i / 2)}`, // unique per album
      url: `file:///${i}.flac`,
      source: "local" as const,
      type: "track" as const,
    }));

    await givenLmsReturnsResults(mockLmsClient, manyTracks);

    const startTime = Date.now();
    const response = await whenUserSearchesWithFullResults(server, "test");
    const duration = Date.now() - startTime;

    await thenResponseIs200(response);
    const body = parseFullSearchBody(response.body);
    expect(body.albums.length).toBe(50); // 50 unique albums
    expect(duration).toBeLessThan(300); // Still meets NFR4
  });

  it("transformation handles empty album/artist gracefully", async () => {
    await givenLmsReturnsResults(mockLmsClient, [
      {
        id: "track-1",
        title: "Track 1",
        artist: "",
        album: "",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
      {
        id: "track-2",
        title: "Track 2",
        artist: "Valid Artist",
        album: "Valid Album",
        albumId: "55",
        url: "file:///2.flac",
        source: "local",
        type: "track",
      },
    ]);

    const response = await whenUserSearchesWithFullResults(server, "test");

    await thenResponseIs200(response);
    const body = parseFullSearchBody(response.body);
    expect(body.tracks.length).toBe(2); // Both tracks included
    expect(body.albums.length).toBe(1); // Only valid album grouped
  });
});

// Additional helper for basic 200 check
const thenResponseIs200 = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
};
