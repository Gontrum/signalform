import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createArtistRadioRoute } from "./route.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import { createLastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

const defaultLastFmConfig = {
  apiKey: "test-key",
  timeout: 5000,
  baseUrl: "https://ws.audioscrobbler.com/2.0/",
  language: "en" as const,
};

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
};

type MockLastFmClient = LastFmClient & {
  readonly getArtistTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getArtistTopTracks"]>
  >;
  readonly getSimilarArtists: ReturnType<
    typeof vi.fn<LastFmClient["getSimilarArtists"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  search: vi
    .fn<LmsClient["search"]>()
    .mockResolvedValue(ok({ tracks: [], tidalAvailable: true })),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
});

const createMockLastFmClient = (): MockLastFmClient => ({
  ...createLastFmClient(defaultLastFmConfig),
  getArtistTopTracks: vi
    .fn<LastFmClient["getArtistTopTracks"]>()
    .mockResolvedValue(ok([])),
  getSimilarArtists: vi
    .fn<LastFmClient["getSimilarArtists"]>()
    .mockResolvedValue(ok([])),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseCodeBody = (body: string): { readonly code: string } => {
  const parsed = parseJson(body);
  const code =
    isRecord(parsed) && typeof parsed["code"] === "string"
      ? parsed["code"]
      : null;
  expect(code).not.toBeNull();
  return { code: code ?? "" };
};

const makeTopTrack = (
  name: string,
  artist: string,
): {
  readonly name: string;
  readonly artist: string;
  readonly playcount: number;
  readonly listeners: number;
  readonly url: string;
} => ({
  name,
  artist,
  playcount: 1000,
  listeners: 500,
  url: `https://last.fm/${artist}/${name}`,
});

const makeSimilarArtist = (
  name: string,
): { readonly name: string; readonly match: number; readonly url: string } => ({
  name,
  match: 0.9,
  url: `https://last.fm/${name}`,
});

const makeSearchResult = (url: string, artist: string): SearchResult => ({
  id: "1",
  title: "Track",
  artist,
  album: "Album",
  url,
  source: "local",
  type: "track",
});

describe("POST /api/artist-radio/start", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify({ logger: false });
    createArtistRadioRoute(server, mockLmsClient, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  // 400: missing/empty artistName body
  it("returns 400 when artistName is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/artist-radio/start",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when artistName is empty string", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/artist-radio/start",
      payload: { artistName: "" },
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  // 503: both last.fm calls fail
  it("returns 503 when both last.fm calls fail", async () => {
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );
    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/artist-radio/start",
      payload: { artistName: "Radiohead" },
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LASTFM_UNAVAILABLE");
  });

  // 404: last.fm returns tracks but LMS finds nothing
  it("returns 404 when last.fm returns tracks but LMS finds no matches", async () => {
    mockLastFmClient.getArtistTopTracks.mockResolvedValue(
      ok([
        makeTopTrack("Creep", "Radiohead"),
        makeTopTrack("Karma Police", "Radiohead"),
      ]),
    );
    mockLastFmClient.getSimilarArtists.mockResolvedValue(ok([]));
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/artist-radio/start",
      payload: { artistName: "Radiohead" },
    });

    expect(response.statusCode).toBe(404);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("NOT_FOUND");
  });

  // 200 happy path: 2 seed tracks + 2 similar artists with 1 track each = 4 tracks
  it("returns 200 with tracksAdded when seeds are found and LMS finds all tracks", async () => {
    mockLastFmClient.getArtistTopTracks
      // First call: seed artist top tracks
      .mockResolvedValueOnce(
        ok([
          makeTopTrack("Creep", "Radiohead"),
          makeTopTrack("Karma Police", "Radiohead"),
        ]),
      )
      // Second call: similar artist 1 top tracks
      .mockResolvedValueOnce(ok([makeTopTrack("Glory Box", "Portishead")]))
      // Third call: similar artist 2 top tracks
      .mockResolvedValueOnce(
        ok([makeTopTrack("Unfinished Sympathy", "Massive Attack")]),
      );

    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([
        makeSimilarArtist("Portishead"),
        makeSimilarArtist("Massive Attack"),
      ]),
    );

    mockLmsClient.search
      // 1st seed: "Radiohead Creep"
      .mockResolvedValueOnce(
        ok({
          tracks: [makeSearchResult("file:///creep.flac", "Radiohead")],
          tidalAvailable: true,
        }),
      )
      // 2nd seed: "Portishead Glory Box"
      .mockResolvedValueOnce(
        ok({
          tracks: [makeSearchResult("file:///glory_box.flac", "Portishead")],
          tidalAvailable: true,
        }),
      )
      // 3rd seed: "Massive Attack Unfinished Sympathy"
      .mockResolvedValueOnce(
        ok({
          tracks: [
            makeSearchResult("file:///unfinished.flac", "Massive Attack"),
          ],
          tidalAvailable: true,
        }),
      )
      // 4th seed: "Radiohead Karma Police"
      .mockResolvedValueOnce(
        ok({
          tracks: [makeSearchResult("file:///karma.flac", "Radiohead")],
          tidalAvailable: true,
        }),
      );

    const response = await server.inject({
      method: "POST",
      url: "/api/artist-radio/start",
      payload: { artistName: "Radiohead" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) ? parsed["artistName"] : undefined).toBe(
      "Radiohead",
    );
    expect(isRecord(parsed) ? parsed["tracksAdded"] : undefined).toBe(4);

    expect(mockLmsClient.play).toHaveBeenCalledWith("file:///creep.flac");
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(3);
  });

  // Graceful degradation: seed artist top tracks fails, similar artists succeed
  it("returns 200 when seed artist top tracks fails but similar artists succeed", async () => {
    mockLastFmClient.getArtistTopTracks
      // First call: seed artist fails
      .mockResolvedValueOnce(
        err({ type: "NetworkError", message: "Connection refused" }),
      )
      // Second call: similar artist 1 top tracks
      .mockResolvedValueOnce(ok([makeTopTrack("Glory Box", "Portishead")]))
      // Third call: similar artist 2 top tracks
      .mockResolvedValueOnce(
        ok([makeTopTrack("Unfinished Sympathy", "Massive Attack")]),
      );

    mockLastFmClient.getSimilarArtists.mockResolvedValue(
      ok([
        makeSimilarArtist("Portishead"),
        makeSimilarArtist("Massive Attack"),
      ]),
    );

    mockLmsClient.search
      .mockResolvedValueOnce(
        ok({
          tracks: [makeSearchResult("file:///glory_box.flac", "Portishead")],
          tidalAvailable: true,
        }),
      )
      .mockResolvedValueOnce(
        ok({
          tracks: [
            makeSearchResult("file:///unfinished.flac", "Massive Attack"),
          ],
          tidalAvailable: true,
        }),
      );

    const response = await server.inject({
      method: "POST",
      url: "/api/artist-radio/start",
      payload: { artistName: "Radiohead" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) ? parsed["tracksAdded"] : undefined).toBe(2);
    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
  });
});
