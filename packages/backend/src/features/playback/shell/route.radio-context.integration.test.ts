import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { ok, err } from "@signalform/shared";
import { createPlaybackRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
  type LmsError,
} from "../../../adapters/lms-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import {
  getRadioQueueState,
  resetRadioRuntimeState,
  setGenreRadioContext,
  setLovedRadioContext,
  setPersonalRadioContext,
  setRadioRecentArtists,
} from "../../radio-mode/shell/radio-state.js";

type MockLmsClient = LmsClient & {
  readonly play: ReturnType<typeof vi.fn<LmsClient["play"]>>;
  readonly playAlbum: ReturnType<typeof vi.fn<LmsClient["playAlbum"]>>;
  readonly playTidalAlbum: ReturnType<
    typeof vi.fn<LmsClient["playTidalAlbum"]>
  >;
  readonly addToQueue: ReturnType<typeof vi.fn<LmsClient["addToQueue"]>>;
  readonly getQueue: ReturnType<typeof vi.fn<LmsClient["getQueue"]>>;
  readonly nextTrack: ReturnType<typeof vi.fn<LmsClient["nextTrack"]>>;
};

const mockLmsConfig: LmsConfig = {
  host: "192.168.178.39",
  port: 9000,
  playerId: "test-player-id",
  timeout: 5000,
};

const unreachableLms: LmsError = {
  type: "NetworkError",
  message: "ECONNREFUSED",
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(mockLmsConfig),
  play: vi.fn<LmsClient["play"]>(),
  playAlbum: vi.fn<LmsClient["playAlbum"]>(),
  playTidalAlbum: vi.fn<LmsClient["playTidalAlbum"]>(),
  addToQueue: vi.fn<LmsClient["addToQueue"]>(),
  getQueue: vi.fn<LmsClient["getQueue"]>(),
  nextTrack: vi.fn<LmsClient["nextTrack"]>(),
});

const createMockIo = (): TypedSocketIOServer => {
  const io = new Server();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockReturnValue(true);
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return io;
};

const genreContext = { genreName: "punk", page: 3 };
const personalContext = {
  username: "testuser",
  seedArtists: ["Misfits"],
  neighbours: [],
  cycle: 1,
};
const lovedContext = { username: "testuser" };

type PlayEndpoint = {
  readonly url: string;
  readonly validPayload: Record<string, unknown>;
  readonly successStatus: number;
  readonly invalidPayload: Record<string, unknown>;
  readonly invalidStatus: number;
  readonly failLms: (client: MockLmsClient) => void;
};

const playEndpoints: readonly PlayEndpoint[] = [
  {
    url: "/api/playback/play",
    validPayload: { trackUrl: "file:///music/dreams.flac" },
    successStatus: 200,
    invalidPayload: { trackUrl: "" },
    invalidStatus: 400,
    failLms: (client) => client.play.mockResolvedValue(err(unreachableLms)),
  },
  {
    url: "/api/playback/play-album",
    validPayload: { albumId: "42" },
    successStatus: 200,
    invalidPayload: { albumId: "" },
    invalidStatus: 400,
    failLms: (client) =>
      client.playAlbum.mockResolvedValue(err(unreachableLms)),
  },
  {
    url: "/api/playback/play-track-list",
    validPayload: {
      urls: ["file:///music/dreams.flac", "file:///music/rhiannon.flac"],
    },
    successStatus: 204,
    invalidPayload: { urls: [] },
    invalidStatus: 400,
    failLms: (client) => client.play.mockResolvedValue(err(unreachableLms)),
  },
  {
    url: "/api/playback/play-tidal-search-album",
    validPayload: {
      trackUrls: ["tidal://1.flc", "tidal://2.flc"],
    },
    successStatus: 204,
    invalidPayload: { trackUrls: [] },
    invalidStatus: 503,
    failLms: (client) => client.play.mockResolvedValue(err(unreachableLms)),
  },
];

describe("Playback routes and the radio mode contexts", () => {
  const mockLmsClient = createMockLmsClient();
  const mockIo = createMockIo();
  let server: FastifyInstance;

  const post = async (
    url: string,
    payload?: Record<string, unknown>,
  ): Promise<number> => {
    const response = await server.inject({ method: "POST", url, payload });
    return response.statusCode;
  };

  const expectContextsKept = (): void => {
    const state = getRadioQueueState();
    expect(state.genreRadioContext).toEqual(genreContext);
    expect(state.personalRadioContext).toEqual(personalContext);
    expect(state.lovedRadioContext).toEqual(lovedContext);
  };

  beforeEach(async () => {
    resetRadioRuntimeState();
    setGenreRadioContext(genreContext);
    setPersonalRadioContext(personalContext);
    setLovedRadioContext(lovedContext);
    setRadioRecentArtists(["Fleetwood Mac"]);
    mockLmsClient.play.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.playAlbum.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.playTidalAlbum.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.addToQueue.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.getQueue.mockReset().mockResolvedValue(ok([]));
    mockLmsClient.nextTrack.mockReset().mockResolvedValue(ok(undefined));
    server = Fastify({ logger: false });
    createPlaybackRoute(
      server,
      mockLmsClient,
      mockLmsConfig,
      mockIo,
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    resetRadioRuntimeState();
  });

  describe.each(playEndpoints)("POST $url", (endpoint) => {
    it("clears all three contexts once LMS started playing", async () => {
      expect(await post(endpoint.url, endpoint.validPayload)).toBe(
        endpoint.successStatus,
      );

      const state = getRadioQueueState();
      expect(state.genreRadioContext).toBeUndefined();
      expect(state.personalRadioContext).toBeUndefined();
      expect(state.lovedRadioContext).toBeUndefined();
      expect(state.recentArtists).toEqual(["Fleetwood Mac"]);
      expect(state.isEnabled).toBe(true);
    });

    it("keeps the contexts when LMS fails (503)", async () => {
      endpoint.failLms(mockLmsClient);

      expect(await post(endpoint.url, endpoint.validPayload)).toBe(503);

      expectContextsKept();
    });

    it("keeps the contexts when the request is rejected before playing", async () => {
      expect(await post(endpoint.url, endpoint.invalidPayload)).toBe(
        endpoint.invalidStatus,
      );

      expect(mockLmsClient.play).not.toHaveBeenCalled();
      expect(mockLmsClient.playAlbum).not.toHaveBeenCalled();
      expectContextsKept();
    });
  });

  it("clears the contexts when a Tidal album starts playing", async () => {
    expect(await post("/api/playback/play-album", { albumId: "4.0" })).toBe(
      200,
    );

    expect(mockLmsClient.playTidalAlbum).toHaveBeenCalledWith("4.0");
    expect(getRadioQueueState().personalRadioContext).toBeUndefined();
  });

  it("keeps the contexts on POST /api/playback/next — the queue is not replaced", async () => {
    expect(await post("/api/playback/next")).toBe(200);

    expectContextsKept();
  });
});
