/**
 * Playback Route Integration Tests
 *
 * Tests for HTTP endpoint layer (imperative shell).
 * Architecture compliance: NO framework calls in test bodies - only in helpers.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { createPlaybackRoute } from "./route.js";
import { Server } from "socket.io";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
  type LmsError,
} from "../../../adapters/lms-client/index.js";
import { ok, err } from "@signalform/shared";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";

type MockLmsClient = LmsClient & {
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly pause: ReturnType<typeof vi.fn<LmsClient["pause"]>>;
  readonly resume: ReturnType<typeof vi.fn<LmsClient["resume"]>>;
  readonly getStatus: ReturnType<typeof vi.fn<LmsClient["getStatus"]>>;
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
  readonly nextTrack: ReturnType<typeof vi.fn<LmsClient["nextTrack"]>>;
  readonly previousTrack: ReturnType<typeof vi.fn<LmsClient["previousTrack"]>>;
  readonly setVolume: ReturnType<typeof vi.fn<LmsClient["setVolume"]>>;
  readonly getVolume: ReturnType<typeof vi.fn<LmsClient["getVolume"]>>;
  readonly seek: ReturnType<typeof vi.fn<LmsClient["seek"]>>;
  readonly getCurrentTime: ReturnType<
    typeof vi.fn<LmsClient["getCurrentTime"]>
  >;
  readonly playAlbum: ReturnType<typeof vi.fn<LmsClient["playAlbum"]>>;
  readonly playTidalAlbum: ReturnType<
    typeof vi.fn<LmsClient["playTidalAlbum"]>
  >;
  readonly disableRepeat: ReturnType<typeof vi.fn<LmsClient["disableRepeat"]>>;
  readonly getArtistAlbums: ReturnType<
    typeof vi.fn<LmsClient["getArtistAlbums"]>
  >;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
  readonly getQueue: ReturnType<typeof vi.fn<LmsClient["getQueue"]>>;
  readonly findTidalSearchAlbumId: ReturnType<
    typeof vi.fn<LmsClient["findTidalSearchAlbumId"]>
  >;
};

type MockPlaybackIo = {
  readonly io: TypedSocketIOServer;
  readonly emit: ReturnType<typeof vi.fn>;
  readonly to: ReturnType<typeof vi.fn>;
};

const mockLmsConfig: LmsConfig = {
  host: "192.168.178.39",
  port: 9000,
  playerId: "test-player-id",
  timeout: 5000,
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(mockLmsConfig),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  pause: vi.fn<LmsClient["pause"]>().mockResolvedValue(ok(undefined)),
  resume: vi.fn<LmsClient["resume"]>().mockResolvedValue(ok(undefined)),
  getStatus: vi.fn<LmsClient["getStatus"]>(),
  search: vi.fn<LmsClient["search"]>(),
  nextTrack: vi.fn<LmsClient["nextTrack"]>().mockResolvedValue(ok(undefined)),
  previousTrack: vi
    .fn<LmsClient["previousTrack"]>()
    .mockResolvedValue(ok(undefined)),
  setVolume: vi.fn<LmsClient["setVolume"]>().mockResolvedValue(ok(undefined)),
  getVolume: vi.fn<LmsClient["getVolume"]>(),
  seek: vi.fn<LmsClient["seek"]>().mockResolvedValue(ok(undefined)),
  getCurrentTime: vi.fn<LmsClient["getCurrentTime"]>(),
  playAlbum: vi.fn<LmsClient["playAlbum"]>().mockResolvedValue(ok(undefined)),
  playTidalAlbum: vi
    .fn<LmsClient["playTidalAlbum"]>()
    .mockResolvedValue(ok(undefined)),
  disableRepeat: vi
    .fn<LmsClient["disableRepeat"]>()
    .mockResolvedValue(ok(undefined)),
  getArtistAlbums: vi.fn<LmsClient["getArtistAlbums"]>(),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
  getQueue: vi.fn<LmsClient["getQueue"]>().mockResolvedValue(ok([])),
  findTidalSearchAlbumId: vi
    .fn<LmsClient["findTidalSearchAlbumId"]>()
    .mockResolvedValue(ok(null)),
});

const resetMockLmsClient = (mockClient: MockLmsClient): void => {
  mockClient.play.mockReset().mockResolvedValue(ok(undefined));
  mockClient.pause.mockReset().mockResolvedValue(ok(undefined));
  mockClient.resume.mockReset().mockResolvedValue(ok(undefined));
  mockClient.getStatus.mockReset();
  mockClient.search.mockReset();
  mockClient.nextTrack.mockReset().mockResolvedValue(ok(undefined));
  mockClient.previousTrack.mockReset().mockResolvedValue(ok(undefined));
  mockClient.setVolume.mockReset().mockResolvedValue(ok(undefined));
  mockClient.getVolume.mockReset();
  mockClient.seek.mockReset().mockResolvedValue(ok(undefined));
  mockClient.getCurrentTime.mockReset();
  mockClient.playAlbum.mockReset().mockResolvedValue(ok(undefined));
  mockClient.playTidalAlbum.mockReset().mockResolvedValue(ok(undefined));
  mockClient.disableRepeat.mockReset().mockResolvedValue(ok(undefined));
  mockClient.getArtistAlbums.mockReset();
  mockClient.addToQueue.mockReset().mockResolvedValue(ok(undefined));
  mockClient.getQueue.mockReset().mockResolvedValue(ok([]));
  mockClient.findTidalSearchAlbumId.mockReset().mockResolvedValue(ok(null));
};

const createMockPlaybackIo = (): MockPlaybackIo => {
  const io = new Server();
  const emit = vi.fn();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockImplementation((event, ...args) => {
    emit(event, ...args);
    return true;
  });
  const to = vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return { io, emit, to };
};

const resetMockPlaybackIo = (mockIo: MockPlaybackIo): void => {
  mockIo.emit.mockReset();
  mockIo.to.mockClear();
};

const mockLmsClient = createMockLmsClient();
const mockPlaybackIo = createMockPlaybackIo();
const mockPlaybackEmit = mockPlaybackIo.emit;

// =============================================================================
// SHARED HELPER FUNCTIONS - Used across all test suites
// =============================================================================

// THEN helpers - Verify outcomes
// -----------------------------------------------------------------------------

const thenResponseStatusIs = async (
  response: LightMyRequestResponse,
  expectedStatus: number,
): Promise<void> => {
  expect(response.statusCode).toBe(expectedStatus);
};

const thenResponseBodyIsEmpty = async (
  response: LightMyRequestResponse,
): Promise<void> => {
  expect(response.json()).toEqual({});
};

const thenResponseContainsError = async (
  response: LightMyRequestResponse,
  errorType: string,
): Promise<void> => {
  const body = response.json() as { readonly error?: string };
  expect(body.error).toBe(errorType);
};

const thenResponseContainsMessage = async (
  response: LightMyRequestResponse,
  messageSubstring: string,
): Promise<void> => {
  const body = response.json() as { readonly message?: string };
  expect(body.message).toContain(messageSubstring);
};

const thenResponseTimeIsUnder = async (
  duration: number,
  maxMs: number,
): Promise<void> => {
  expect(duration).toBeLessThan(maxMs);
};

describe("POST /api/playback/play - Integration Tests", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    resetMockLmsClient(mockLmsClient);
    resetMockPlaybackIo(mockPlaybackIo);
    server = Fastify({ logger: false });
    createPlaybackRoute(
      server,
      mockLmsClient,
      mockLmsConfig,
      mockPlaybackIo.io,
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  describe("Successful playback initiation", () => {
    it("returns 200 when track plays successfully", async () => {
      await givenLmsAcceptsPlayCommand();

      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/breathe.flac",
      });

      await thenResponseStatusIs(response, 200);
      await thenResponseBodyIsEmpty(response);
    });

    it("calls LMS client play() method with correct URL", async () => {
      await givenLmsAcceptsPlayCommand();

      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/track.flac",
      });

      await thenLmsPlayWasCalledWith("file:///music/track.flac");
      await thenResponseStatusIs(response, 200);
    });

    it("handles URLs with special characters", async () => {
      await givenLmsAcceptsPlayCommand();

      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/Pink Floyd - Breathe.flac",
      });

      await thenResponseStatusIs(response, 200);
    });
  });

  describe("Invalid track URL validation", () => {
    it("returns 400 for empty track URL", async () => {
      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "",
      });

      await thenResponseStatusIs(response, 400);
      await thenResponseContainsError(response, "INVALID_TRACK_URL");
    });

    it("returns 400 for missing trackUrl field", async () => {
      const response = await whenPostingPlaybackRequest(server, {});

      await thenResponseStatusIs(response, 400);
      await thenResponseContainsError(response, "INVALID_TRACK_URL");
    });

    it("returns 400 for malformed URL (no protocol)", async () => {
      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "not-a-valid-url",
      });

      await thenResponseStatusIs(response, 400);
      await thenResponseContainsError(response, "INVALID_TRACK_URL");
      await thenResponseContainsMessage(response, "Invalid track URL format");
    });

    it("returns 400 for whitespace-only URL", async () => {
      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "   \t\n  ",
      });

      await thenResponseStatusIs(response, 400);
      await thenResponseContainsError(response, "INVALID_TRACK_URL");
    });
  });

  describe("LMS connection errors", () => {
    it("returns 503 when LMS is unreachable (network error)", async () => {
      await givenLmsIsUnreachable();

      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/track.flac",
      });

      await thenResponseStatusIs(response, 503);
      await thenResponseContainsError(response, "LMS_UNREACHABLE");
      await thenResponseContainsMessage(
        response,
        "Cannot connect to music server",
      );
    });

    it("returns 503 when LMS times out", async () => {
      await givenLmsTimesOut();

      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/track.flac",
      });

      await thenResponseStatusIs(response, 503);
      await thenResponseContainsError(response, "LMS_TIMEOUT");
      await thenResponseContainsMessage(response, "did not respond");
    });

    it("returns 500 when LMS returns API error", async () => {
      await givenLmsReturnsApiError("Player not found");

      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/track.flac",
      });

      await thenResponseStatusIs(response, 500);
      await thenResponseContainsError(response, "PLAYBACK_FAILED");
    });
  });

  describe("HTTP endpoint validation", () => {
    it("rejects GET requests with 404", async () => {
      const response = await whenGettingPlaybackEndpoint(server);

      await thenResponseStatusIs(response, 404);
    });
  });

  describe("Performance requirements (NFR1: < 200ms)", () => {
    it("responds within 200ms for successful play command", async () => {
      await givenLmsAcceptsPlayCommand();

      const startTime = Date.now();
      const response = await whenPostingPlaybackRequest(server, {
        trackUrl: "file:///music/track.flac",
      });
      const duration = Date.now() - startTime;

      await thenResponseStatusIs(response, 200);
      await thenResponseTimeIsUnder(duration, 200);
    });
  });

  // =============================================================================
  // HELPER FUNCTIONS - Test framework code isolated here
  // =============================================================================

  // GIVEN helpers - Setup preconditions
  // -----------------------------------------------------------------------------

  const givenLmsAcceptsPlayCommand = async (): Promise<void> => {
    mockLmsClient.play.mockResolvedValue(ok(undefined));
  };

  const givenLmsIsUnreachable = async (): Promise<void> => {
    const error: LmsError = {
      type: "NetworkError",
      message: "Cannot connect to music server",
    };
    mockLmsClient.play.mockResolvedValue(err(error));
  };

  const givenLmsTimesOut = async (): Promise<void> => {
    const error: LmsError = {
      type: "TimeoutError",
      message: "LMS did not respond in time",
    };
    mockLmsClient.play.mockResolvedValue(err(error));
  };

  const givenLmsReturnsApiError = async (message: string): Promise<void> => {
    const error: LmsError = {
      type: "LmsApiError",
      code: -32000,
      message,
    };
    mockLmsClient.play.mockResolvedValue(err(error));
  };

  // WHEN helpers - Execute actions
  // -----------------------------------------------------------------------------

  const whenPostingPlaybackRequest = async (
    server: FastifyInstance,
    body: { readonly trackUrl?: string },
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "POST",
      url: "/api/playback/play",
      payload: body,
    });
  };

  const whenGettingPlaybackEndpoint = async (
    server: FastifyInstance,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "GET",
      url: "/api/playback/play",
    });
  };

  // THEN helpers - Verify outcomes (test-suite specific)
  // -----------------------------------------------------------------------------

  const thenLmsPlayWasCalledWith = async (
    expectedUrl: string,
  ): Promise<void> => {
    expect(mockLmsClient.play).toHaveBeenCalledWith(expectedUrl);
  };
});

describe("POST /api/playback/play-album - Integration Tests", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    resetMockLmsClient(mockLmsClient);
    resetMockPlaybackIo(mockPlaybackIo);
    server = Fastify({ logger: false });
    createPlaybackRoute(
      server,
      mockLmsClient,
      mockLmsConfig,
      mockPlaybackIo.io,
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  describe("Successful album playback", () => {
    it("returns 200 when album plays successfully", async () => {
      const response = await whenPostingToPlayAlbum(server, { albumId: "42" });

      await thenResponseStatusIs(response, 200);
      await thenResponseBodyIsEmpty(response);
    });

    it("passes trimmed albumId to lmsClient.playAlbum", async () => {
      await whenPostingToPlayAlbum(server, { albumId: "  42  " });

      expect(mockLmsClient.playAlbum).toHaveBeenCalledWith("42");
    });

    // Story 8.7: AC1 — Tidal LibraryView albumId "4.0" routes to playTidalAlbum
    it("AC1: returns 200 for Tidal LibraryView albumId '4.0' via playTidalAlbum", async () => {
      const response = await whenPostingToPlayAlbum(server, { albumId: "4.0" });

      await thenResponseStatusIs(response, 200);
      expect(mockLmsClient.playTidalAlbum).toHaveBeenCalledWith("4.0");
      expect(mockLmsClient.playAlbum).not.toHaveBeenCalled();
      expect(mockLmsClient.disableRepeat).toHaveBeenCalled();
    });

    // Story 8.7: AC2 — Tidal ArtistDetailView albumId "6.0.1.0" routes to playTidalAlbum
    it("AC2: returns 200 for Tidal artist-browse albumId '6.0.1.0' via playTidalAlbum", async () => {
      const response = await whenPostingToPlayAlbum(server, {
        albumId: "6.0.1.0",
      });

      await thenResponseStatusIs(response, 200);
      expect(mockLmsClient.playTidalAlbum).toHaveBeenCalledWith("6.0.1.0");
      expect(mockLmsClient.playAlbum).not.toHaveBeenCalled();
      expect(mockLmsClient.disableRepeat).toHaveBeenCalled();
    });

    // Story 8.9 AC1/AC3: Search-artist album IDs (e.g. "7_sabrina carpenter.2.0.1.4") use playTidalAlbum
    it("AC1/AC3: search-artist album ID '7_query.2.0.1.4' routes to playTidalAlbum", async () => {
      const response = await whenPostingToPlayAlbum(server, {
        albumId: "7_sabrina carpenter.2.0.1.4",
      });

      await thenResponseStatusIs(response, 200);
      expect(mockLmsClient.playTidalAlbum).toHaveBeenCalledWith(
        "7_sabrina carpenter.2.0.1.4",
      );
      expect(mockLmsClient.playAlbum).not.toHaveBeenCalled();
    });

    // Story 8.9 AC2: Featured album IDs (e.g. "1.0.1.0") use playTidalAlbum
    it("AC2: featured album ID '1.0.1.0' routes to playTidalAlbum", async () => {
      const response = await whenPostingToPlayAlbum(server, {
        albumId: "1.0.1.0",
      });

      await thenResponseStatusIs(response, 200);
      expect(mockLmsClient.playTidalAlbum).toHaveBeenCalledWith("1.0.1.0");
      expect(mockLmsClient.playAlbum).not.toHaveBeenCalled();
    });

    // Story 8.7: AC4 regression — local numeric albumId still uses playAlbum
    it("AC4: local numeric albumId uses playAlbum (not playTidalAlbum)", async () => {
      await whenPostingToPlayAlbum(server, { albumId: "42" });

      expect(mockLmsClient.playAlbum).toHaveBeenCalledWith("42");
      expect(mockLmsClient.playTidalAlbum).not.toHaveBeenCalled();
    });
  });

  describe("Validation errors", () => {
    it("returns 400 for missing albumId field", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/playback/play-album",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      await thenResponseStatusIs(response, 400);
      await thenResponseContainsError(response, "INVALID_ALBUM_ID");
    });

    it("returns 400 for empty albumId string", async () => {
      const response = await whenPostingToPlayAlbum(server, { albumId: "" });

      await thenResponseStatusIs(response, 400);
    });
  });

  describe("LMS errors during playAlbum", () => {
    it("returns 503 when LMS is unreachable during album load", async () => {
      await givenLmsPlayAlbumFails("NetworkError", "Connection refused");

      const response = await whenPostingToPlayAlbum(server, { albumId: "42" });

      await thenResponseStatusIs(response, 503);
    });

    it("returns 503 when LMS times out during album load", async () => {
      await givenLmsPlayAlbumFails(
        "TimeoutError",
        "LMS connection timeout (5s)",
      );

      const response = await whenPostingToPlayAlbum(server, { albumId: "42" });

      await thenResponseStatusIs(response, 503);
    });

    it("returns error message containing album context", async () => {
      await givenLmsPlayAlbumFails("NetworkError", "Connection refused");

      const response = await whenPostingToPlayAlbum(server, { albumId: "42" });

      await thenResponseContainsMessage(
        response,
        "Cannot connect to music server",
      );
    });
  });

  // Helper functions for play-album tests
  const whenPostingToPlayAlbum = async (
    server: FastifyInstance,
    body: { readonly albumId: string },
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "POST",
      url: "/api/playback/play-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  const givenLmsPlayAlbumFails = async (
    errorType: "NetworkError" | "TimeoutError",
    message: string,
  ): Promise<void> => {
    const error: LmsError = { type: errorType, message };
    mockLmsClient.playAlbum.mockResolvedValue(err(error));
  };
});

describe("POST /api/playback/play-track-list - Integration Tests", () => {
  let server: FastifyInstance;

  const TIDAL_URLS = [
    "tidal://1234.flc",
    "tidal://5678.flc",
    "tidal://9012.flc",
  ] as const;

  beforeEach(async () => {
    resetMockLmsClient(mockLmsClient);
    resetMockPlaybackIo(mockPlaybackIo);
    server = Fastify({ logger: false });
    createPlaybackRoute(
      server,
      mockLmsClient,
      mockLmsConfig,
      mockPlaybackIo.io,
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  it("returns 204 and calls play() with first URL, addToQueue() with rest", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [...TIDAL_URLS] }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.play).toHaveBeenCalledWith("tidal://1234.flc");
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(2);
    expect(mockLmsClient.addToQueue).toHaveBeenNthCalledWith(
      1,
      "tidal://5678.flc",
    );
    expect(mockLmsClient.addToQueue).toHaveBeenNthCalledWith(
      2,
      "tidal://9012.flc",
    );
  });

  it("returns 204 and calls play() only when single URL provided", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: ["tidal://1234.flc"] }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.play).toHaveBeenCalledWith("tidal://1234.flc");
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  it("returns 400 for empty urls array", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [] }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for missing urls field", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when urls contains non-string elements", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [123, "tidal://abc.flc"] }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when play() fails", async () => {
    mockLmsClient.play.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [...TIDAL_URLS] }),
    });

    expect(response.statusCode).toBe(503);
  });

  it("returns 503 when addToQueue() fails mid-sequence", async () => {
    mockLmsClient.addToQueue
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValue(
        err({ type: "NetworkError", message: "LMS unreachable" }),
      );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [...TIDAL_URLS] }),
    });

    expect(response.statusCode).toBe(503);
  });

  it("does not call addToQueue() when only one URL is provided", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: ["tidal://1234.flc"] }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  it("emits player.queue.updated after successful play-track-list", async () => {
    const tracks = [
      {
        id: "1",
        position: 1,
        title: "T",
        artist: "A",
        album: "B",
        duration: 200,
        isCurrent: true,
      },
    ];
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: ["tidal://1234.flc"] }),
    });

    expect(mockPlaybackIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockPlaybackEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks,
        playerId: "test-player-id",
        timestamp: expect.any(Number),
      }),
    );
  });

  it("returns 204 and skips WS emit when getQueue fails after play-track-list", async () => {
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "queue fetch failed" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-track-list",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: ["tidal://1234.flc"] }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockPlaybackIo.to).not.toHaveBeenCalled();
  });
});

describe("POST /api/playback/play-tidal-search-album - Integration Tests (Story 9.6)", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    resetMockLmsClient(mockLmsClient);
    resetMockPlaybackIo(mockPlaybackIo);
    server = Fastify({ logger: false });
    createPlaybackRoute(
      server,
      mockLmsClient,
      mockLmsConfig,
      mockPlaybackIo.io,
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  it("AC1: returns 204 and calls playTidalAlbum when browse ID found", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(
      ok("7_short n sweet.3.0"),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumTitle: "Short n' Sweet",
        artist: "Sabrina Carpenter",
        trackUrls: ["tidal://1234.flc"],
      }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.findTidalSearchAlbumId).toHaveBeenCalledWith(
      "Short n' Sweet",
      "Sabrina Carpenter",
    );
    expect(mockLmsClient.playTidalAlbum).toHaveBeenCalledWith(
      "7_short n sweet.3.0",
    );
    expect(mockLmsClient.play).not.toHaveBeenCalled();
  });

  it("AC2: falls back to trackUrls when browse ID not found", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(ok(null));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumTitle: "Non-Existent Album",
        artist: "Some Artist",
        trackUrls: ["tidal://1234.flc", "tidal://5678.flc"],
      }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.playTidalAlbum).not.toHaveBeenCalled();
    expect(mockLmsClient.play).toHaveBeenCalledWith("tidal://1234.flc");
    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith("tidal://5678.flc");
  });

  it("returns 400 for missing albumTitle", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist: "Some Artist", trackUrls: [] }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when browse ID not found and trackUrls is empty", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(ok(null));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumTitle: "Non-Existent Album",
        artist: "Some Artist",
        trackUrls: [],
      }),
    });

    expect(response.statusCode).toBe(503);
  });

  it("AC4: falls back to trackUrls when findTidalSearchAlbumId returns LMS error", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumTitle: "Short n' Sweet",
        artist: "Sabrina Carpenter",
        trackUrls: ["tidal://1234.flc"],
      }),
    });

    // AC4: browse error → fall back to trackUrls → 204 (not 503)
    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.play).toHaveBeenCalledWith("tidal://1234.flc");
    expect(mockLmsClient.playTidalAlbum).not.toHaveBeenCalled();
  });

  it("returns 503 when playTidalAlbum fails", async () => {
    mockLmsClient.findTidalSearchAlbumId.mockResolvedValue(
      ok("7_short n sweet.3.0"),
    );
    mockLmsClient.playTidalAlbum.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumTitle: "Short n' Sweet",
        artist: "Sabrina Carpenter",
        trackUrls: ["tidal://1234.flc"],
      }),
    });

    expect(response.statusCode).toBe(503);
  });
});

// =============================================================================
// Simple transport controls: next, previous, pause, resume
// =============================================================================

const makeTransportServer = async (): Promise<FastifyInstance> => {
  resetMockLmsClient(mockLmsClient);
  resetMockPlaybackIo(mockPlaybackIo);
  const s = Fastify({ logger: false });
  createPlaybackRoute(
    s,
    mockLmsClient,
    mockLmsConfig,
    mockPlaybackIo.io,
    "test-player-id",
  );
  await s.ready();
  return s;
};

describe("POST /api/playback/next", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with empty body on success", async () => {
    mockLmsClient.nextTrack.mockResolvedValue(ok(undefined));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/next",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
  });

  it("returns 503 with LMS_UNREACHABLE when LMS is unreachable", async () => {
    mockLmsClient.nextTrack.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/next",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });

  it("returns 503 with LMS_TIMEOUT when LMS times out", async () => {
    mockLmsClient.nextTrack.mockResolvedValue(
      err({ type: "TimeoutError", message: "Request timed out" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/next",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_TIMEOUT",
    );
  });
});

describe("POST /api/playback/previous", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with empty body on success", async () => {
    mockLmsClient.previousTrack.mockResolvedValue(ok(undefined));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/previous",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
  });

  it("returns 503 with LMS_UNREACHABLE when LMS is unreachable", async () => {
    mockLmsClient.previousTrack.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/previous",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });

  it("returns 503 with LMS_TIMEOUT when LMS times out", async () => {
    mockLmsClient.previousTrack.mockResolvedValue(
      err({ type: "TimeoutError", message: "timed out" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/previous",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_TIMEOUT",
    );
  });
});

describe("POST /api/playback/pause", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with empty body on success", async () => {
    mockLmsClient.pause.mockResolvedValue(ok(undefined));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/pause",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.pause.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/pause",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});

describe("POST /api/playback/resume", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with empty body on success", async () => {
    mockLmsClient.resume.mockResolvedValue(ok(undefined));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/resume",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.resume.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/resume",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});

// =============================================================================
// Volume
// =============================================================================

describe("POST /api/playback/volume", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with empty body when volume is set successfully", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/volume",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 65 }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
    expect(mockLmsClient.setVolume).toHaveBeenCalledWith(65);
  });

  it("returns 400 when level is missing from body", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/volume",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("returns 400 when level exceeds 100", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/volume",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 101 }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when level is negative", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/volume",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: -1 }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.setVolume.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/volume",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 50 }),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});

describe("GET /api/playback/volume", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with current volume level", async () => {
    mockLmsClient.getVolume.mockResolvedValue(ok(72));

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/volume",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ readonly level: number }>().level).toBe(72);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getVolume.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/volume",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});

// =============================================================================
// Seek and time
// =============================================================================

describe("POST /api/playback/seek", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with empty body when seek is successful", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/seek",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seconds: 90 }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
    expect(mockLmsClient.seek).toHaveBeenCalledWith(90);
  });

  it("returns 400 when seconds is negative", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/seek",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seconds: -1 }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("returns 400 when seconds field is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/seek",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.seek.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/seek",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seconds: 90 }),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});

describe("GET /api/playback/time", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with current playback position in seconds", async () => {
    mockLmsClient.getCurrentTime.mockResolvedValue(ok(137.5));

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/time",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ readonly seconds: number }>().seconds).toBe(137.5);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getCurrentTime.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/time",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});

// =============================================================================
// Cover art proxy
// =============================================================================

describe("GET /api/playback/cover", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 400 when src param is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/playback/cover",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "INVALID_COVER_URL",
    );
  });

  it("returns 400 when src is not a valid absolute URL", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/playback/cover?src=not-a-url",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "INVALID_COVER_URL",
    );
  });

  it("returns 400 when src targets a different host than configured LMS", async () => {
    // mockLmsConfig.host = "192.168.178.39", port = 9000
    const response = await server.inject({
      method: "GET",
      url: "/api/playback/cover?src=http://evil.example.com/cover.jpg",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "INVALID_COVER_URL",
    );
  });

  it("returns 400 when src targets correct host but wrong port", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/playback/cover?src=http://192.168.178.39:8080/cover.jpg",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "INVALID_COVER_URL",
    );
  });
});

// =============================================================================
// Playback status
// =============================================================================

describe("GET /api/playback/status", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    server = await makeTransportServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with status=playing and currentTrack when LMS is playing", async () => {
    mockLmsClient.getStatus.mockResolvedValue(
      ok({
        mode: "play" as const,
        time: 42,
        duration: 240,
        volume: 70,
        queuePreview: [],
        currentTrack: {
          id: "123",
          title: "Money",
          artist: "Pink Floyd",
          album: "Dark Side of the Moon",
          url: "file:///music/money.flac",
          source: "local" as const,
          coverArtUrl: undefined,
          type: "track" as const,
        },
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/status",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      readonly status: string;
      readonly currentTime: number;
      readonly currentTrack: { readonly title: string };
    }>();
    expect(body.status).toBe("playing");
    expect(body.currentTime).toBe(42);
    expect(body.currentTrack.title).toBe("Money");
  });

  it("maps LMS mode 'pause' to status 'paused'", async () => {
    mockLmsClient.getStatus.mockResolvedValue(
      ok({
        mode: "pause" as const,
        time: 10,
        duration: 240,
        volume: 70,
        queuePreview: [],
        currentTrack: null,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ readonly status: string }>().status).toBe("paused");
  });

  it("maps LMS mode 'stop' to status 'stopped'", async () => {
    mockLmsClient.getStatus.mockResolvedValue(
      ok({
        mode: "stop" as const,
        time: 0,
        duration: 0,
        volume: 70,
        queuePreview: [],
        currentTrack: null,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ readonly status: string }>().status).toBe("stopped");
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getStatus.mockResolvedValue(
      err({ type: "NetworkError", message: "ECONNREFUSED" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/playback/status",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ readonly error: string }>().error).toBe(
      "LMS_UNREACHABLE",
    );
  });
});
