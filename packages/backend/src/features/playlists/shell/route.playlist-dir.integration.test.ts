/**
 * Playlist Write Failure Integration Tests
 *
 * Sibling of route.integration.test.ts: an LMS with no `playlistdir` drops the
 * connection on every playlist write, which reaches the adapter as a plain
 * NetworkError. These cases pin which of the two answers the user gets — and
 * that the extra pref lookup never runs on a write that worked.
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
  readonly deleteSavedPlaylist: ReturnType<
    typeof vi.fn<LmsClient["deleteSavedPlaylist"]>
  >;
  readonly renamePlaylist: ReturnType<
    typeof vi.fn<LmsClient["renamePlaylist"]>
  >;
  readonly removeSavedPlaylistTrack: ReturnType<
    typeof vi.fn<LmsClient["removeSavedPlaylistTrack"]>
  >;
  readonly getPlaylistDir: ReturnType<
    typeof vi.fn<LmsClient["getPlaylistDir"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
  savePlaylist: vi
    .fn<LmsClient["savePlaylist"]>()
    .mockResolvedValue(ok(undefined)),
  deleteSavedPlaylist: vi
    .fn<LmsClient["deleteSavedPlaylist"]>()
    .mockResolvedValue(ok(undefined)),
  renamePlaylist: vi
    .fn<LmsClient["renamePlaylist"]>()
    .mockResolvedValue(ok(undefined)),
  removeSavedPlaylistTrack: vi
    .fn<LmsClient["removeSavedPlaylistTrack"]>()
    .mockResolvedValue(ok(undefined)),
  getPlaylistDir: vi
    .fn<LmsClient["getPlaylistDir"]>()
    .mockResolvedValue(ok("/music/playlists")),
});

const CONNECTION_DROPPED = {
  type: "NetworkError",
  message: "fetch failed",
} as const;

const EXPECTED_BODY = {
  error: "PLAYLIST_DIR_NOT_CONFIGURED",
  message:
    "Lyrion Music Server has no playlist folder configured, so it cannot save playlists. Set a playlist folder in the LMS settings.",
};

describe("Playlist writes against an LMS without a playlist folder", () => {
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

  const givenNoPlaylistDirConfigured = (): void => {
    mockLmsClient.getPlaylistDir.mockResolvedValue(ok(""));
  };

  const givenPlaylistDirConfigured = (): void => {
    mockLmsClient.getPlaylistDir.mockResolvedValue(ok("/music/playlists"));
  };

  const whenSavingPlaylist = async (): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "POST",
      url: "/api/playlists",
      payload: { name: "My Mix" },
    });

  const whenRenamingPlaylist = async (): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "PATCH",
      url: "/api/playlists/42",
      payload: { name: "Evening" },
    });

  const whenDeletingPlaylist = async (): Promise<LightMyRequestResponse> =>
    await server.inject({ method: "DELETE", url: "/api/playlists/42" });

  const whenDeletingTrack = async (): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "DELETE",
      url: "/api/playlists/42/tracks/3",
    });

  describe("POST /api/playlists", () => {
    it("returns 409 naming the missing folder when the write dropped and no folder is set", async () => {
      mockLmsClient.savePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenNoPlaylistDirConfigured();

      const response = await whenSavingPlaylist();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(EXPECTED_BODY);
    });

    it("still returns 503 when a folder is configured — then LMS really is gone", async () => {
      mockLmsClient.savePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenPlaylistDirConfigured();

      const response = await whenSavingPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        error: "LMS_UNREACHABLE",
        message:
          "Cannot connect to music server. Please check that Lyrion Music Server is running.",
      });
    });

    it("keeps the 503 when the pref lookup fails too", async () => {
      mockLmsClient.savePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      mockLmsClient.getPlaylistDir.mockResolvedValue(err(CONNECTION_DROPPED));

      const response = await whenSavingPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        error: "LMS_UNREACHABLE",
        message:
          "Cannot connect to music server. Please check that Lyrion Music Server is running.",
      });
    });

    it("does not ask for the pref when the save succeeded", async () => {
      const response = await whenSavingPlaylist();

      expect(response.statusCode).toBe(201);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });

    it("does not ask for the pref when the name was rejected before the write", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/playlists",
        payload: { name: "   " },
      });

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });

    it("asks for the pref exactly once per failed write", async () => {
      mockLmsClient.savePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenNoPlaylistDirConfigured();

      await whenSavingPlaylist();

      expect(mockLmsClient.getPlaylistDir).toHaveBeenCalledTimes(1);
    });

    it("does not ask for the pref for a failure that is not a dropped connection", async () => {
      mockLmsClient.savePlaylist.mockResolvedValue(
        err({ type: "TimeoutError", message: "LMS connection timeout (5s)" }),
      );

      const response = await whenSavingPlaylist();

      expect(response.statusCode).toBe(503);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/playlists/:id", () => {
    it("returns 409 naming the missing folder", async () => {
      mockLmsClient.renamePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenNoPlaylistDirConfigured();

      const response = await whenRenamingPlaylist();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(EXPECTED_BODY);
    });

    it("still returns 503 when a folder is configured", async () => {
      mockLmsClient.renamePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenPlaylistDirConfigured();

      const response = await whenRenamingPlaylist();

      expect(response.statusCode).toBe(503);
    });

    it("does not ask for the pref when the rename succeeded", async () => {
      const response = await whenRenamingPlaylist();

      expect(response.statusCode).toBe(200);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/playlists/:id", () => {
    it("returns 409 naming the missing folder", async () => {
      mockLmsClient.deleteSavedPlaylist.mockResolvedValue(
        err(CONNECTION_DROPPED),
      );
      givenNoPlaylistDirConfigured();

      const response = await whenDeletingPlaylist();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(EXPECTED_BODY);
    });

    it("still returns 503 when a folder is configured", async () => {
      mockLmsClient.deleteSavedPlaylist.mockResolvedValue(
        err(CONNECTION_DROPPED),
      );
      givenPlaylistDirConfigured();

      const response = await whenDeletingPlaylist();

      expect(response.statusCode).toBe(503);
    });

    it("does not ask for the pref when the delete succeeded", async () => {
      const response = await whenDeletingPlaylist();

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/playlists/:id/tracks/:index", () => {
    it("returns 409 naming the missing folder", async () => {
      mockLmsClient.removeSavedPlaylistTrack.mockResolvedValue(
        err(CONNECTION_DROPPED),
      );
      givenNoPlaylistDirConfigured();

      const response = await whenDeletingTrack();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(EXPECTED_BODY);
    });

    it("still returns 503 when a folder is configured", async () => {
      mockLmsClient.removeSavedPlaylistTrack.mockResolvedValue(
        err(CONNECTION_DROPPED),
      );
      givenPlaylistDirConfigured();

      const response = await whenDeletingTrack();

      expect(response.statusCode).toBe(503);
    });

    it("does not ask for the pref when the track removal succeeded", async () => {
      const response = await whenDeletingTrack();

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });
  });

  // Loading writes nothing to disk — it goes through playlistcontrol, which
  // works with an empty playlistdir, so a failure there stays a plain 503.
  describe("POST /api/playlists/load", () => {
    it("does not ask for the pref when the load fails", async () => {
      const failingClient = {
        ...mockLmsClient,
        loadSavedPlaylist: vi
          .fn<LmsClient["loadSavedPlaylist"]>()
          .mockResolvedValue(err(CONNECTION_DROPPED)),
      };
      const loadServer = Fastify();
      createPlaylistsRoute(loadServer, failingClient);
      await loadServer.ready();

      const response = await loadServer.inject({
        method: "POST",
        url: "/api/playlists/load",
        payload: { id: "42" },
      });

      expect(response.statusCode).toBe(503);
      expect(failingClient.getPlaylistDir).not.toHaveBeenCalled();
      await loadServer.close();
    });
  });
});
