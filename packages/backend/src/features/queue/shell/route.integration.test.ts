import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { ok, err } from "@signalform/shared";
import { Server } from "socket.io";
import {
  createLmsClient,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import { createQueueRoute } from "./route.js";
import { setRadioBoundaryIndex } from "../../radio-mode/shell/radio-state.js";
import type { FastifyInstance } from "fastify";

const TEST_LMS_CONFIG = {
  host: "localhost",
  port: 9000,
  playerId: "test-player-id",
  timeout: 1000,
  retryBaseDelayMs: 0,
} as const;

type MockLmsClient = LmsClient & {
  readonly getQueue: ReturnType<typeof vi.fn<LmsClient["getQueue"]>>;
  readonly jumpToTrack: ReturnType<typeof vi.fn<LmsClient["jumpToTrack"]>>;
  readonly removeFromQueue: ReturnType<
    typeof vi.fn<LmsClient["removeFromQueue"]>
  >;
  readonly moveQueueTrack: ReturnType<
    typeof vi.fn<LmsClient["moveQueueTrack"]>
  >;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
  readonly addAlbumToQueue: ReturnType<
    typeof vi.fn<LmsClient["addAlbumToQueue"]>
  >;
  readonly addTidalAlbumToQueue: ReturnType<
    typeof vi.fn<LmsClient["addTidalAlbumToQueue"]>
  >;
  readonly findTidalSearchAlbumId: ReturnType<
    typeof vi.fn<LmsClient["findTidalSearchAlbumId"]>
  >;
};

type MockIo = {
  readonly io: TypedSocketIOServer;
  readonly emit: ReturnType<typeof vi.fn>;
  readonly to: ReturnType<typeof vi.fn>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
  getQueue: vi.fn<LmsClient["getQueue"]>().mockResolvedValue(ok([])),
  jumpToTrack: vi
    .fn<LmsClient["jumpToTrack"]>()
    .mockResolvedValue(ok(undefined)),
  removeFromQueue: vi
    .fn<LmsClient["removeFromQueue"]>()
    .mockResolvedValue(ok(undefined)),
  moveQueueTrack: vi
    .fn<LmsClient["moveQueueTrack"]>()
    .mockResolvedValue(ok(undefined)),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
  addAlbumToQueue: vi
    .fn<LmsClient["addAlbumToQueue"]>()
    .mockResolvedValue(ok(undefined)),
  addTidalAlbumToQueue: vi
    .fn<LmsClient["addTidalAlbumToQueue"]>()
    .mockResolvedValue(ok(undefined)),
  findTidalSearchAlbumId: vi
    .fn<LmsClient["findTidalSearchAlbumId"]>()
    .mockResolvedValue(ok(null)),
});

const createMockIo = (): MockIo => {
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

const resetMockLmsClient = (mockLmsClient: MockLmsClient): void => {
  mockLmsClient.getQueue.mockReset().mockResolvedValue(ok([]));
  mockLmsClient.jumpToTrack.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.removeFromQueue.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.moveQueueTrack.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.addToQueue.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.addAlbumToQueue.mockReset().mockResolvedValue(ok(undefined));
  mockLmsClient.addTidalAlbumToQueue
    .mockReset()
    .mockResolvedValue(ok(undefined));
  mockLmsClient.findTidalSearchAlbumId.mockReset().mockResolvedValue(ok(null));
};

const resetMockIo = (mockIo: MockIo): void => {
  mockIo.emit.mockReset();
  mockIo.to.mockClear();
};

const mockLmsClient = createMockLmsClient();
const mockIo = createMockIo();
const mockEmit = mockIo.emit;

const mockRadioRemovalPolicy = {
  handleRemoval: vi.fn(),
};

const tidalSearchMockClient = createMockLmsClient();

describe("GET /api/queue", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(server, mockLmsClient, mockIo.io, "test-player-id");
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with queue tracks and null radio boundary when radio mode is inactive", async () => {
    const tracks = [
      {
        id: "1",
        position: 1,
        title: "Track 1",
        artist: "Artist",
        album: "Album",
        duration: 240,
        isCurrent: true,
      },
    ];
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    const response = await server.inject({
      method: "GET",
      url: "/api/queue",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      tracks,
      radioBoundaryIndex: null,
    });
  });

  it("returns persisted radio boundary on queue reload after radio mode started", async () => {
    const boundaryTracks = [
      {
        id: "1",
        position: 1,
        title: "User Track",
        artist: "User Artist",
        album: "User Album",
        duration: 240,
        isCurrent: true,
      },
      {
        id: "2",
        position: 2,
        title: "Radio Track",
        artist: "Radio Artist",
        album: "Radio Album",
        duration: 180,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];
    mockLmsClient.getQueue.mockResolvedValue(ok(boundaryTracks));

    mockRadioRemovalPolicy.handleRemoval.mockResolvedValue({
      status: "success",
      tracks: boundaryTracks,
      radioBoundaryIndex: 1,
      tracksAdded: 1,
    });
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));

    const radioServer = Fastify();
    createQueueRoute(
      radioServer,
      mockLmsClient,
      mockIo.io,
      "test-player-id",
      mockRadioRemovalPolicy,
    );
    await radioServer.ready();

    await radioServer.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 1 },
    });

    const response = await radioServer.inject({
      method: "GET",
      url: "/api/queue",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      tracks: boundaryTracks,
      radioBoundaryIndex: 1,
    });

    await radioServer.close();
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/queue",
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
  });
});

describe("POST /api/queue/jump", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(server, mockLmsClient, mockIo.io, "test-player-id");
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 204 when jump succeeds", async () => {
    mockLmsClient.jumpToTrack.mockResolvedValue(ok(undefined));
    // Explicitly mock getQueue to avoid relying on stale mock state from other describe blocks
    mockLmsClient.getQueue.mockResolvedValue(ok([]));
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 5 },
    });
    expect(response.statusCode).toBe(204);
  });

  it("returns 400 when trackIndex is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 400 when trackIndex is negative", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: -1 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when trackIndex exceeds maximum allowed value", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 10000 },
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.jumpToTrack.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 3 },
    });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
    expect(mockIo.to).not.toHaveBeenCalled();
  });

  it("emits player.queue.updated after successful jump", async () => {
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
    mockLmsClient.jumpToTrack.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 2 },
    });

    expect(mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks,
        playerId: "test-player-id",
        timestamp: expect.any(Number),
      }),
    );
  });

  it("does not fail 204 response if queue fetch fails after jump", async () => {
    mockLmsClient.jumpToTrack.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 2 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("POST /api/queue/add", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(server, mockLmsClient, mockIo.io, "test-player-id");
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 204 when track is added to queue", async () => {
    mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "file:///music/track.flac" },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledWith(
      "file:///music/track.flac",
    );
  });

  it("returns 400 when trackUrl has invalid protocol", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "ftp://invalid.example/track.mp3" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  it("returns 400 when trackUrl exceeds maximum length", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "file:///" + "a".repeat(2050) },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
    expect(mockLmsClient.addToQueue).not.toHaveBeenCalled();
  });

  it("emits player.queue.updated after successful add", async () => {
    const tracks = [
      {
        id: "1",
        position: 1,
        title: "T",
        artist: "A",
        album: "B",
        duration: 200,
        isCurrent: false,
      },
    ];
    mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "file:///music/track.flac" },
    });

    expect(mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks,
        playerId: "test-player-id",
        timestamp: expect.any(Number),
      }),
    );
  });

  it("does not fail 204 response if queue fetch fails after add", async () => {
    mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "file:///music/track.flac" },
    });

    expect(response.statusCode).toBe(204);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("returns 400 when trackUrl is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 400 when trackUrl is empty string", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 400 when trackUrl is whitespace only", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "   " },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.addToQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add",
      headers: { "Content-Type": "application/json" },
      payload: { trackUrl: "file:///music/track.flac" },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
  });
});

describe("POST /api/queue/add-album", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(server, mockLmsClient, mockIo.io, "test-player-id");
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("adds local album, returns 204, and emits PLAYER_QUEUE_UPDATED", async () => {
    mockLmsClient.addAlbumToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-album",
      headers: { "Content-Type": "application/json" },
      payload: { albumId: "123" },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.addAlbumToQueue).toHaveBeenCalledWith("123");
    expect(mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({ playerId: "test-player-id" }),
    );
  });

  it("adds Tidal album (isTidalAlbumId: '4.0'), returns 204", async () => {
    mockLmsClient.addTidalAlbumToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-album",
      headers: { "Content-Type": "application/json" },
      payload: { albumId: "4.0" },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.addTidalAlbumToQueue).toHaveBeenCalledWith("4.0");
    expect(mockLmsClient.addAlbumToQueue).not.toHaveBeenCalled();
  });

  it("returns 400 for missing albumId", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-album",
      headers: { "Content-Type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 400 for empty albumId", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-album",
      headers: { "Content-Type": "application/json" },
      payload: { albumId: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 503 when lmsClient.addAlbumToQueue fails", async () => {
    mockLmsClient.addAlbumToQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-album",
      headers: { "Content-Type": "application/json" },
      payload: { albumId: "456" },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
    expect(mockIo.to).not.toHaveBeenCalled();
  });

  it("returns 204 and skips WS emit when getQueue fails after add-album", async () => {
    mockLmsClient.addAlbumToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "queue fetch failed" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-album",
      headers: { "Content-Type": "application/json" },
      payload: { albumId: "789" },
    });

    expect(response.statusCode).toBe(204);
    expect(mockIo.to).not.toHaveBeenCalled();
  });
});

describe("POST /api/queue/add-track-list", () => {
  let server: FastifyInstance;

  const TIDAL_URLS = [
    "tidal://1234.flc",
    "tidal://5678.flc",
    "tidal://9012.flc",
  ] as const;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(server, mockLmsClient, mockIo.io, "test-player-id");
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 204 and calls addToQueue() for each URL", async () => {
    mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-track-list",
      headers: { "Content-Type": "application/json" },
      payload: { urls: [...TIDAL_URLS] },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.addToQueue).toHaveBeenCalledTimes(3);
    expect(mockLmsClient.addToQueue).toHaveBeenNthCalledWith(
      1,
      "tidal://1234.flc",
    );
    expect(mockLmsClient.addToQueue).toHaveBeenNthCalledWith(
      2,
      "tidal://5678.flc",
    );
    expect(mockLmsClient.addToQueue).toHaveBeenNthCalledWith(
      3,
      "tidal://9012.flc",
    );
  });

  it("emits player.queue.updated after successful add-track-list", async () => {
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
    mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "POST",
      url: "/api/queue/add-track-list",
      headers: { "Content-Type": "application/json" },
      payload: { urls: ["tidal://1234.flc"] },
    });

    expect(mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks,
        playerId: "test-player-id",
        timestamp: expect.any(Number),
      }),
    );
  });

  it("returns 400 for empty urls array", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-track-list",
      headers: { "Content-Type": "application/json" },
      payload: { urls: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 400 for missing urls field", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-track-list",
      headers: { "Content-Type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 503 when addToQueue() fails", async () => {
    mockLmsClient.addToQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-track-list",
      headers: { "Content-Type": "application/json" },
      payload: { urls: [...TIDAL_URLS] },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
  });

  it("returns 204 and skips WS emit when getQueue fails after add-track-list", async () => {
    mockLmsClient.addToQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "queue fetch failed" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-track-list",
      headers: { "Content-Type": "application/json" },
      payload: { urls: ["tidal://1234.flc"] },
    });

    expect(response.statusCode).toBe(204);
    expect(mockIo.to).not.toHaveBeenCalled();
  });
});

describe("POST /api/queue/remove", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(
      server,
      mockLmsClient,
      mockIo.io,
      "test-player-id",
      mockRadioRemovalPolicy,
    );
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 204 when queue track removal succeeds", async () => {
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 4 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.removeFromQueue).toHaveBeenCalledWith(4);
  });

  it("returns 400 when trackIndex is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
    expect(mockLmsClient.removeFromQueue).not.toHaveBeenCalled();
  });

  it("returns 400 when trackIndex is negative", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: -1 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
    expect(mockLmsClient.removeFromQueue).not.toHaveBeenCalled();
  });

  it("returns 503 when LMS removal fails", async () => {
    mockLmsClient.removeFromQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 2 },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
    expect(mockIo.to).not.toHaveBeenCalled();
  });

  it("emits player.queue.updated after successful remove", async () => {
    const tracks = [
      {
        id: "2",
        position: 1,
        title: "Remaining Track",
        artist: "A",
        album: "B",
        duration: 200,
        isCurrent: true,
      },
    ];
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 1 },
    });

    expect(mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks,
        playerId: "test-player-id",
        timestamp: expect.any(Number),
      }),
    );
  });

  it("triggers radio replenish for radio-source removal and emits replenished queue with boundary", async () => {
    const preRemovalQueue = [
      {
        id: "user-1",
        position: 1,
        title: "User Track",
        artist: "User Artist",
        album: "User Album",
        duration: 200,
        isCurrent: true,
      },
      {
        id: "radio-1",
        position: 2,
        title: "Radio Seed",
        artist: "Radio Artist",
        album: "Radio Album",
        duration: 210,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];
    const replenishedTracks = [
      {
        id: "user-1",
        position: 1,
        title: "User Track",
        artist: "User Artist",
        album: "User Album",
        duration: 200,
        isCurrent: true,
      },
      {
        id: "radio-2",
        position: 2,
        title: "Fresh Radio Track",
        artist: "Fresh Artist",
        album: "Fresh Album",
        duration: 215,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];

    mockLmsClient.getQueue.mockResolvedValueOnce(ok(preRemovalQueue));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockRadioRemovalPolicy.handleRemoval.mockResolvedValue({
      status: "success",
      tracks: replenishedTracks,
      radioBoundaryIndex: 1,
      tracksAdded: 1,
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 1 },
    });

    expect(response.statusCode).toBe(204);
    // handleRemoval was called with the correct removed track info
    expect(mockRadioRemovalPolicy.handleRemoval).toHaveBeenCalledWith({
      removedTrack: {
        artist: "Radio Artist",
        title: "Radio Seed",
      },
    });
    // The route must emit queue.updated with the radioBoundaryIndex from the replenish result —
    // this verifies the route actually uses the handleRemoval return value, not just calls it
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({ radioBoundaryIndex: 1 }),
    );
  });

  it("preserves radioBoundaryIndex when radio replenish succeeds with radio-service outcome shape", async () => {
    const preRemovalQueue = [
      {
        id: "user-1",
        position: 1,
        title: "User Track",
        artist: "User Artist",
        album: "User Album",
        duration: 200,
        isCurrent: true,
        source: "local" as const,
      },
      {
        id: "radio-1",
        position: 2,
        title: "Radio Seed",
        artist: "Radio Artist",
        album: "Radio Album",
        duration: 210,
        isCurrent: false,
        source: "tidal" as const,
      },
      {
        id: "radio-2",
        position: 3,
        title: "Fresh Radio Track",
        artist: "Fresh Artist",
        album: "Fresh Album",
        duration: 215,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];
    const replenishedTracks = [
      {
        id: "user-1",
        position: 1,
        title: "User Track",
        artist: "User Artist",
        album: "User Album",
        duration: 200,
        isCurrent: true,
        source: "local" as const,
      },
      {
        id: "radio-2",
        position: 2,
        title: "Fresh Radio Track",
        artist: "Fresh Artist",
        album: "Fresh Album",
        duration: 215,
        isCurrent: false,
        source: "tidal" as const,
      },
      {
        id: "radio-3",
        position: 3,
        title: "Replacement Radio Track",
        artist: "Replacement Artist",
        album: "Replacement Album",
        duration: 220,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];

    mockLmsClient.getQueue.mockResolvedValueOnce(ok(preRemovalQueue));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockRadioRemovalPolicy.handleRemoval.mockResolvedValue({
      status: "success",
      postQueueTracks: replenishedTracks,
      preRadioQueueLength: 1,
      tracksAdded: 1,
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 1 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        playerId: "test-player-id",
        tracks: replenishedTracks,
        radioBoundaryIndex: 1,
      }),
    );
  });

  it("preserves the original radio boundary when removing a middle radio track", async () => {
    setRadioBoundaryIndex(2);
    const preRemovalQueue = [
      {
        id: "user-1",
        position: 1,
        title: "Seed Track",
        artist: "Seed Artist",
        album: "Seed Album",
        duration: 200,
        isCurrent: false,
        source: "local" as const,
      },
      {
        id: "user-2",
        position: 2,
        title: "Another User Track",
        artist: "User Artist",
        album: "User Album",
        duration: 220,
        isCurrent: true,
        source: "local" as const,
      },
      {
        id: "radio-1",
        position: 3,
        title: "Radio One",
        artist: "Radio Artist One",
        album: "Radio Album",
        duration: 210,
        isCurrent: false,
        source: "tidal" as const,
      },
      {
        id: "radio-2",
        position: 4,
        title: "Radio Two",
        artist: "Radio Artist Two",
        album: "Radio Album",
        duration: 215,
        isCurrent: false,
        source: "tidal" as const,
      },
      {
        id: "radio-3",
        position: 5,
        title: "Radio Three",
        artist: "Radio Artist Three",
        album: "Radio Album",
        duration: 220,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];
    const replenishedTracks = [
      preRemovalQueue[0],
      preRemovalQueue[1],
      preRemovalQueue[2],
      preRemovalQueue[4],
      {
        id: "radio-4",
        position: 5,
        title: "Radio Four",
        artist: "Radio Artist Four",
        album: "Radio Album",
        duration: 225,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];

    mockLmsClient.getQueue.mockResolvedValueOnce(ok(preRemovalQueue));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockRadioRemovalPolicy.handleRemoval.mockResolvedValue({
      status: "success",
      tracks: replenishedTracks,
      radioBoundaryIndex: 4,
      tracksAdded: 1,
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 3 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockRadioRemovalPolicy.handleRemoval).toHaveBeenCalledWith({
      removedTrack: {
        artist: "Radio Artist Two",
        title: "Radio Two",
      },
      preservedRadioBoundaryIndex: 2,
    });
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        playerId: "test-player-id",
        tracks: replenishedTracks,
        radioBoundaryIndex: 2,
      }),
    );
  });

  it("falls back to plain queue refresh when radio replenish success omits boundary metadata", async () => {
    const preRemovalQueue = [
      {
        id: "radio-1",
        position: 1,
        title: "Radio Seed",
        artist: "Radio Artist",
        album: "Radio Album",
        duration: 210,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];
    const postRemovalQueue = [
      {
        id: "remaining-1",
        position: 1,
        title: "Remaining Track",
        artist: "Remaining Artist",
        album: "Remaining Album",
        duration: 210,
        isCurrent: true,
        source: "tidal" as const,
      },
    ];

    mockLmsClient.getQueue
      .mockResolvedValueOnce(ok(preRemovalQueue))
      .mockResolvedValueOnce(ok(postRemovalQueue));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockRadioRemovalPolicy.handleRemoval.mockResolvedValue({
      status: "success",
      tracksAdded: 1,
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 0 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.getQueue).toHaveBeenCalledTimes(2);
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        playerId: "test-player-id",
        tracks: postRemovalQueue,
      }),
    );
  });

  it("does not trigger radio replenish for local-source removal", async () => {
    const preRemovalQueue = [
      {
        id: "local-1",
        position: 1,
        title: "Local Track",
        artist: "Local Artist",
        album: "Local Album",
        duration: 205,
        isCurrent: false,
        source: "local" as const,
      },
    ];
    const postRemovalQueue = [
      {
        id: "remaining-1",
        position: 1,
        title: "Remaining Track",
        artist: "Remaining Artist",
        album: "Remaining Album",
        duration: 210,
        isCurrent: true,
      },
    ];

    mockLmsClient.getQueue
      .mockResolvedValueOnce(ok(preRemovalQueue))
      .mockResolvedValueOnce(ok(postRemovalQueue));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 0 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockRadioRemovalPolicy.handleRemoval).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks: postRemovalQueue,
        playerId: "test-player-id",
      }),
    );
  });

  it("returns 204 and falls back to plain queue update when radio replenish fails", async () => {
    const preRemovalQueue = [
      {
        id: "radio-1",
        position: 1,
        title: "Radio Seed",
        artist: "Radio Artist",
        album: "Radio Album",
        duration: 210,
        isCurrent: false,
        source: "tidal" as const,
      },
    ];
    const postRemovalQueue: readonly [] = [];

    mockLmsClient.getQueue
      .mockResolvedValueOnce(ok(preRemovalQueue))
      .mockResolvedValueOnce(ok(postRemovalQueue));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockRadioRemovalPolicy.handleRemoval.mockResolvedValue({
      status: "failed",
      reason: "queue-fetch-failed",
      error: "refresh failed",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 0 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockRadioRemovalPolicy.handleRemoval).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks: postRemovalQueue,
        playerId: "test-player-id",
      }),
    );
  });

  it("skips radio replenish when pre-remove radio context fetch fails", async () => {
    mockLmsClient.getQueue
      .mockResolvedValueOnce(
        err({ type: "TimeoutError", message: "LMS connection timeout (5s)" }),
      )
      .mockResolvedValueOnce(ok([]));
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 0 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.removeFromQueue).toHaveBeenCalledWith(0);
    expect(mockRadioRemovalPolicy.handleRemoval).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({ tracks: [], playerId: "test-player-id" }),
    );
  });

  it("returns 204 and skips WS emit when queue refresh fails after remove", async () => {
    mockLmsClient.removeFromQueue.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "queue fetch failed" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/remove",
      headers: { "Content-Type": "application/json" },
      payload: { trackIndex: 1 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("POST /api/queue/reorder", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(mockLmsClient);
    resetMockIo(mockIo);
    setRadioBoundaryIndex(null);
    server = Fastify();
    createQueueRoute(server, mockLmsClient, mockIo.io, "test-player-id");
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 204 when queue reorder succeeds", async () => {
    mockLmsClient.moveQueueTrack.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/reorder",
      headers: { "Content-Type": "application/json" },
      payload: { fromIndex: 4, toIndex: 1 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.moveQueueTrack).toHaveBeenCalledWith(4, 1);
  });

  it("returns 400 when reorder fields are missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/reorder",
      headers: { "Content-Type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
    expect(mockLmsClient.moveQueueTrack).not.toHaveBeenCalled();
  });

  it("returns 400 when reorder indexes are identical", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/reorder",
      headers: { "Content-Type": "application/json" },
      payload: { fromIndex: 2, toIndex: 2 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_INPUT" });
    expect(mockLmsClient.moveQueueTrack).not.toHaveBeenCalled();
  });

  it("returns 503 when LMS reorder fails", async () => {
    mockLmsClient.moveQueueTrack.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/reorder",
      headers: { "Content-Type": "application/json" },
      payload: { fromIndex: 1, toIndex: 3 },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "LMS_UNREACHABLE",
    });
    expect(mockIo.to).not.toHaveBeenCalled();
  });

  it("emits player.queue.updated after successful reorder", async () => {
    const tracks = [
      {
        id: "2",
        position: 1,
        title: "Second Track",
        artist: "A",
        album: "B",
        duration: 200,
        isCurrent: false,
      },
      {
        id: "1",
        position: 2,
        title: "First Track",
        artist: "A",
        album: "B",
        duration: 180,
        isCurrent: true,
      },
    ];
    mockLmsClient.moveQueueTrack.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(ok(tracks));

    await server.inject({
      method: "POST",
      url: "/api/queue/reorder",
      headers: { "Content-Type": "application/json" },
      payload: { fromIndex: 1, toIndex: 0 },
    });

    expect(mockIo.to).toHaveBeenCalledWith("player-updates");
    expect(mockEmit).toHaveBeenCalledWith(
      "player.queue.updated",
      expect.objectContaining({
        tracks,
        playerId: "test-player-id",
        timestamp: expect.any(Number),
      }),
    );
  });

  it("returns 204 and skips WS emit when queue refresh fails after reorder", async () => {
    mockLmsClient.moveQueueTrack.mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockResolvedValue(
      err({ type: "NetworkError", message: "queue fetch failed" }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/reorder",
      headers: { "Content-Type": "application/json" },
      payload: { fromIndex: 1, toIndex: 0 },
    });

    expect(response.statusCode).toBe(204);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ============================================================
// Story 9.6: add-tidal-search-album
// ============================================================
describe("POST /api/queue/add-tidal-search-album (Story 9.6)", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockLmsClient(tidalSearchMockClient);
    resetMockIo(mockIo);
    server = Fastify();
    createQueueRoute(
      server,
      tidalSearchMockClient,
      mockIo.io,
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("AC3: calls addTidalAlbumToQueue when browse ID found", async () => {
    tidalSearchMockClient.findTidalSearchAlbumId.mockResolvedValue(
      ok("7_short n sweet.3.0"),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      payload: {
        albumTitle: "Short n' Sweet",
        artist: "Sabrina Carpenter",
        trackUrls: ["tidal://1234.flc"],
      },
    });

    expect(response.statusCode).toBe(204);
    expect(tidalSearchMockClient.addTidalAlbumToQueue).toHaveBeenCalledWith(
      "7_short n sweet.3.0",
    );
    expect(tidalSearchMockClient.addToQueue).not.toHaveBeenCalled();
  });

  it("AC4: falls back to addToQueue per URL when browse ID not found", async () => {
    tidalSearchMockClient.findTidalSearchAlbumId.mockResolvedValue(ok(null));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      payload: {
        albumTitle: "Non-Existent Album",
        artist: "Some Artist",
        trackUrls: ["tidal://1234.flc", "tidal://5678.flc"],
      },
    });

    expect(response.statusCode).toBe(204);
    expect(tidalSearchMockClient.addTidalAlbumToQueue).not.toHaveBeenCalled();
    expect(tidalSearchMockClient.addToQueue).toHaveBeenCalledTimes(2);
  });

  it("returns 400 for missing albumTitle", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      payload: { artist: "Some Artist", trackUrls: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 503 when browse fails and trackUrls empty", async () => {
    tidalSearchMockClient.findTidalSearchAlbumId.mockResolvedValue(ok(null));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      payload: {
        albumTitle: "Non-Existent Album",
        artist: "Some Artist",
        trackUrls: [],
      },
    });

    expect(response.statusCode).toBe(503);
  });

  it("AC4: falls back to addToQueue per URL when findTidalSearchAlbumId returns LMS error", async () => {
    tidalSearchMockClient.findTidalSearchAlbumId.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS unreachable" }),
    );
    tidalSearchMockClient.addToQueue.mockResolvedValue(ok(undefined));
    tidalSearchMockClient.getQueue.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "POST",
      url: "/api/queue/add-tidal-search-album",
      headers: { "Content-Type": "application/json" },
      payload: {
        albumTitle: "Short n' Sweet",
        artist: "Sabrina Carpenter",
        trackUrls: ["tidal://1234.flc", "tidal://5678.flc"],
      },
    });

    // AC4: browse error → fall back to trackUrls → 204 (not 503)
    expect(response.statusCode).toBe(204);
    expect(tidalSearchMockClient.addToQueue).toHaveBeenCalledTimes(2);
    expect(tidalSearchMockClient.addTidalAlbumToQueue).not.toHaveBeenCalled();
  });
});
