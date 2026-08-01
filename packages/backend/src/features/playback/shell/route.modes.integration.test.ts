/**
 * Playback Mode Route Integration Tests
 *
 * Sibling of route.integration.test.ts (see AGENTS.md size rule):
 * POST /api/playback/shuffle, POST /api/playback/repeat, the mode fields
 * the status endpoint carries along, and the guarantee that starting an
 * album leaves the repeat mode untouched.
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

// Repeat belongs to the user since the shuffle/repeat feature — starting an
// album must no longer force it off. Asserted on the JSON-RPC commands that
// actually reach LMS, so reintroducing any repeat command fails here.
describe("POST /api/playback/play-album and the repeat mode", () => {
  const fetchMock =
    vi.fn<(input: unknown, init: unknown) => Promise<unknown>>();
  let server: FastifyInstance;

  const tidalAlbumTracks = [
    { id: "4.0.0", name: "Opener", url: "tidal://track/1", isaudio: 1 },
    { id: "4.0.1", name: "Closer", url: "tidal://track/2", isaudio: 1 },
  ];

  const isRecord = (
    value: unknown,
  ): value is Readonly<Record<string, unknown>> =>
    typeof value === "object" && value !== null;

  const commandOfRequestInit = (init: unknown): readonly unknown[] => {
    const body = isRecord(init) ? init["body"] : undefined;
    const parsed: unknown =
      typeof body === "string" ? JSON.parse(body) : undefined;
    const params = isRecord(parsed) ? parsed["params"] : undefined;
    const command = Array.isArray(params) ? params[1] : undefined;
    return Array.isArray(command) ? command : [];
  };

  const commandsSentToLms = (): readonly (readonly unknown[])[] =>
    fetchMock.mock.calls.map((call) => commandOfRequestInit(call[1]));

  const repeatCommandsSentToLms = (): readonly (readonly unknown[])[] =>
    commandsSentToLms().filter(
      (command) => command[0] === "playlist" && command[1] === "repeat",
    );

  const lmsReplies = (result: Readonly<Record<string, unknown>>): unknown => ({
    ok: true,
    json: async (): Promise<unknown> => ({ result, id: 1, error: null }),
  });

  const givenLmsAcceptsEveryCommand = (): void => {
    fetchMock.mockImplementation(async (_input, init) =>
      commandOfRequestInit(init)[0] === "tidal"
        ? lmsReplies({
            loop_loop: tidalAlbumTracks,
            count: tidalAlbumTracks.length,
          })
        : lmsReplies({}),
    );
  };

  const givenLmsIsUnreachable = (): void => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
  };

  const whenPlayingAlbum = async (
    albumId: string,
  ): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "POST",
      url: "/api/playback/play-album",
      payload: { albumId },
    });

  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    server = Fastify({ logger: false });
    createPlaybackRoute(
      server,
      createLmsClient({ ...mockLmsConfig, retryBaseDelayMs: 0 }),
      mockLmsConfig,
      createMockIo(),
      "test-player-id",
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.unstubAllGlobals();
  });

  it("sends only the album load command for a local album", async () => {
    givenLmsAcceptsEveryCommand();

    const response = await whenPlayingAlbum("42");

    expect(response.statusCode).toBe(200);
    expect(commandsSentToLms()).toEqual([
      ["playlistcontrol", "cmd:load", "album_id:42"],
    ]);
    expect(repeatCommandsSentToLms()).toEqual([]);
  });

  it("sends only the queue commands for a Tidal album", async () => {
    givenLmsAcceptsEveryCommand();

    const response = await whenPlayingAlbum("4.0");

    expect(response.statusCode).toBe(200);
    expect(commandsSentToLms()).toEqual([
      ["tidal", "items", 0, 999, "item_id:4.0", "want_url:1"],
      ["playlist", "clear"],
      ["playlist", "play", "tidal://track/1"],
      ["playlist", "add", "tidal://track/2"],
    ]);
    expect(repeatCommandsSentToLms()).toEqual([]);
  });

  it("returns 503 and touches no mode when LMS is unreachable", async () => {
    givenLmsIsUnreachable();

    const response = await whenPlayingAlbum("42");

    expect(response.statusCode).toBe(503);
    expect(repeatCommandsSentToLms()).toEqual([]);
  });
});
