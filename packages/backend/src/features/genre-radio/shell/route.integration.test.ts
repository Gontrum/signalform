import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createGenreRadioRoute } from "./route.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import { createLastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  TagTopTrack,
} from "../../../adapters/lastfm-client/index.js";

vi.mock("../../radio-mode/index.js", () => ({
  setGenreRadioContext: vi.fn(),
  setRadioModeEnabledState: vi.fn(),
}));

import {
  setGenreRadioContext,
  setRadioModeEnabledState,
} from "../../radio-mode/index.js";

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
  readonly getTagTopTracks: ReturnType<
    typeof vi.fn<LastFmClient["getTagTopTracks"]>
  >;
  readonly searchTags: ReturnType<typeof vi.fn<LastFmClient["searchTags"]>>;
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
  getTagTopTracks: vi
    .fn<LastFmClient["getTagTopTracks"]>()
    .mockResolvedValue(ok([])),
  searchTags: vi.fn<LastFmClient["searchTags"]>().mockResolvedValue(ok([])),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const makeTagTrack = (name: string, artist: string): TagTopTrack => ({
  name,
  artist,
  url: `https://last.fm/${artist}/${name}`,
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

describe("POST /api/genre-radio/start", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify({ logger: false });
    createGenreRadioRoute(server, mockLmsClient, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 400 when genreName is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["error"] === "string").toBe(true);
  });

  it("returns 400 when genreName is empty string", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when Last.fm getTagTopTracks fails", async () => {
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(response.statusCode).toBe(503);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe("Last.fm unavailable");
  });

  it("returns 404 when getTagTopTracks returns empty array", async () => {
    mockLastFmClient.getTagTopTracks.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(response.statusCode).toBe(404);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe(
      "No tracks found for genre",
    );
  });

  it("returns 404 when LMS search finds nothing for any track", async () => {
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([
        makeTagTrack("Take Five", "Dave Brubeck"),
        makeTagTrack("So What", "Miles Davis"),
      ]),
    );
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(response.statusCode).toBe(404);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe(
      "No playable tracks found for genre",
    );
  });

  // Use a single track so shuffle has no effect on search mock ordering.
  it("returns 200 with genreName and tracksAdded when tracks found and LMS search succeeds", async () => {
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTrack("Take Five", "Dave Brubeck")]),
    );
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///take_five.flac", "Dave Brubeck")],
        tidalAvailable: true,
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["genreName"]).toBe("jazz");
    expect(isRecord(parsed) && parsed["tracksAdded"]).toBe(1);
  });

  it("calls setGenreRadioContext with genreName and page 2 on success", async () => {
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTrack("Take Five", "Dave Brubeck")]),
    );
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///take_five.flac", "Dave Brubeck")],
        tidalAvailable: true,
      }),
    );

    await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(setGenreRadioContext).toHaveBeenCalledWith({
      genreName: "jazz",
      page: 2,
    });
  });

  it("calls setRadioModeEnabledState(true) on success", async () => {
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([makeTagTrack("Take Five", "Dave Brubeck")]),
    );
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///take_five.flac", "Dave Brubeck")],
        tidalAvailable: true,
      }),
    );

    await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(setRadioModeEnabledState).toHaveBeenCalledWith(true);
  });

  // Use a single-artist mock that always returns a track, then verify play+addToQueue split.
  // With 3 same-artist tracks and mockResolvedValue returning same artist for every call,
  // all 3 resolve successfully regardless of shuffle order.
  it("calls lmsClient.play with first URL and addToQueue with remaining", async () => {
    // All three tracks are by "Dave Brubeck" — the search mock always returns a matching
    // result for "Dave Brubeck", making the test shuffle-invariant.
    mockLastFmClient.getTagTopTracks.mockResolvedValue(
      ok([
        makeTagTrack("Take Five", "Dave Brubeck"),
        makeTagTrack("Blue Rondo", "Dave Brubeck"),
        makeTagTrack("Unsquare Dance", "Dave Brubeck"),
      ]),
    );
    // Return distinct URLs per call so all 3 are added (no dedup rejection).
    const urls = [
      "file:///take_five.flac",
      "file:///blue_rondo.flac",
      "file:///unsquare.flac",
    ];
    let callCount = 0;
    mockLmsClient.search.mockImplementation(async () => {
      const url = urls[callCount % urls.length] ?? urls[0]!;
      callCount++;
      return ok({
        tracks: [makeSearchResult(url, "Dave Brubeck")],
        tidalAvailable: true,
      });
    });

    await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    // play called once with first URL, addToQueue called for the remaining 2
    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
  });
});
