/**
 * Playback Transport-Command Integration Tests
 *
 * Sibling of route.integration.test.ts (see AGENTS.md size rule): the routes
 * that deliberately leave the running track must leave a note behind, so the
 * status poller can tell a user skip apart from a track that broke off.
 */

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
  lastUserTransportCommandAt,
  resetUserTransportCommands,
} from "../../../infrastructure/transport-commands.js";

type MockLmsClient = LmsClient & {
  readonly nextTrack: ReturnType<typeof vi.fn<LmsClient["nextTrack"]>>;
  readonly setShuffle: ReturnType<typeof vi.fn<LmsClient["setShuffle"]>>;
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
  nextTrack: vi.fn<LmsClient["nextTrack"]>().mockResolvedValue(ok(undefined)),
  setShuffle: vi.fn<LmsClient["setShuffle"]>().mockResolvedValue(ok(undefined)),
});

const createMockIo = (): TypedSocketIOServer => {
  const io = new Server();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockReturnValue(true);
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return io;
};

describe("Playback routes and the user-transport-command record", () => {
  const mockLmsClient = createMockLmsClient();
  const mockIo = createMockIo();
  let server: FastifyInstance;

  beforeEach(async () => {
    resetUserTransportCommands();
    mockLmsClient.nextTrack.mockReset().mockResolvedValue(ok(undefined));
    mockLmsClient.setShuffle.mockReset().mockResolvedValue(ok(undefined));
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

  it("has nothing on record before any command is sent", () => {
    expect(lastUserTransportCommandAt()).toBeUndefined();
  });

  it("records the moment POST /api/playback/next is handled", async () => {
    const before = Date.now();

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/next",
    });

    expect(response.statusCode).toBe(200);
    const recordedAt = lastUserTransportCommandAt();
    expect(recordedAt).toBeGreaterThanOrEqual(before);
    expect(recordedAt).toBeLessThanOrEqual(Date.now());
  });

  it("records the skip even when LMS refuses it — the user still asked", async () => {
    mockLmsClient.nextTrack.mockResolvedValue(err(unreachableLms));

    const response = await server.inject({
      method: "POST",
      url: "/api/playback/next",
    });

    expect(response.statusCode).toBe(503);
    expect(lastUserTransportCommandAt()).toBeDefined();
  });

  it("leaves no record for a command that keeps the current track playing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/shuffle",
      payload: { mode: "songs" },
    });

    expect(response.statusCode).toBe(200);
    expect(lastUserTransportCommandAt()).toBeUndefined();
  });
});
