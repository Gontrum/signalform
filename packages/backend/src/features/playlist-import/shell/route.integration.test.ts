import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createPlaylistImportRoute } from "./route.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
  readonly savePlaylist: ReturnType<typeof vi.fn<LmsClient["savePlaylist"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  search: vi
    .fn<LmsClient["search"]>()
    .mockResolvedValue(ok({ tracks: [], tidalAvailable: true })),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
  savePlaylist: vi
    .fn<LmsClient["savePlaylist"]>()
    .mockResolvedValue(ok(undefined)),
});

const parseJson = (body: string): unknown => JSON.parse(body);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const makeSearchResult = (url: string, artist: string): SearchResult => ({
  id: "1",
  title: "Track",
  artist,
  album: "Album",
  url,
  source: "local",
  type: "track",
});

const trackLine = (index: number): string => `Artist ${index} - Track ${index}`;

describe("POST /api/playlists/import", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createPlaylistImportRoute(server, mockLmsClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("resolves all tracks: 200 with imported count and empty missing", async () => {
    mockLmsClient.search.mockImplementation(async (query: string) => {
      const artist = query.split(" ").slice(0, 2).join(" ");
      const url = `file:///${query.replace(/\s+/g, "_")}.flac`;
      return ok({
        tracks: [makeSearchResult(url, artist)],
        tidalAvailable: true,
      });
    });

    const text = [trackLine(1), trackLine(2), trackLine(3)].join("\n");

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["imported"]).toBe(3);
    expect(isRecord(parsed) && parsed["missing"]).toEqual([]);
  });

  it("reports a candidate as missing when its artist doesn't match the search result", async () => {
    mockLmsClient.search.mockImplementation(async (query: string) => {
      if (query.includes("Artist 2")) {
        return ok({
          tracks: [makeSearchResult("file:///wrong.flac", "Someone Else")],
          tidalAvailable: true,
        });
      }
      return ok({
        tracks: [
          makeSearchResult(
            `file:///${query.replace(/\s+/g, "_")}.flac`,
            query.split(" ")[0]!,
          ),
        ],
        tidalAvailable: true,
      });
    });

    const text = [trackLine(1), trackLine(2), trackLine(3)].join("\n");

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["imported"]).toBe(2);
    expect(isRecord(parsed) && parsed["missing"]).toEqual([
      "Artist 2 – Track 2",
    ]);
  });

  it("returns 200 with imported 0 and does not call play/addToQueue/savePlaylist when nothing resolves", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );

    const text = [trackLine(1), trackLine(2)].join("\n");

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text, name: "My Import" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["imported"]).toBe(0);
    expect(isRecord(parsed) && parsed["missing"]).toEqual([
      "Artist 1 – Track 1",
      "Artist 2 – Track 2",
    ]);
    expect(mockLmsClient.play).not.toHaveBeenCalled();
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
    expect(mockLmsClient.savePlaylist).not.toHaveBeenCalled();
  });

  it("returns 200 with imported 0 and skippedLines > 0 for unrecognizable text", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: "just some prose\nmore prose" },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["imported"]).toBe(0);
    expect(
      isRecord(parsed) && typeof parsed["skippedLines"] === "number"
        ? (parsed["skippedLines"] as number)
        : 0,
    ).toBeGreaterThan(0);
    expect(mockLmsClient.search).not.toHaveBeenCalled();
  });

  it("returns 400 for empty text", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when text exceeds 200,000 characters", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: "a".repeat(200_001) },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for limit: 0", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: trackLine(1), limit: 0 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for limit: 501", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: trackLine(1), limit: 501 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("calls savePlaylist with the trimmed name when name is provided", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///track.flac", "Artist 1")],
        tidalAvailable: true,
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: trackLine(1), name: "  My Playlist  " },
    });

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.savePlaylist).toHaveBeenCalledWith("My Playlist");
  });

  it("does not call savePlaylist without a name, but does call play", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///track.flac", "Artist 1")],
        tidalAvailable: true,
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: trackLine(1) },
    });

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.savePlaylist).not.toHaveBeenCalled();
    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when name is empty after trim", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: trackLine(1), name: "   " },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when lmsClient.play fails", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok({
        tracks: [makeSearchResult("file:///track.flac", "Artist 1")],
        tidalAvailable: true,
      }),
    );
    mockLmsClient.play.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: trackLine(1) },
    });

    expect(response.statusCode).toBe(503);
  });

  it("returns 503 when lmsClient.savePlaylist fails after play and addToQueue succeeded", async () => {
    mockLmsClient.search.mockImplementation(async (query: string) => {
      const artist = query.split(" ").slice(0, 2).join(" ");
      const url = `file:///${query.replace(/\s+/g, "_")}.flac`;
      return ok({
        tracks: [makeSearchResult(url, artist)],
        tidalAvailable: true,
      });
    });
    mockLmsClient.savePlaylist.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text: [trackLine(1), trackLine(2)].join("\n"), name: "Mix" },
    });

    expect(response.statusCode).toBe(503);
    expect(mockLmsClient.play).toHaveBeenCalledTimes(1);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(1);
  });

  it("reports only the tracks that reached the queue when an addToQueue fails", async () => {
    mockLmsClient.search.mockImplementation(async (query: string) => {
      const artist = query.split(" ").slice(0, 2).join(" ");
      const url = `file:///${query.replace(/\s+/g, "_")}.flac`;
      return ok({
        tracks: [makeSearchResult(url, artist)],
        tidalAvailable: true,
      });
    });
    mockLmsClient.addToQueue
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(
        err({ type: "NetworkError", message: "Connection refused" }),
      );

    const text = [trackLine(1), trackLine(2), trackLine(3)].join("\n");

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text },
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["imported"]).toBe(2);
    expect(isRecord(parsed) && parsed["missing"]).toEqual([]);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
  });

  it("caps LMS searches at the given limit, not the full track count", async () => {
    mockLmsClient.search.mockResolvedValue(
      ok({ tracks: [], tidalAvailable: true }),
    );

    const text = Array.from({ length: 200 }, (_, i) => trackLine(i + 1)).join(
      "\n",
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playlists/import",
      payload: { text, limit: 50 },
    });

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.search).toHaveBeenCalledTimes(50);
  });
});
