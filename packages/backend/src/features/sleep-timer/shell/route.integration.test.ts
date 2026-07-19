/**
 * Sleep Timer Route Integration Tests
 *
 * Tests for the HTTP endpoint layer (imperative shell).
 * Architecture compliance: framework calls only in helpers, not in test bodies.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { ok, err } from "@signalform/shared";
import {
  createLmsClient,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";
import { createSleepTimerRoute } from "./route.js";

const TEST_LMS_CONFIG = {
  host: "localhost",
  port: 9000,
  playerId: "test-player-id",
  timeout: 1000,
  retryBaseDelayMs: 0,
} as const;

type MockLmsClient = LmsClient & {
  readonly setSleep: ReturnType<typeof vi.fn<LmsClient["setSleep"]>>;
  readonly getSleep: ReturnType<typeof vi.fn<LmsClient["getSleep"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
  setSleep: vi.fn<LmsClient["setSleep"]>().mockResolvedValue(ok(undefined)),
  getSleep: vi.fn<LmsClient["getSleep"]>().mockResolvedValue(ok(0)),
});

describe("Sleep Timer Routes", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    server = Fastify();
    createSleepTimerRoute(server, mockLmsClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  // WHEN helpers
  // ---------------------------------------------------------------------------

  const whenPostingSleep = async (
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "POST",
      url: "/api/playback/sleep",
      payload: body,
    });
  };

  const whenGettingSleep = async (): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "GET",
      url: "/api/playback/sleep",
    });
  };

  // THEN helpers
  // ---------------------------------------------------------------------------

  const thenSetSleepWasCalledWith = (seconds: number): void => {
    expect(mockLmsClient.setSleep).toHaveBeenCalledWith(seconds);
  };

  const thenSetSleepWasNotCalled = (): void => {
    expect(mockLmsClient.setSleep).not.toHaveBeenCalled();
  };

  describe("POST /api/playback/sleep", () => {
    it("returns 204 and sets the timer for a valid duration", async () => {
      const response = await whenPostingSleep({ seconds: 900 });

      expect(response.statusCode).toBe(204);
      thenSetSleepWasCalledWith(900);
    });

    it("returns 204 and cancels the timer for a duration of 0", async () => {
      const response = await whenPostingSleep({ seconds: 0 });

      expect(response.statusCode).toBe(204);
      thenSetSleepWasCalledWith(0);
    });

    it("returns 400 when seconds is missing", async () => {
      const response = await whenPostingSleep({});

      expect(response.statusCode).toBe(400);
      thenSetSleepWasNotCalled();
    });

    it("returns 400 when seconds is a string", async () => {
      const response = await whenPostingSleep({ seconds: "900" });

      expect(response.statusCode).toBe(400);
      thenSetSleepWasNotCalled();
    });

    it("returns 400 when seconds is negative", async () => {
      const response = await whenPostingSleep({ seconds: -1 });

      expect(response.statusCode).toBe(400);
      thenSetSleepWasNotCalled();
    });

    it("returns 400 when seconds is not an integer", async () => {
      const response = await whenPostingSleep({ seconds: 900.5 });

      expect(response.statusCode).toBe(400);
      thenSetSleepWasNotCalled();
    });

    it("returns 5xx when the LMS setSleep call fails", async () => {
      mockLmsClient.setSleep.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenPostingSleep({ seconds: 900 });

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      thenSetSleepWasCalledWith(900);
    });
  });

  describe("GET /api/playback/sleep", () => {
    it("returns 200 with the remaining seconds", async () => {
      mockLmsClient.getSleep.mockResolvedValue(ok(1800));

      const response = await whenGettingSleep();

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ remainingSeconds: 1800 });
    });

    it("returns 5xx when the LMS getSleep call fails", async () => {
      mockLmsClient.getSleep.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenGettingSleep();

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
    });
  });
});
