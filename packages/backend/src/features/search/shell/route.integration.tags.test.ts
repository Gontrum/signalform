/**
 * Search Route Integration Tests — `tag:` Search
 *
 * Split from route.integration.test.ts (AGENTS.md "Testing": keep test files
 * under ~20 KB). Covers the `tag:` prefix branch added to the `full: true`
 * search: routing to the global Discogs tag lookup, complete bypass of the
 * LMS/Tidal search, resilience against a Discogs failure, and that queries
 * without the prefix are entirely unaffected.
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
import {
  createDiscogsClient,
  type DiscogsClient,
} from "../../../adapters/discogs-client/index.js";
import { ok, err } from "@signalform/shared";
import { clearCache } from "./cache.js";

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
};

type MockDiscogsClient = DiscogsClient & {
  readonly searchReleases: ReturnType<
    typeof vi.fn<DiscogsClient["searchReleases"]>
  >;
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

const createMockDiscogsClient = (): MockDiscogsClient => ({
  ...createDiscogsClient(),
  searchReleases: vi
    .fn<DiscogsClient["searchReleases"]>()
    .mockResolvedValue(ok([])),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type FullSearchBody = {
  readonly tracks: readonly unknown[];
  readonly albums: readonly unknown[];
  readonly artists: readonly unknown[];
  readonly tags: readonly unknown[];
  readonly totalResults: number;
};

const parseFullSearchBody = (body: string): FullSearchBody => {
  const parsed = JSON.parse(body) as unknown;
  expect(isRecord(parsed)).toBe(true);
  if (!isRecord(parsed)) {
    return { tracks: [], albums: [], artists: [], tags: [], totalResults: 0 };
  }
  return {
    tracks: Array.isArray(parsed["tracks"]) ? parsed["tracks"] : [],
    albums: Array.isArray(parsed["albums"]) ? parsed["albums"] : [],
    artists: Array.isArray(parsed["artists"]) ? parsed["artists"] : [],
    tags: Array.isArray(parsed["tags"]) ? parsed["tags"] : [],
    totalResults:
      typeof parsed["totalResults"] === "number" ? parsed["totalResults"] : 0,
  };
};

const createServer = (
  mockLmsClient: MockLmsClient,
  mockDiscogsClient: MockDiscogsClient,
): FastifyInstance => {
  const server = Fastify({ logger: false });
  createSearchRoute(server, mockLmsClient, mockDiscogsClient);
  return server;
};

const givenLmsReturnsOneTrack = (mockLmsClient: MockLmsClient): void => {
  mockLmsClient.search.mockResolvedValue(
    ok({
      tracks: [
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
      ],
      tidalAvailable: true,
    }),
  );
};

// Insertion order deliberately does not match Discogs' "Artist - Title"
// convention parsing order — proves toCandidates (and thus albumCount) is
// actually computed rather than just echoing the array length.
const givenDiscogsReturnsThreeCandidates = (
  mockDiscogsClient: MockDiscogsClient,
): void => {
  mockDiscogsClient.searchReleases.mockResolvedValue(
    ok([
      { title: "Amerie - All I Have", year: 2002 },
      { title: "Zapp - Zapp II", year: 1982 },
      { title: "Madonna - The Immaculate Collection", year: 1990 },
    ]),
  );
};

const whenUserSearchesWithFullResults = async (
  server: FastifyInstance,
  query: string,
): Promise<LightMyRequestResponse> =>
  await server.inject({
    method: "POST",
    url: "/api/search",
    payload: { query, full: true },
  });

describe("POST /api/search — tag: search", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockDiscogsClient: MockDiscogsClient;

  beforeEach(() => {
    clearCache();
    mockLmsClient = createMockLmsClient();
    mockDiscogsClient = createMockDiscogsClient();
  });

  afterEach(async () => {
    await server.close();
  });

  it("leaves a plain query entirely unaffected and never calls Discogs", async () => {
    givenDiscogsReturnsThreeCandidates(mockDiscogsClient);
    givenLmsReturnsOneTrack(mockLmsClient);
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const response = await whenUserSearchesWithFullResults(
      server,
      "Pink Floyd",
    );

    expect(response.statusCode).toBe(200);
    const body = parseFullSearchBody(response.body);
    expect(body.tags).toEqual([]);
    expect(body.tracks).toHaveLength(1);
    expect(body.albums).toHaveLength(1);
    expect(mockDiscogsClient.searchReleases).not.toHaveBeenCalled();
  });

  it("routes a `tag:` query to Discogs, skipping LMS/Tidal entirely", async () => {
    givenDiscogsReturnsThreeCandidates(mockDiscogsClient);
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const response = await whenUserSearchesWithFullResults(
      server,
      "tag:qsound-basic",
    );

    expect(response.statusCode).toBe(200);
    const body = parseFullSearchBody(response.body);
    expect(body.tracks).toEqual([]);
    expect(body.albums).toEqual([]);
    expect(body.artists).toEqual([]);
    expect(body.totalResults).toBe(0);
    expect(body.tags).toEqual([
      { query: "qsound-basic", displayName: "qsound-basic", albumCount: 3 },
    ]);
    expect(mockLmsClient.search).not.toHaveBeenCalled();
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(1);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledWith(
      "qsound-basic",
    );
  });

  it("matches the `tag:` prefix case-insensitively", async () => {
    givenDiscogsReturnsThreeCandidates(mockDiscogsClient);
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const response = await whenUserSearchesWithFullResults(
      server,
      "TAG:qsound-case",
    );

    expect(response.statusCode).toBe(200);
    const body = parseFullSearchBody(response.body);
    expect(body.tags).toEqual([
      { query: "qsound-case", displayName: "qsound-case", albumCount: 3 },
    ]);
    expect(mockLmsClient.search).not.toHaveBeenCalled();
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledWith(
      "qsound-case",
    );
  });

  it("returns an empty tags array for `tag:` with nothing after the prefix", async () => {
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const response = await whenUserSearchesWithFullResults(server, "tag:");

    expect(response.statusCode).toBe(200);
    const body = parseFullSearchBody(response.body);
    expect(body.tags).toEqual([]);
    expect(mockLmsClient.search).not.toHaveBeenCalled();
    expect(mockDiscogsClient.searchReleases).not.toHaveBeenCalled();
  });

  it("degrades to an empty tags array without a 5xx when Discogs is down", async () => {
    mockDiscogsClient.searchReleases.mockResolvedValue(
      err({ type: "NetworkError", message: "Discogs unreachable" }),
    );
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const response = await whenUserSearchesWithFullResults(
      server,
      "tag:qsound-down",
    );

    expect(response.statusCode).toBe(200);
    expect(parseFullSearchBody(response.body).tags).toEqual([]);
  });

  it("retries Discogs on the next request instead of serving the degraded empty result from cache", async () => {
    mockDiscogsClient.searchReleases.mockResolvedValue(
      err({ type: "NetworkError", message: "Discogs unreachable" }),
    );
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const degraded = await whenUserSearchesWithFullResults(
      server,
      "tag:qsound-outage",
    );
    expect(parseFullSearchBody(degraded.body).tags).toEqual([]);

    givenDiscogsReturnsThreeCandidates(mockDiscogsClient);
    const recovered = await whenUserSearchesWithFullResults(
      server,
      "tag:qsound-outage",
    );

    expect(recovered.statusCode).toBe(200);
    expect(parseFullSearchBody(recovered.body).tags).toEqual([
      { query: "qsound-outage", displayName: "qsound-outage", albumCount: 3 },
    ]);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(2);
  });

  it("caches a successful run that found no albums, so the repeat costs no Discogs call", async () => {
    mockDiscogsClient.searchReleases.mockResolvedValue(ok([]));
    server = createServer(mockLmsClient, mockDiscogsClient);
    await server.ready();

    const first = await whenUserSearchesWithFullResults(
      server,
      "tag:qsound-nohits",
    );
    const second = await whenUserSearchesWithFullResults(
      server,
      "tag:qsound-nohits",
    );

    expect(parseFullSearchBody(first.body).tags).toEqual([]);
    expect(parseFullSearchBody(second.body).tags).toEqual([]);
    expect(mockDiscogsClient.searchReleases).toHaveBeenCalledTimes(1);
  });
});
