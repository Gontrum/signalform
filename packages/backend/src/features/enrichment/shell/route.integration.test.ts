import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { err, ok } from "@signalform/shared";
import { createEnrichmentRoute } from "./route.js";
import { clearEnrichmentCache } from "./cache.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { FanartClient } from "../../../adapters/fanart-client/index.js";

type MockLastFmClient = LastFmClient & {
  readonly getSimilarTracks: ReturnType<
    typeof vi.fn<LastFmClient["getSimilarTracks"]>
  >;
  readonly getSimilarArtists: ReturnType<
    typeof vi.fn<LastFmClient["getSimilarArtists"]>
  >;
  readonly getArtistInfo: ReturnType<
    typeof vi.fn<LastFmClient["getArtistInfo"]>
  >;
  readonly getAlbumInfo: ReturnType<typeof vi.fn<LastFmClient["getAlbumInfo"]>>;
  readonly getCircuitState: ReturnType<
    typeof vi.fn<LastFmClient["getCircuitState"]>
  >;
};

type MockFanartClient = FanartClient & {
  readonly getArtistImages: ReturnType<
    typeof vi.fn<FanartClient["getArtistImages"]>
  >;
};

const makeMockClient = (): MockLastFmClient => ({
  getSimilarTracks: vi.fn<LastFmClient["getSimilarTracks"]>(),
  getSimilarArtists: vi.fn<LastFmClient["getSimilarArtists"]>(),
  getArtistInfo: vi.fn<LastFmClient["getArtistInfo"]>(),
  getAlbumInfo: vi.fn<LastFmClient["getAlbumInfo"]>(),
  getCircuitState: vi
    .fn<LastFmClient["getCircuitState"]>()
    .mockReturnValue("CLOSED"),
});

const makeMockFanartClient = (): MockFanartClient => ({
  getArtistImages: vi
    .fn<FanartClient["getArtistImages"]>()
    .mockResolvedValue(err({ type: "NotFoundError", message: "not found" })),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const parseCodeBody = (
  body: string,
): {
  readonly code: string;
} => {
  const parsed = parseJson(body);
  const code =
    isRecord(parsed) && typeof parsed["code"] === "string"
      ? parsed["code"]
      : null;
  expect(code).not.toBeNull();
  return { code: code ?? "" };
};

const parseArtistBody = (
  body: string,
): {
  readonly name: string;
  readonly listeners: number;
  readonly tags: readonly string[];
  readonly bio: string;
} => {
  const parsed = parseJson(body);
  const name =
    isRecord(parsed) && typeof parsed["name"] === "string"
      ? parsed["name"]
      : null;
  const listeners =
    isRecord(parsed) && typeof parsed["listeners"] === "number"
      ? parsed["listeners"]
      : null;
  const tags =
    isRecord(parsed) &&
    Array.isArray(parsed["tags"]) &&
    parsed["tags"].every((tag) => typeof tag === "string")
      ? parsed["tags"]
      : null;
  const bio =
    isRecord(parsed) && typeof parsed["bio"] === "string"
      ? parsed["bio"]
      : null;
  expect(name).not.toBeNull();
  expect(listeners).not.toBeNull();
  expect(tags).not.toBeNull();
  expect(bio).not.toBeNull();
  return {
    name: name ?? "",
    listeners: listeners ?? 0,
    tags: tags ?? [],
    bio: bio ?? "",
  };
};

const parseAlbumBody = (
  body: string,
): {
  readonly name: string;
  readonly listeners: number;
  readonly wiki: string;
} => {
  const parsed = parseJson(body);
  const name =
    isRecord(parsed) && typeof parsed["name"] === "string"
      ? parsed["name"]
      : null;
  const listeners =
    isRecord(parsed) && typeof parsed["listeners"] === "number"
      ? parsed["listeners"]
      : null;
  const wiki =
    isRecord(parsed) && typeof parsed["wiki"] === "string"
      ? parsed["wiki"]
      : null;
  expect(name).not.toBeNull();
  expect(listeners).not.toBeNull();
  expect(wiki).not.toBeNull();
  return {
    name: name ?? "",
    listeners: listeners ?? 0,
    wiki: wiki ?? "",
  };
};

const parseSimilarArtistsBody = (
  body: string,
): ReadonlyArray<{
  readonly name: string;
  readonly match: number;
}> => {
  const parsed = parseJson(body);
  const entries =
    Array.isArray(parsed) &&
    parsed.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry["name"] === "string" &&
        typeof entry["match"] === "number",
    )
      ? parsed
      : null;
  expect(entries).not.toBeNull();
  return (entries ?? []).map((entry) => ({
    name: entry["name"],
    match: entry["match"],
  }));
};

const parseUnknownArrayBody = (body: string): readonly unknown[] => {
  const parsed = parseJson(body);
  expect(Array.isArray(parsed)).toBe(true);
  return Array.isArray(parsed) ? parsed : [];
};

const parseImageBody = (
  body: string,
): {
  readonly imageUrl: string | null;
} => {
  const parsed = parseJson(body);
  const imageUrl =
    isRecord(parsed) &&
    (parsed["imageUrl"] === null || typeof parsed["imageUrl"] === "string")
      ? parsed["imageUrl"]
      : undefined;
  expect(imageUrl).not.toBeUndefined();
  return { imageUrl: imageUrl ?? null };
};

const makeArtistInfo = (): {
  readonly name: string;
  readonly mbid: string;
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  readonly bio: string;
} => ({
  name: "Die Ärzte",
  mbid: "abc123",
  listeners: 500000,
  playcount: 10000000,
  tags: ["punk", "rock"],
  bio: "<p>A German punk band.</p>",
});

const makeAlbumInfo = (): {
  readonly name: string;
  readonly mbid: string;
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  readonly wiki: string;
} => ({
  name: "Geräusch",
  mbid: "def456",
  listeners: 100000,
  playcount: 2000000,
  tags: ["punk", "alternative"],
  wiki: "<p>An album by Die Ärzte.</p>",
});

describe("GET /api/enrichment/artist", () => {
  let server: FastifyInstance;
  let mock: MockLastFmClient;

  beforeEach(async () => {
    clearEnrichmentCache();
    mock = makeMockClient();
    server = Fastify({ logger: false });
    createEnrichmentRoute(server, mock, makeMockFanartClient(), {
      language: "en",
    });
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with ArtistEnrichment on success", async () => {
    mock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistBody(response.body);
    expect(body.name).toBe("Die Ärzte");
    expect(body.listeners).toBe(500000);
    expect(body.tags).toEqual(["punk", "rock"]);
    expect(body.bio).toBe("<p>A German punk band.</p>");
  });

  it("returns 400 when name is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 400 when name is empty string", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 400 when name is whitespace-only", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=%20",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 404 when last.fm reports NotFoundError", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "NotFoundError", code: 6, message: "Artist not found" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Unknown",
    });

    expect(response.statusCode).toBe(404);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 503 when last.fm has NetworkError", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LAST_FM_UNAVAILABLE");
  });

  it("returns 503 when circuit breaker is open (CircuitOpenError)", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "CircuitOpenError", message: "Circuit breaker is open" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LAST_FM_UNAVAILABLE");
  });

  it("returns 503 when last.fm returns ParseError", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "ParseError", message: "Unexpected token" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LAST_FM_UNAVAILABLE");
  });

  it("returns cached result on second identical request, getArtistInfo called only once", async () => {
    mock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));

    const first = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });
    const second = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.body).toBe(second.body);
    expect(mock.getArtistInfo).toHaveBeenCalledTimes(1);
  });

  it("passes configured language through to getArtistInfo", async () => {
    const germanServer = Fastify({ logger: false });
    const germanMock = makeMockClient();
    germanMock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));
    createEnrichmentRoute(germanServer, germanMock, makeMockFanartClient(), {
      language: "de",
    });
    await germanServer.ready();

    const response = await germanServer.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(200);
    expect(germanMock.getArtistInfo).toHaveBeenCalledWith("Die Ärzte", "de");

    await germanServer.close();
  });

  it("uses normalizeArtist for cache key — 'Die Ärzte' and 'die arzte' hit same entry", async () => {
    mock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));

    await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=die+arzte",
    });
    const second = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(second.statusCode).toBe(200);
    expect(mock.getArtistInfo).toHaveBeenCalledTimes(1);
  });

  it("does not cache 404 — subsequent request calls client again", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "NotFoundError", code: 6, message: "Artist not found" }),
    );

    await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Unknown",
    });
    await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Unknown",
    });

    expect(mock.getArtistInfo).toHaveBeenCalledTimes(2);
  });

  it("does not cache 503 — subsequent request calls client again", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "CircuitOpenError", message: "Circuit breaker is open" }),
    );

    await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });
    await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    expect(mock.getArtistInfo).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/enrichment/album", () => {
  let server: FastifyInstance;
  let mock: MockLastFmClient;

  beforeEach(async () => {
    clearEnrichmentCache();
    mock = makeMockClient();
    server = Fastify({ logger: false });
    createEnrichmentRoute(server, mock, makeMockFanartClient(), {
      language: "en",
    });
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with AlbumEnrichment on success", async () => {
    mock.getAlbumInfo.mockResolvedValue(ok(makeAlbumInfo()));

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte&album=Ger%C3%A4usch",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumBody(response.body);
    expect(body.name).toBe("Geräusch");
    expect(body.listeners).toBe(100000);
    expect(body.wiki).toBe("<p>An album by Die Ärzte.</p>");
  });

  it("returns 400 when artist is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?album=Ger%C3%A4usch",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 400 when album is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 400 when no query params provided", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 400 when artist is whitespace-only", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=%20&album=Ger%C3%A4usch",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 400 when album is whitespace-only", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte&album=%20",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 404 when album is not found", async () => {
    mock.getAlbumInfo.mockResolvedValue(
      err({ type: "NotFoundError", code: 6, message: "Album not found" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte&album=Unknown",
    });

    expect(response.statusCode).toBe(404);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 503 when album lookup fails", async () => {
    mock.getAlbumInfo.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte&album=Ger%C3%A4usch",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LAST_FM_UNAVAILABLE");
  });

  it("caches successful album lookups", async () => {
    mock.getAlbumInfo.mockResolvedValue(ok(makeAlbumInfo()));

    await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte&album=Ger%C3%A4usch",
    });
    await server.inject({
      method: "GET",
      url: "/api/enrichment/album?artist=Die+%C3%84rzte&album=Ger%C3%A4usch",
    });

    expect(mock.getAlbumInfo).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/enrichment/artist/similar", () => {
  let server: FastifyInstance;
  let mock: MockLastFmClient;

  beforeEach(async () => {
    clearEnrichmentCache();
    mock = makeMockClient();
    server = Fastify({ logger: false });
    createEnrichmentRoute(server, mock, makeMockFanartClient(), {
      language: "en",
    });
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with similar artists", async () => {
    mock.getSimilarArtists.mockResolvedValue(
      ok([
        {
          name: "Tocotronic",
          mbid: "mbid-1",
          match: 0.9,
          url: "https://www.last.fm/music/Tocotronic",
        },
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/similar?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(200);
    const body = parseSimilarArtistsBody(response.body);
    expect(body).toEqual([{ name: "Tocotronic", match: 0.9 }]);
  });

  it("returns 400 when similar artist name is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/similar",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("MISSING_PARAM");
  });

  it("returns 404 when similar artists are not found", async () => {
    mock.getSimilarArtists.mockResolvedValue(
      err({ type: "NotFoundError", code: 6, message: "Artist not found" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/similar?name=Unknown",
    });

    expect(response.statusCode).toBe(404);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns cached similar artists on repeated request", async () => {
    mock.getSimilarArtists.mockResolvedValue(
      ok([
        {
          name: "Tocotronic",
          mbid: "mbid-1",
          match: 0.9,
          url: "https://www.last.fm/music/Tocotronic",
        },
      ]),
    );

    const first = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/similar?name=Die+%C3%84rzte",
    });
    const second = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/similar?name=Die+%C3%84rzte",
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(mock.getSimilarArtists).toHaveBeenCalledTimes(1);
  });

  it("passes limit to the client", async () => {
    mock.getSimilarArtists.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/similar?name=Die+%C3%84rzte&limit=3",
    });

    expect(response.statusCode).toBe(200);
    expect(parseUnknownArrayBody(response.body)).toEqual([]);
    expect(mock.getSimilarArtists).toHaveBeenCalledWith("Die Ärzte", 3);
  });
});

describe("GET /api/enrichment/artist/images", () => {
  let server: FastifyInstance;
  let mock: MockLastFmClient;
  let fanart: MockFanartClient;

  beforeEach(async () => {
    clearEnrichmentCache();
    mock = makeMockClient();
    fanart = makeMockFanartClient();
    server = Fastify({ logger: false });
    createEnrichmentRoute(server, mock, fanart, { language: "en" });
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns artist image when enrichment provides MBID and fanart succeeds", async () => {
    mock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));
    fanart.getArtistImages.mockResolvedValue(
      ok("https://fanart.example/artist.jpg"),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/images?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(200);
    expect(parseImageBody(response.body)).toEqual({
      imageUrl: "https://fanart.example/artist.jpg",
    });
  });

  it("returns null image when MBID cannot be resolved", async () => {
    mock.getArtistInfo.mockResolvedValue(
      err({ type: "NotFoundError", code: 6, message: "Artist not found" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/images?name=Unknown",
    });

    expect(response.statusCode).toBe(200);
    expect(parseImageBody(response.body)).toEqual({ imageUrl: null });
  });

  it("returns null image when fanart lookup fails", async () => {
    mock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));
    fanart.getArtistImages.mockResolvedValue(
      err({ type: "NetworkError", message: "boom" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/images?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(200);
    expect(parseImageBody(response.body)).toEqual({ imageUrl: null });
  });

  it("reuses cached enrichment before calling last.fm again", async () => {
    mock.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));
    fanart.getArtistImages.mockResolvedValue(
      ok("https://fanart.example/artist.jpg"),
    );

    await server.inject({
      method: "GET",
      url: "/api/enrichment/artist?name=Die+%C3%84rzte",
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/enrichment/artist/images?name=Die+%C3%84rzte",
    });

    expect(response.statusCode).toBe(200);
    expect(parseImageBody(response.body)).toEqual({
      imageUrl: "https://fanart.example/artist.jpg",
    });
    expect(mock.getArtistInfo).toHaveBeenCalledTimes(1);
  });
});
