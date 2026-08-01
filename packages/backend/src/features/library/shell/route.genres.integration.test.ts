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
  readonly getLibraryAlbumCount: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbumCount"]>
  >;
  readonly getGenres: ReturnType<typeof vi.fn<LmsClient["getGenres"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getLibraryAlbumCount: vi
    .fn<LmsClient["getLibraryAlbumCount"]>()
    .mockResolvedValue(ok(0)),
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

const genresOf = (
  body: string,
): readonly { readonly name: string; readonly albumCount: unknown }[] =>
  asRecords(parseBody(body)["genres"]).map((genre) => ({
    name: typeof genre["name"] === "string" ? genre["name"] : "",
    albumCount: genre["albumCount"],
  }));

const settlePendingWarmup = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("GET /api/library/genres", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  // Insertion order is neither alphabetical nor count-ordered: every expected
  // order below has to come from a sort, never from the fixture itself.
  // Zydeco genuinely has zero albums — a genre whose count is missing must
  // still sort behind it.
  const genreList = [
    { id: 3, name: "Rock" },
    { id: 4, name: "Zydeco" },
    { id: 1, name: "Ambient" },
    { id: 2, name: "Blues" },
  ] as const;

  const genreCounts: Readonly<Record<number, number>> = {
    1: 7,
    2: 50,
    3: 50,
    4: 0,
  };

  const drainWarmup = async (calls: number): Promise<void> => {
    await vi.waitFor(() =>
      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledTimes(calls),
    );
  };

  const failCountFor = (failingGenreId: number): void => {
    mockLmsClient.getLibraryAlbumCount.mockImplementation(async (filters) =>
      filters?.genreId === failingGenreId
        ? err({ type: "NetworkError", message: "Connection refused" })
        : ok(genreCounts[filters?.genreId ?? -1] ?? 0),
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
      { name: "Zydeco", albumCount: undefined },
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
      { name: "Zydeco", albumCount: 0 },
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

  it("serves the counts it has when one count query fails, uncounted last", async () => {
    failCountFor(1);

    await server.inject({ method: "GET", url: "/api/library/genres" });
    await drainWarmup(genreList.length);

    const response = await server.inject({
      method: "GET",
      url: "/api/library/genres",
    });

    expect(response.statusCode).toBe(200);
    expect(genresOf(response.body)).toEqual([
      { name: "Blues", albumCount: 50 },
      { name: "Rock", albumCount: 50 },
      { name: "Zydeco", albumCount: 0 },
      { name: "Ambient", albumCount: undefined },
    ]);
  });

  it("runs a single warm-up pass even when a count keeps failing", async () => {
    failCountFor(1);

    await server.inject({ method: "GET", url: "/api/library/genres" });
    await drainWarmup(genreList.length);

    await server.inject({ method: "GET", url: "/api/library/genres" });
    await server.inject({ method: "GET", url: "/api/library/genres" });
    await settlePendingWarmup();

    expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledTimes(
      genreList.length,
    );
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
