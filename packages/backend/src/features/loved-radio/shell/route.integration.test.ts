import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createLovedRadioRoute } from "./route.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import { createLastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  UserLovedTrack,
} from "../../../adapters/lastfm-client/index.js";

// Mock config loading and radio state — resolveRequestUser stays real.
vi.mock("../../../infrastructure/config/index.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  isConfigured: vi.fn(),
  DEFAULT_CONFIG_PATH: "/tmp/test-config.json",
}));

vi.mock("../../radio-mode/index.js", () => ({
  setLovedRadioContext: vi.fn(),
  setRadioModeEnabledState: vi.fn(),
}));

import { loadConfig } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/service.js";
import {
  setLovedRadioContext,
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
  readonly getUserLovedTracks: ReturnType<
    typeof vi.fn<LastFmClient["getUserLovedTracks"]>
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
  getUserLovedTracks: vi
    .fn<LastFmClient["getUserLovedTracks"]>()
    .mockResolvedValue(ok([])),
});

const parseJson = (body: string): unknown => JSON.parse(body);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const makeConfig = (
  users: AppConfig["users"],
): { readonly ok: true; readonly value: AppConfig } => ({
  ok: true as const,
  value: {
    lmsHost: "localhost",
    lmsPort: 9000,
    playerId: "00:00:00:00:00:00",
    lastFmApiKey: "key",
    fanartApiKey: "",
    language: "en" as const,
    personalRadioEnabled: true,
    users,
    scrobblingEnabled: false,
    personalRadioDiscovery: 50,
  },
});

const makeLovedTrack = (name: string, artist: string): UserLovedTrack => ({
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

describe("POST /api/loved-radio/start", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify({ logger: false });
    createLovedRadioRoute(server, mockLmsClient, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 400 when no user can be resolved", async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
    });

    expect(response.statusCode).toBe(400);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["error"] === "string").toBe(true);
    expect(mockLastFmClient.getUserLovedTracks).not.toHaveBeenCalled();
  });

  it("returns 400 when the resolved user has no lastFmUsername", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester" }]),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
    });

    expect(response.statusCode).toBe(400);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["error"] === "string").toBe(true);
    expect(mockLastFmClient.getUserLovedTracks).not.toHaveBeenCalled();
  });

  it("returns 503 when getUserLovedTracks fails", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester", lastFmUsername: "testuser" }]),
    );
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
    });

    expect(response.statusCode).toBe(503);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe("Last.fm unavailable");
  });

  it("returns 404 when the loved-tracks list is empty", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester", lastFmUsername: "testuser" }]),
    );
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
    });

    expect(response.statusCode).toBe(404);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe("No loved tracks found");
  });

  it("returns 404 when LMS finds no playable tracks", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([{ id: "u1", name: "Tester", lastFmUsername: "testuser" }]),
    );
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([makeLovedTrack("Creep", "Radiohead")]),
    );
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
    });

    expect(response.statusCode).toBe(404);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe(
      "No playable tracks found",
    );
  });

  it("uses the header user's username, plays + enqueues, returns 200 with tracksAdded", async () => {
    vi.mocked(loadConfig).mockReturnValue(
      makeConfig([
        { id: "u1", name: "Tester", lastFmUsername: "testuser" },
        { id: "u2", name: "Other", lastFmUsername: "otheruser" },
      ]),
    );
    // Two tracks by the same artist so the search mock is shuffle-invariant.
    mockLastFmClient.getUserLovedTracks.mockResolvedValue(
      ok([
        makeLovedTrack("Creep", "Radiohead"),
        makeLovedTrack("No Surprises", "Radiohead"),
      ]),
    );
    const urls = ["file:///creep.flac", "file:///no_surprises.flac"];
    let callCount = 0;
    mockLmsClient.search.mockImplementation(async () => {
      const url = urls[callCount % urls.length] ?? urls[0]!;
      callCount++;
      return ok({
        tracks: [makeSearchResult(url, "Radiohead")],
        tidalAvailable: true,
      });
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
      headers: { "x-signalform-user": "u2" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["tracksAdded"]).toBe(2);

    expect(mockLastFmClient.getUserLovedTracks).toHaveBeenCalledWith(
      "otheruser",
      200,
    );
    // First URL is played, remaining are enqueued.
    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);

    expect(setLovedRadioContext).toHaveBeenCalledWith({
      username: "otheruser",
    });
    expect(setRadioModeEnabledState).toHaveBeenCalledWith(true);
  });
});
