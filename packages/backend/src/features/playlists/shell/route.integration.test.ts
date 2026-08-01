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
  readonly deleteSavedPlaylist: ReturnType<
    typeof vi.fn<LmsClient["deleteSavedPlaylist"]>
  >;
  readonly renamePlaylist: ReturnType<
    typeof vi.fn<LmsClient["renamePlaylist"]>
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
  deleteSavedPlaylist: vi
    .fn<LmsClient["deleteSavedPlaylist"]>()
    .mockResolvedValue(ok(undefined)),
  renamePlaylist: vi
    .fn<LmsClient["renamePlaylist"]>()
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

  const whenDeletingPlaylist = async (
    idSegment: string,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "DELETE",
      url: `/api/playlists/${idSegment}`,
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

  const thenDeleteWasCalledWith = (id: string): void => {
    expect(mockLmsClient.deleteSavedPlaylist).toHaveBeenCalledWith(id);
  };

  const thenDeleteWasNotCalled = (): void => {
    expect(mockLmsClient.deleteSavedPlaylist).not.toHaveBeenCalled();
  };

  const whenRenamingPlaylist = async (
    idSegment: string,
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({
      method: "PATCH",
      url: `/api/playlists/${idSegment}`,
      payload: body,
    });
  };

  const thenRenameWasCalledWith = (id: string, name: string): void => {
    expect(mockLmsClient.renamePlaylist).toHaveBeenCalledWith(id, name);
  };

  const thenRenameWasNotCalled = (): void => {
    expect(mockLmsClient.renamePlaylist).not.toHaveBeenCalled();
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

  describe("DELETE /api/playlists/:id", () => {
    it("returns 204 and deletes the playlist for a valid id", async () => {
      const response = await whenDeletingPlaylist("42");

      expect(response.statusCode).toBe(204);
      thenDeleteWasCalledWith("42");
    });

    it("decodes a percent-encoded id before deleting", async () => {
      const response = await whenDeletingPlaylist("Road%20Trip%2F2026");

      expect(response.statusCode).toBe(204);
      thenDeleteWasCalledWith("Road Trip/2026");
    });

    it("trims the id before deleting", async () => {
      const response = await whenDeletingPlaylist("%205%20");

      expect(response.statusCode).toBe(204);
      thenDeleteWasCalledWith("5");
    });

    it("returns 400 when the id is whitespace only", async () => {
      const response = await whenDeletingPlaylist("%20");

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: "Playlist id is required",
      });
      thenDeleteWasNotCalled();
    });

    it("returns 503 with a user-friendly message when LMS is unreachable", async () => {
      mockLmsClient.deleteSavedPlaylist.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenDeletingPlaylist("42");

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        error: "LMS_UNREACHABLE",
        message:
          "Cannot connect to music server. Please check that Lyrion Music Server is running.",
      });
      thenDeleteWasCalledWith("42");
    });
  });

  describe("PATCH /api/playlists/:id", () => {
    it("returns 200 and renames the playlist for a valid name", async () => {
      const response = await whenRenamingPlaylist("42", { name: "Evening" });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ id: "42", name: "Evening" });
      thenRenameWasCalledWith("42", "Evening");
    });

    it("trims the name before renaming", async () => {
      const response = await whenRenamingPlaylist("42", {
        name: "  Evening  ",
      });

      expect(response.statusCode).toBe(200);
      thenRenameWasCalledWith("42", "Evening");
    });

    it("decodes a percent-encoded id before renaming", async () => {
      const response = await whenRenamingPlaylist("Road%20Trip%2F2026", {
        name: "Evening",
      });

      expect(response.statusCode).toBe(200);
      thenRenameWasCalledWith("Road Trip/2026", "Evening");
    });

    it("returns 400 when the name is missing", async () => {
      const response = await whenRenamingPlaylist("42", {});

      expect(response.statusCode).toBe(400);
      thenRenameWasNotCalled();
    });

    it("returns 400 when the name is empty", async () => {
      const response = await whenRenamingPlaylist("42", { name: "" });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: "Playlist name cannot be empty",
      });
      thenRenameWasNotCalled();
    });

    it("returns 400 when the name is whitespace only", async () => {
      const response = await whenRenamingPlaylist("42", { name: "   " });

      expect(response.statusCode).toBe(400);
      thenRenameWasNotCalled();
    });

    it("returns 400 when the name exceeds 200 characters", async () => {
      const response = await whenRenamingPlaylist("42", {
        name: "a".repeat(201),
      });

      expect(response.statusCode).toBe(400);
      thenRenameWasNotCalled();
    });

    it("accepts a name of exactly 200 characters", async () => {
      const name = "a".repeat(200);

      const response = await whenRenamingPlaylist("42", { name });

      expect(response.statusCode).toBe(200);
      thenRenameWasCalledWith("42", name);
    });

    it("returns 400 when the id is whitespace only", async () => {
      const response = await whenRenamingPlaylist("%20", { name: "Evening" });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: "Playlist id is required",
      });
      thenRenameWasNotCalled();
    });

    it("returns 503 with a user-friendly message when LMS is unreachable", async () => {
      mockLmsClient.renamePlaylist.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenRenamingPlaylist("42", { name: "Evening" });

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        error: "LMS_UNREACHABLE",
        message:
          "Cannot connect to music server. Please check that Lyrion Music Server is running.",
      });
      thenRenameWasCalledWith("42", "Evening");
    });

    it("succeeds for an unknown id, mirroring DELETE — LMS acknowledges silently", async () => {
      const response = await whenRenamingPlaylist("9999", { name: "Evening" });

      expect(response.statusCode).toBe(200);
      thenRenameWasCalledWith("9999", "Evening");
    });
  });
});
