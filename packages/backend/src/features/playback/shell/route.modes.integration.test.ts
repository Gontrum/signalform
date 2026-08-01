/**
 * Playback Mode Route Integration Tests
 *
 * Sibling of route.integration.test.ts (see AGENTS.md size rule):
 * POST /api/playback/shuffle, POST /api/playback/repeat, and the mode fields
 * the status endpoint carries along.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { Server } from "socket.io";
import { ok, err } from "@signalform/shared";
import type { RepeatMode, ShuffleMode } from "@signalform/shared";
import { createPlaybackRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
  type LmsError,
  type PlayerStatus,
} from "../../../adapters/lms-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";

type MockLmsClient = LmsClient & {
  readonly setShuffle: ReturnType<typeof vi.fn<LmsClient["setShuffle"]>>;
  readonly setRepeat: ReturnType<typeof vi.fn<LmsClient["setRepeat"]>>;
  readonly getStatus: ReturnType<typeof vi.fn<LmsClient["getStatus"]>>;
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
  setShuffle: vi.fn<LmsClient["setShuffle"]>().mockResolvedValue(ok(undefined)),
  setRepeat: vi.fn<LmsClient["setRepeat"]>().mockResolvedValue(ok(undefined)),
  getStatus: vi.fn<LmsClient["getStatus"]>(),
});

const createMockIo = (): TypedSocketIOServer => {
  const io = new Server();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockReturnValue(true);
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return io;
};

const makeStatus = (overrides: Partial<PlayerStatus> = {}): PlayerStatus => ({
  mode: "play",
  playerConnected: true,
  time: 12,
  duration: 240,
  volume: 50,
  currentTrack: null,
  queuePreview: [],
  shuffle: "off",
  repeat: "off",
  ...overrides,
});

const whenPostingMode = async (
  server: FastifyInstance,
  url: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<LightMyRequestResponse> =>
  await server.inject({ method: "POST", url, payload });

const whenPostingWithoutBody = async (
  server: FastifyInstance,
  url: string,
): Promise<LightMyRequestResponse> =>
  await server.inject({ method: "POST", url });

const errorTypeOf = (response: LightMyRequestResponse): string | undefined => {
  const body = response.json() as { readonly error?: string };
  return body.error;
};

describe("Playback mode routes", () => {
  const mockLmsClient = createMockLmsClient();
  const mockIo = createMockIo();
  let server: FastifyInstance;

  beforeEach(async () => {
    mockLmsClient.setShuffle.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.setRepeat.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.getStatus.mockReset().mockResolvedValue(ok(makeStatus()));
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
  });

  describe("POST /api/playback/shuffle", () => {
    it.each<ShuffleMode>(["off", "songs", "albums"])(
      "returns 200 and forwards mode %s to LMS",
      async (mode) => {
        const response = await whenPostingMode(
          server,
          "/api/playback/shuffle",
          { mode },
        );

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({});
        expect(mockLmsClient.setShuffle).toHaveBeenCalledWith(mode);
      },
    );

    it("returns 400 for a mode LMS has no shuffle setting for", async () => {
      const response = await whenPostingMode(server, "/api/playback/shuffle", {
        mode: "sometimes",
      });

      expect(response.statusCode).toBe(400);
      expect(errorTypeOf(response)).toBe("VALIDATION_ERROR");
      expect(mockLmsClient.setShuffle).not.toHaveBeenCalled();
    });

    it("returns 400 when a repeat mode is sent to the shuffle route", async () => {
      const response = await whenPostingMode(server, "/api/playback/shuffle", {
        mode: "track",
      });

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.setShuffle).not.toHaveBeenCalled();
    });

    it("returns 400 when the mode field is missing", async () => {
      const response = await whenPostingMode(
        server,
        "/api/playback/shuffle",
        {},
      );

      expect(response.statusCode).toBe(400);
      expect(errorTypeOf(response)).toBe("VALIDATION_ERROR");
      expect(mockLmsClient.setShuffle).not.toHaveBeenCalled();
    });

    it("returns 400 when the body is missing entirely", async () => {
      const response = await whenPostingWithoutBody(
        server,
        "/api/playback/shuffle",
      );

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.setShuffle).not.toHaveBeenCalled();
    });

    it("returns 503 when LMS is unreachable", async () => {
      mockLmsClient.setShuffle.mockResolvedValue(err(unreachableLms));

      const response = await whenPostingMode(server, "/api/playback/shuffle", {
        mode: "songs",
      });

      expect(response.statusCode).toBe(503);
      expect(errorTypeOf(response)).toBe("LMS_UNREACHABLE");
    });
  });

  describe("POST /api/playback/repeat", () => {
    it.each<RepeatMode>(["off", "track", "playlist"])(
      "returns 200 and forwards mode %s to LMS",
      async (mode) => {
        const response = await whenPostingMode(server, "/api/playback/repeat", {
          mode,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({});
        expect(mockLmsClient.setRepeat).toHaveBeenCalledWith(mode);
      },
    );

    it("returns 400 for a mode LMS has no repeat setting for", async () => {
      const response = await whenPostingMode(server, "/api/playback/repeat", {
        mode: "always",
      });

      expect(response.statusCode).toBe(400);
      expect(errorTypeOf(response)).toBe("VALIDATION_ERROR");
      expect(mockLmsClient.setRepeat).not.toHaveBeenCalled();
    });

    it("returns 400 when a shuffle mode is sent to the repeat route", async () => {
      const response = await whenPostingMode(server, "/api/playback/repeat", {
        mode: "albums",
      });

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.setRepeat).not.toHaveBeenCalled();
    });

    it("returns 400 when the mode field is missing", async () => {
      const response = await whenPostingMode(
        server,
        "/api/playback/repeat",
        {},
      );

      expect(response.statusCode).toBe(400);
      expect(errorTypeOf(response)).toBe("VALIDATION_ERROR");
      expect(mockLmsClient.setRepeat).not.toHaveBeenCalled();
    });

    it("returns 400 when the body is missing entirely", async () => {
      const response = await whenPostingWithoutBody(
        server,
        "/api/playback/repeat",
      );

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.setRepeat).not.toHaveBeenCalled();
    });

    it("returns 503 when LMS is unreachable", async () => {
      mockLmsClient.setRepeat.mockResolvedValue(err(unreachableLms));

      const response = await whenPostingMode(server, "/api/playback/repeat", {
        mode: "playlist",
      });

      expect(response.statusCode).toBe(503);
      expect(errorTypeOf(response)).toBe("LMS_UNREACHABLE");
    });
  });

  describe("GET /api/playback/status", () => {
    it("reports the modes LMS currently has set", async () => {
      mockLmsClient.getStatus.mockResolvedValue(
        ok(makeStatus({ shuffle: "albums", repeat: "track" })),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/playback/status",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        shuffle: "albums",
        repeat: "track",
      });
    });
  });
});
