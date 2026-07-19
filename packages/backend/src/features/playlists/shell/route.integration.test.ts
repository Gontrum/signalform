/**
 * Playlists Route Integration Tests
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
import { createPlaylistsRoute } from "./route.js";

const TEST_LMS_CONFIG = {
  host: "localhost",
  port: 9000,
  playerId: "test-player-id",
  timeout: 1000,
  retryBaseDelayMs: 0,
} as const;

type MockLmsClient = LmsClient & {
  readonly savePlaylist: ReturnType<typeof vi.fn<LmsClient["savePlaylist"]>>;
  readonly listSavedPlaylists: ReturnType<
    typeof vi.fn<LmsClient["listSavedPlaylists"]>
  >;
  readonly loadSavedPlaylist: ReturnType<
    typeof vi.fn<LmsClient["loadSavedPlaylist"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
  savePlaylist: vi
    .fn<LmsClient["savePlaylist"]>()
    .mockResolvedValue(ok(undefined)),
  listSavedPlaylists: vi
    .fn<LmsClient["listSavedPlaylists"]>()
    .mockResolvedValue(ok([])),
  loadSavedPlaylist: vi
    .fn<LmsClient["loadSavedPlaylist"]>()
    .mockResolvedValue(ok(undefined)),
});

describe("Playlists Routes", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLmsClient = createMockLmsClient();
    server = Fastify();
    createPlaylistsRoute(server, mockLmsClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  // WHEN helpers
  // ---------------------------------------------------------------------------

  const whenSavingPlaylist = async (
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "POST",
      url: "/api/playlists",
      payload: body,
    });
  };

  const whenListingPlaylists = async (): Promise<LightMyRequestResponse> => {
    return await server.inject({ method: "GET", url: "/api/playlists" });
  };

  const whenLoadingPlaylist = async (
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "POST",
      url: "/api/playlists/load",
      payload: body,
    });
  };

  // THEN helpers
  // ---------------------------------------------------------------------------

  const thenSaveWasCalledWith = (name: string): void => {
    expect(mockLmsClient.savePlaylist).toHaveBeenCalledWith(name);
  };

  const thenSaveWasNotCalled = (): void => {
    expect(mockLmsClient.savePlaylist).not.toHaveBeenCalled();
  };

  const thenLoadWasNotCalled = (): void => {
    expect(mockLmsClient.loadSavedPlaylist).not.toHaveBeenCalled();
  };

  describe("POST /api/playlists", () => {
    it("returns 201 and saves the playlist for a valid name", async () => {
      const response = await whenSavingPlaylist({ name: "My Mix" });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({ name: "My Mix" });
      thenSaveWasCalledWith("My Mix");
    });

    it("trims the name before saving", async () => {
      const response = await whenSavingPlaylist({ name: "  My Mix  " });

      expect(response.statusCode).toBe(201);
      thenSaveWasCalledWith("My Mix");
    });

    it("returns 400 when name is missing", async () => {
      const response = await whenSavingPlaylist({});

      expect(response.statusCode).toBe(400);
      thenSaveWasNotCalled();
    });

    it("returns 400 when name is empty", async () => {
      const response = await whenSavingPlaylist({ name: "   " });

      expect(response.statusCode).toBe(400);
      thenSaveWasNotCalled();
    });

    it("returns 400 when name exceeds 200 characters", async () => {
      const response = await whenSavingPlaylist({ name: "a".repeat(201) });

      expect(response.statusCode).toBe(400);
      thenSaveWasNotCalled();
    });

    it("returns 5xx when the LMS savePlaylist call fails", async () => {
      mockLmsClient.savePlaylist.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenSavingPlaylist({ name: "My Mix" });

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      thenSaveWasCalledWith("My Mix");
    });
  });

  describe("GET /api/playlists", () => {
    it("returns 200 with the saved playlists", async () => {
      mockLmsClient.listSavedPlaylists.mockResolvedValue(
        ok([
          { id: "1", name: "Morning" },
          { id: "2", name: "Evening" },
        ]),
      );

      const response = await whenListingPlaylists();

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        playlists: [
          { id: "1", name: "Morning" },
          { id: "2", name: "Evening" },
        ],
      });
    });

    it("returns 5xx when the LMS listSavedPlaylists call fails", async () => {
      mockLmsClient.listSavedPlaylists.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenListingPlaylists();

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
    });
  });

  describe("POST /api/playlists/load", () => {
    it("returns 204 and loads the playlist for a valid id", async () => {
      const response = await whenLoadingPlaylist({ id: "42" });

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.loadSavedPlaylist).toHaveBeenCalledWith("42");
    });

    it("trims the id before loading", async () => {
      const response = await whenLoadingPlaylist({ id: "  5  " });

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.loadSavedPlaylist).toHaveBeenCalledWith("5");
    });

    it("returns 400 when id is missing", async () => {
      const response = await whenLoadingPlaylist({});

      expect(response.statusCode).toBe(400);
      thenLoadWasNotCalled();
    });

    it("returns 400 when id is an empty string", async () => {
      const response = await whenLoadingPlaylist({ id: "   " });

      expect(response.statusCode).toBe(400);
      thenLoadWasNotCalled();
    });

    it("returns 5xx when the LMS loadSavedPlaylist call fails", async () => {
      mockLmsClient.loadSavedPlaylist.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenLoadingPlaylist({ id: "42" });

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
    });
  });
});
