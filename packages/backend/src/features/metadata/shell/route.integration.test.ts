import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createMetadataRoute } from "./route.js";
import { clearAlbumCache } from "./cache.js";
import type {
  LmsClient,
  LmsConfig,
  ArtistAlbumRaw,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import type { AlbumTrackRaw } from "../../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly pause: ReturnType<typeof vi.fn<LmsClient["pause"]>>;
  readonly resume: ReturnType<typeof vi.fn<LmsClient["resume"]>>;
  readonly getStatus: ReturnType<typeof vi.fn<LmsClient["getStatus"]>>;
  readonly nextTrack: ReturnType<typeof vi.fn<LmsClient["nextTrack"]>>;
  readonly previousTrack: ReturnType<typeof vi.fn<LmsClient["previousTrack"]>>;
  readonly setVolume: ReturnType<typeof vi.fn<LmsClient["setVolume"]>>;
  readonly getVolume: ReturnType<typeof vi.fn<LmsClient["getVolume"]>>;
  readonly seek: ReturnType<typeof vi.fn<LmsClient["seek"]>>;
  readonly getCurrentTime: ReturnType<
    typeof vi.fn<LmsClient["getCurrentTime"]>
  >;
  readonly playAlbum: ReturnType<typeof vi.fn<LmsClient["playAlbum"]>>;
  readonly disableRepeat: ReturnType<typeof vi.fn<LmsClient["disableRepeat"]>>;
  readonly getAlbumTracks: ReturnType<
    typeof vi.fn<LmsClient["getAlbumTracks"]>
  >;
  readonly getArtistAlbums: ReturnType<
    typeof vi.fn<LmsClient["getArtistAlbums"]>
  >;
  readonly getArtistName: ReturnType<typeof vi.fn<LmsClient["getArtistName"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  search: vi.fn<LmsClient["search"]>().mockResolvedValue(ok([])),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  pause: vi.fn<LmsClient["pause"]>().mockResolvedValue(ok(undefined)),
  resume: vi.fn<LmsClient["resume"]>().mockResolvedValue(ok(undefined)),
  getStatus: vi.fn<LmsClient["getStatus"]>(),
  nextTrack: vi.fn<LmsClient["nextTrack"]>().mockResolvedValue(ok(undefined)),
  previousTrack: vi
    .fn<LmsClient["previousTrack"]>()
    .mockResolvedValue(ok(undefined)),
  setVolume: vi.fn<LmsClient["setVolume"]>().mockResolvedValue(ok(undefined)),
  getVolume: vi.fn<LmsClient["getVolume"]>(),
  seek: vi.fn<LmsClient["seek"]>().mockResolvedValue(ok(undefined)),
  getCurrentTime: vi.fn<LmsClient["getCurrentTime"]>(),
  playAlbum: vi.fn<LmsClient["playAlbum"]>().mockResolvedValue(ok(undefined)),
  disableRepeat: vi
    .fn<LmsClient["disableRepeat"]>()
    .mockResolvedValue(ok(undefined)),
  getAlbumTracks: vi
    .fn<LmsClient["getAlbumTracks"]>()
    .mockResolvedValue(ok([])),
  getArtistAlbums: vi
    .fn<LmsClient["getArtistAlbums"]>()
    .mockResolvedValue(ok([])),
  getArtistName: vi
    .fn<LmsClient["getArtistName"]>()
    .mockResolvedValue(ok(null)),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

type AlbumDetailTrackBody = {
  readonly title: string;
};

type ArtistByNameAlbumBody = {
  readonly albumId?: string;
  readonly title: string;
  readonly trackUrls?: readonly string[];
};

const isAlbumDetailTrackBody = (
  value: unknown,
): value is AlbumDetailTrackBody => {
  return isRecord(value) && typeof value["title"] === "string";
};

const isArtistByNameAlbumBody = (
  value: unknown,
): value is ArtistByNameAlbumBody => {
  return (
    isRecord(value) &&
    typeof value["title"] === "string" &&
    (value["albumId"] === undefined || typeof value["albumId"] === "string") &&
    (value["trackUrls"] === undefined || Array.isArray(value["trackUrls"]))
  );
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

const parseAlbumDetailBody = (
  body: string,
): {
  readonly id: string;
  readonly name?: string;
  readonly title?: string;
  readonly tracks: readonly AlbumDetailTrackBody[];
} => {
  const parsed = parseJson(body);
  const id =
    isRecord(parsed) && typeof parsed["id"] === "string" ? parsed["id"] : null;
  const tracks =
    isRecord(parsed) &&
    Array.isArray(parsed["tracks"]) &&
    parsed["tracks"].every(isAlbumDetailTrackBody)
      ? parsed["tracks"]
      : null;
  const name =
    isRecord(parsed) && typeof parsed["name"] === "string"
      ? parsed["name"]
      : undefined;
  const title =
    isRecord(parsed) && typeof parsed["title"] === "string"
      ? parsed["title"]
      : undefined;
  expect(id).not.toBeNull();
  expect(tracks).not.toBeNull();
  return { id: id ?? "", name, title, tracks: tracks ?? [] };
};

const parseArtistByNameBody = (
  body: string,
): {
  readonly localAlbums: readonly ArtistByNameAlbumBody[];
  readonly tidalAlbums: readonly ArtistByNameAlbumBody[];
} => {
  const parsed = parseJson(body);
  const localAlbums =
    isRecord(parsed) &&
    Array.isArray(parsed["localAlbums"]) &&
    parsed["localAlbums"].every(isArtistByNameAlbumBody)
      ? parsed["localAlbums"]
      : null;
  const tidalAlbums =
    isRecord(parsed) &&
    Array.isArray(parsed["tidalAlbums"]) &&
    parsed["tidalAlbums"].every(isArtistByNameAlbumBody)
      ? parsed["tidalAlbums"]
      : null;
  expect(localAlbums).not.toBeNull();
  expect(tidalAlbums).not.toBeNull();
  return {
    localAlbums: localAlbums ?? [],
    tidalAlbums: tidalAlbums ?? [],
  };
};

const parseArtistDetailBody = (
  body: string,
): {
  readonly id: string;
  readonly name: string;
  readonly albums: readonly unknown[];
} => {
  const parsed = parseJson(body);
  const id =
    isRecord(parsed) && typeof parsed["id"] === "string" ? parsed["id"] : null;
  const name =
    isRecord(parsed) && typeof parsed["name"] === "string"
      ? parsed["name"]
      : null;
  const albums =
    isRecord(parsed) && Array.isArray(parsed["albums"])
      ? parsed["albums"]
      : null;
  expect(id).not.toBeNull();
  expect(name).not.toBeNull();
  expect(albums).not.toBeNull();
  return { id: id ?? "", name: name ?? "", albums: albums ?? [] };
};

const makeRawTrack = (
  overrides: Partial<AlbumTrackRaw> = {},
): AlbumTrackRaw => ({
  id: 1,
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  url: "file:///music/test.flac",
  tracknum: "1",
  duration: 240,
  year: 2021,
  ...overrides,
});

describe("GET /api/album/:albumId", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearAlbumCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createMetadataRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with AlbumDetail for valid albumId", async () => {
    const tracks = [
      makeRawTrack({ id: 1, title: "Track 1", tracknum: "1" }),
      makeRawTrack({ id: 2, title: "Track 2", tracknum: "2" }),
    ];
    mockLmsClient.getAlbumTracks.mockResolvedValue(ok(tracks));

    const response = await server.inject({
      method: "GET",
      url: "/api/album/42",
    });

    expect(response.statusCode).toBe(200);
    const body = parseAlbumDetailBody(response.body);
    expect(body.id).toBe("42");
    expect(body.tracks).toHaveLength(2);
    expect(body.tracks[0]?.title).toBe("Track 1");
  });

  it("returns 404 when album has no tracks (not found)", async () => {
    mockLmsClient.getAlbumTracks.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "GET",
      url: "/api/album/99999",
    });

    expect(response.statusCode).toBe(404);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getAlbumTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/album/42",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("calls lmsClient.getAlbumTracks with the albumId from the URL", async () => {
    const tracks = [makeRawTrack({ id: 1, tracknum: "1" })];
    mockLmsClient.getAlbumTracks.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "GET",
      url: "/api/album/42",
    });

    expect(mockLmsClient.getAlbumTracks).toHaveBeenCalledWith("42");
  });

  it("returns 400 for whitespace-only albumId", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/album/%20",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns cached result on second request without calling LMS", async () => {
    const tracks = [makeRawTrack({ id: 1, tracknum: "1" })];
    mockLmsClient.getAlbumTracks.mockResolvedValue(ok(tracks));

    await server.inject({ method: "GET", url: "/api/album/42" });
    const response = await server.inject({
      method: "GET",
      url: "/api/album/42",
    });

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.getAlbumTracks).toHaveBeenCalledTimes(1); // NOT twice
  });

  it("cache hit returns same data as original response", async () => {
    const tracks = [
      makeRawTrack({ id: 1, title: "Cached Track", tracknum: "1" }),
    ];
    mockLmsClient.getAlbumTracks.mockResolvedValue(ok(tracks));

    const first = await server.inject({
      method: "GET",
      url: "/api/album/42",
    });
    const second = await server.inject({
      method: "GET",
      url: "/api/album/42",
    });

    expect(first.body).toBe(second.body);
  });

  it("does not cache 404 response — subsequent request queries LMS again", async () => {
    mockLmsClient.getAlbumTracks.mockResolvedValue(ok([]));

    await server.inject({ method: "GET", url: "/api/album/99999" });
    await server.inject({ method: "GET", url: "/api/album/99999" });

    expect(mockLmsClient.getAlbumTracks).toHaveBeenCalledTimes(2);
  });

  it("does not cache 503 response — subsequent request queries LMS again", async () => {
    mockLmsClient.getAlbumTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    await server.inject({ method: "GET", url: "/api/album/42" });
    await server.inject({ method: "GET", url: "/api/album/42" });

    expect(mockLmsClient.getAlbumTracks).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────────────────
// GET /api/artist/by-name
// ────────────────────────────────────────────────────────────

const makeLocalTrack = (
  overrides: Partial<SearchResult> = {},
): SearchResult => ({
  id: "t1",
  title: "Creep",
  artist: "Radiohead",
  album: "Pablo Honey",
  url: "file:///music/creep.flac",
  source: "local",
  type: "track",
  albumId: "42",
  artistId: "7",
  ...overrides,
});

const makeTidalTrack = (
  overrides: Partial<SearchResult> = {},
): SearchResult => ({
  id: "t2",
  title: "Creep",
  artist: "Radiohead",
  album: "Pablo Honey",
  url: "tidal://12345.flc",
  source: "tidal",
  type: "track",
  ...overrides,
});

describe("GET /api/artist/by-name", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearAlbumCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createMetadataRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  // AC1: returns 200 with localAlbums and tidalAlbums
  it("returns 200 with localAlbums and tidalAlbums when LMS responds", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([makeLocalTrack(), makeTidalTrack()]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toBeDefined();
    expect(body.tidalAlbums).toBeDefined();
  });

  // AC2: splits albums by source
  it("splits albums by source — local tracks go to localAlbums, tidal to tidalAlbums", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({ albumId: "42", album: "Pablo Honey" }),
        makeLocalTrack({
          id: "t3",
          title: "Anyone Can Play Guitar",
          albumId: "42",
          album: "Pablo Honey",
        }),
        makeTidalTrack({ album: "The Bends", url: "tidal://22222.flc" }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.albumId).toBe("42");
    expect(body.localAlbums[0]?.title).toBe("Pablo Honey");
    expect(body.tidalAlbums).toHaveLength(1);
    expect(body.tidalAlbums[0]?.title).toBe("The Bends");
    expect(body.tidalAlbums[0]?.trackUrls).toHaveLength(1);
  });

  // AC3: deduplicates local albums by albumId
  it("deduplicates local albums by albumId (two tracks on same album → one entry)", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({ albumId: "42", title: "Track 1" }),
        makeLocalTrack({ id: "t2", albumId: "42", title: "Track 2" }),
        makeLocalTrack({
          id: "t3",
          albumId: "99",
          title: "Other Track",
          album: "Other Album",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(2);
  });

  // AC4: returns 400 when name is missing
  it("returns 400 when name query parameter is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  // AC4: returns 400 when name is blank
  it("returns 400 when name is whitespace-only", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=%20",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  // AC5: returns 503 when LMS fails
  it("returns 503 when LMS search fails", async () => {
    mockLmsClient.search.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  // AC6: graceful degradation — only local results
  it("returns empty tidalAlbums when no Tidal tracks found", async () => {
    mockLmsClient.search.mockResolvedValue(ok([makeLocalTrack()]));

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.tidalAlbums).toHaveLength(0);
  });

  // AC6: graceful degradation — only Tidal results
  it("returns empty localAlbums when no local tracks found", async () => {
    mockLmsClient.search.mockResolvedValue(ok([makeTidalTrack()]));

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(0);
    expect(body.tidalAlbums).toHaveLength(1);
  });

  // AC7: passes artist name to lmsClient.search
  it("passes name query param to lmsClient.search", async () => {
    mockLmsClient.search.mockResolvedValue(ok([]));

    await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Pink+Floyd",
    });

    expect(mockLmsClient.search).toHaveBeenCalledWith("Pink Floyd");
  });

  // Bugfix: LMS search:X matches any field (album title, track title, artist).
  // Tracks from albums NAMED after the artist but BY a different artist must be excluded.
  it("excludes tracks from albums named after the artist but by a different artist", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        // Real Radiohead track — should be included
        makeLocalTrack({
          albumId: "42",
          album: "Pablo Honey",
          artist: "Radiohead",
        }),
        // Track FROM an album called "Radiohead" but by "Other Artist" — must be excluded
        makeLocalTrack({
          id: "t99",
          albumId: "99",
          album: "Radiohead",
          artist: "Other Artist",
          albumartist: "Other Artist",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Radiohead",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.title).toBe("Pablo Honey");
  });

  // AC1/AC6 (Story 9.16): exact match — rejects substring artist names
  // Bug: "rabauken von kiez".includes("rabauken") was true → wrongly included
  it("excludes tracks whose artist only contains the name as a substring", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        // Exact match — should be included
        makeLocalTrack({
          albumId: "10",
          album: "Randale",
          artist: "Rabauken",
          albumartist: "Rabauken",
        }),
        // Substring match only — must be excluded
        makeLocalTrack({
          id: "t99",
          albumId: "99",
          album: "Kiez Hits",
          artist: "Rabauken von Kiez",
          albumartist: "Rabauken von Kiez",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Rabauken",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.title).toBe("Randale");
  });

  // AC2 (Story 9.16): case-insensitive exact match
  it("matches artist case-insensitively (die+rabauken matches Die Rabauken)", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({
          albumId: "10",
          album: "Randale",
          artist: "Die Rabauken",
          albumartist: "Die Rabauken",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=die+rabauken",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.title).toBe("Randale");
  });

  // AC3 (Story 9.16): diacritic normalization — "Bjork" matches "Björk"
  it("matches artist with diacritics via NFD normalization (Bjork matches Björk)", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({
          albumId: "55",
          album: "Debut",
          artist: "Björk",
          albumartist: "Björk",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Bjork",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.title).toBe("Debut");
  });

  // AC6 reverse direction (Story 9.16 code review): "Floyd" must NOT return "Pink Floyd"
  // The old bug: "pink floyd".includes("floyd") === true → wrongly included
  it("excludes Pink Floyd when searching for Floyd (reverse substring rejection)", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({
          albumId: "10",
          album: "The Wall",
          artist: "Pink Floyd",
          albumartist: "Pink Floyd",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Floyd",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(0);
  });

  // AC4 (Story 9.16 code review): multi-word exact match returns albums correctly
  it("returns albums for multi-word artist name (Pink Floyd exact match)", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({
          albumId: "10",
          album: "The Wall",
          artist: "Pink Floyd",
          albumartist: "Pink Floyd",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Pink+Floyd",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.title).toBe("The Wall");
  });

  // Bugfix (post-9.16): collaboration track page returns results via track-artist match
  // Track has albumartist="Taylor Swift", artist="Taylor Swift, Hayley Williams".
  // Searching by collaboration name finds the album via the track-artist field.
  it("returns album when searching by collaboration artist name matching track artist field", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeLocalTrack({
          albumId: "10",
          album: "Red",
          artist: "Taylor Swift, Hayley Williams",
          albumartist: "Taylor Swift",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Taylor+Swift%2C+Hayley+Williams",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.localAlbums).toHaveLength(1);
    expect(body.localAlbums[0]?.title).toBe("Red");
  });

  // L4 (Story 9.16 code review): exact-match filter also applies to Tidal tracks
  it("excludes Tidal tracks whose artist only contains the name as a substring", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok([
        makeTidalTrack({
          album: "Randale",
          artist: "Rabauken",
          url: "tidal://111.flc",
        }),
        makeTidalTrack({
          id: "t99",
          album: "Kiez Hits",
          artist: "Rabauken von Kiez",
          url: "tidal://999.flc",
        }),
      ]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/by-name?name=Rabauken",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistByNameBody(response.body);
    expect(body.tidalAlbums).toHaveLength(1);
    expect(body.tidalAlbums[0]?.title).toBe("Randale");
  });
});

const makeRawAlbum = (
  overrides: Partial<ArtistAlbumRaw> = {},
): ArtistAlbumRaw => ({
  id: 1,
  album: "Test Album",
  artist: "Test Artist",
  year: 2021,
  artwork_track_id: "101",
  ...overrides,
});

describe("GET /api/artist/:artistId", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    clearAlbumCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createMetadataRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with ArtistDetail for valid artistId", async () => {
    const albums = [
      makeRawAlbum({ id: 1, album: "The Wall", year: 1979 }),
      makeRawAlbum({ id: 2, album: "Animals", year: 1977 }),
    ];
    mockLmsClient.getArtistAlbums.mockResolvedValue(ok(albums));

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/42",
    });

    expect(response.statusCode).toBe(200);
    const body = parseArtistDetailBody(response.body);
    expect(body.id).toBe("42");
    expect(body.albums).toHaveLength(2);
    expect(body.name).toBe("Test Artist");
  });

  it("returns 404 when artist has no albums (not found)", async () => {
    mockLmsClient.getArtistAlbums.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/99999",
    });

    expect(response.statusCode).toBe(404);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getArtistAlbums.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/artist/42",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("returns 400 for whitespace-only artistId", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/artist/%20",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("calls lmsClient.getArtistAlbums with the artistId from the URL", async () => {
    const albums = [makeRawAlbum({ id: 1 })];
    mockLmsClient.getArtistAlbums.mockResolvedValue(ok(albums));

    await server.inject({
      method: "GET",
      url: "/api/artist/42",
    });

    expect(mockLmsClient.getArtistAlbums).toHaveBeenCalledWith("42");
  });
});
