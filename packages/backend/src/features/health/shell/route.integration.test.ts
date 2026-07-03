import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import {
  createLmsClient,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";
import {
  createLastFmClient,
  type LastFmClient,
} from "../../../adapters/lastfm-client/index.js";
import { createHealthRoute } from "./route.js";

const TEST_LMS_CONFIG = {
  host: "localhost",
  port: 9000,
  playerId: "test-player-id",
  timeout: 1000,
  retryBaseDelayMs: 0,
} as const;

const TEST_LASTFM_CONFIG = {
  apiKey: "test-key",
  timeout: 5000,
  baseUrl: "https://ws.audioscrobbler.com/2.0/",
  language: "en" as const,
};

type MockLmsClient = LmsClient & {
  readonly getCurrentTime: ReturnType<
    typeof vi.fn<LmsClient["getCurrentTime"]>
  >;
};

type MockLastFmClient = LastFmClient & {
  readonly getCircuitState: ReturnType<
    typeof vi.fn<LastFmClient["getCircuitState"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
  getCurrentTime: vi.fn<LmsClient["getCurrentTime"]>().mockResolvedValue(ok(0)),
});

const createMockLastFmClient = (): MockLastFmClient => ({
  ...createLastFmClient(TEST_LASTFM_CONFIG),
  getCircuitState: vi
    .fn<LastFmClient["getCircuitState"]>()
    .mockReturnValue("CLOSED"),
});

describe("GET /health", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify();
    createHealthRoute(server, mockLmsClient, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 healthy when LMS probe succeeds and circuit is CLOSED", async () => {
    mockLmsClient.getCurrentTime.mockResolvedValue(ok(42));
    mockLastFmClient.getCircuitState.mockReturnValue("CLOSED");

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      status: "healthy",
      dependencies: { lms: "connected", lastfm: "available" },
    });
    expect(body).not.toHaveProperty("httpStatus");
  });

  it("returns 200 degraded when LMS probe succeeds and circuit is OPEN", async () => {
    mockLmsClient.getCurrentTime.mockResolvedValue(ok(42));
    mockLastFmClient.getCircuitState.mockReturnValue("OPEN");

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "degraded",
      dependencies: { lms: "connected", lastfm: "circuit open" },
    });
  });

  it("returns 503 unhealthy when LMS probe fails and circuit is CLOSED", async () => {
    mockLmsClient.getCurrentTime.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );
    mockLastFmClient.getCircuitState.mockReturnValue("CLOSED");

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "unhealthy",
      dependencies: { lms: "disconnected", lastfm: "available" },
    });
  });

  it("returns 503 unhealthy when LMS probe fails and circuit is OPEN", async () => {
    mockLmsClient.getCurrentTime.mockResolvedValue(
      err({ type: "NetworkError", message: "connection refused" }),
    );
    mockLastFmClient.getCircuitState.mockReturnValue("OPEN");

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "unhealthy",
      dependencies: { lms: "disconnected", lastfm: "circuit open" },
    });
  });
});
