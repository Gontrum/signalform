/**
 * Unknown Playlist Id Integration Tests
 *
 * Sibling of route.playlist-dir.integration.test.ts: measured on LMS 9.1.1 with
 * `playlistdir` set, the three writing commands that address an existing
 * playlist drop the HTTP connection on an id that does not exist, exactly as an
 * unset folder does. Both reach the adapter as a bare NetworkError, so these
 * cases pin which of the two the user is told about — and that neither reading
 * swallowed the other.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { ok, err } from "@signalform/shared";
import {
  createLmsClient,
  SAVED_PLAYLISTS_PAGE_LIMIT,
  type LmsClient,
  type LmsError,
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
  readonly listSavedPlaylists: ReturnType<
    typeof vi.fn<LmsClient["listSavedPlaylists"]>
  >;
};

const CONFIGURED_PLAYLIST_DIR = "/var/lib/squeezeboxserver/playlists";

const ADDRESSED_PLAYLIST_ID = "99999999";

const OTHER_PLAYLISTS = [
  { id: "1", name: "Morning" },
  { id: "2", name: "Evening" },
] as const;

const A_FULL_PAGE_WITHOUT_THE_ADDRESSED_ID = Array.from(
  { length: SAVED_PLAYLISTS_PAGE_LIMIT },
  (_unused, index) => ({
    id: String(index + 1),
    name: `Playlist ${index + 1}`,
  }),
);

const PLAYLIST_WITH_A_SIMILAR_ID = { id: "9999", name: "Almost" } as const;

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(TEST_LMS_CONFIG),
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
    .mockResolvedValue(ok(CONFIGURED_PLAYLIST_DIR)),
  listSavedPlaylists: vi
    .fn<LmsClient["listSavedPlaylists"]>()
    .mockResolvedValue(ok(OTHER_PLAYLISTS)),
});

const CONNECTION_DROPPED = {
  type: "NetworkError",
  message: "fetch failed",
} as const;

const UPSTREAM_TIMEOUT = {
  type: "TimeoutError",
  message: "LMS connection timeout (5s)",
} as const;

const NOT_FOUND_BODY = {
  error: "PLAYLIST_NOT_FOUND",
  message:
    "That playlist no longer exists on Lyrion Music Server. Your list of playlists may be out of date — reload it and try again.",
};

const PLAYLIST_DIR_BODY = {
  error: "PLAYLIST_DIR_NOT_CONFIGURED",
  message:
    "Lyrion Music Server has no playlist folder configured, so it cannot save playlists. Set a playlist folder in the LMS settings.",
};

const UNREACHABLE_BODY = {
  error: "LMS_UNREACHABLE",
  message:
    "Cannot connect to music server. Please check that Lyrion Music Server is running.",
};

const TIMEOUT_BODY = {
  error: "LMS_TIMEOUT",
  message: "Music server did not respond in time. Please try again.",
};

describe("Playlist writes against an id LMS does not know", () => {
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

  const givenPlaylistDirConfigured = (): void => {
    mockLmsClient.getPlaylistDir.mockResolvedValue(ok(CONFIGURED_PLAYLIST_DIR));
  };

  const givenNoPlaylistDirConfigured = (): void => {
    mockLmsClient.getPlaylistDir.mockResolvedValue(ok(""));
  };

  const givenPlaylistDirProbeFails = (): void => {
    mockLmsClient.getPlaylistDir.mockResolvedValue(err(CONNECTION_DROPPED));
  };

  const givenPlaylistStillSaved = (): void => {
    mockLmsClient.listSavedPlaylists.mockResolvedValue(
      ok([
        ...OTHER_PLAYLISTS,
        { id: ADDRESSED_PLAYLIST_ID, name: "Road Trip" },
      ]),
    );
  };

  const givenSavedPlaylistsCannotBeRead = (): void => {
    mockLmsClient.listSavedPlaylists.mockResolvedValue(err(CONNECTION_DROPPED));
  };

  const givenAFullPageOfSavedPlaylists = (): void => {
    mockLmsClient.listSavedPlaylists.mockResolvedValue(
      ok(A_FULL_PAGE_WITHOUT_THE_ADDRESSED_ID),
    );
  };

  const givenOnlyAPlaylistWithASimilarIdIsSaved = (): void => {
    mockLmsClient.listSavedPlaylists.mockResolvedValue(
      ok([PLAYLIST_WITH_A_SIMILAR_ID]),
    );
  };

  const whenRenamingUnknownPlaylist =
    async (): Promise<LightMyRequestResponse> =>
      await server.inject({
        method: "PATCH",
        url: `/api/playlists/${ADDRESSED_PLAYLIST_ID}`,
        payload: { name: "x" },
      });

  const whenDeletingUnknownPlaylist =
    async (): Promise<LightMyRequestResponse> =>
      await server.inject({
        method: "DELETE",
        url: `/api/playlists/${ADDRESSED_PLAYLIST_ID}`,
      });

  const whenDeletingTrackOfUnknownPlaylist =
    async (): Promise<LightMyRequestResponse> =>
      await server.inject({
        method: "DELETE",
        url: `/api/playlists/${ADDRESSED_PLAYLIST_ID}/tracks/0`,
      });

  const thenNoConnectivityBlame = (body: string): void => {
    expect(body).not.toContain("Cannot connect");
    expect(body).not.toContain("unreachable");
  };

  const thenNoMissingPlaylistBlame = (body: string): void => {
    expect(body).not.toContain("no longer exists");
  };

  describe("PATCH /api/playlists/:id", () => {
    const givenRenameDropsTheConnection = (): void => {
      mockLmsClient.renamePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
    };

    it("returns 404 naming the playlist when the folder is configured", async () => {
      givenRenameDropsTheConnection();
      givenPlaylistDirConfigured();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual(NOT_FOUND_BODY);
      thenNoConnectivityBlame(response.body);
    });

    it("still returns 409 about the folder when no folder is configured", async () => {
      givenRenameDropsTheConnection();
      givenNoPlaylistDirConfigured();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(PLAYLIST_DIR_BODY);
    });

    it("passes a timeout through unchanged without probing the pref", async () => {
      mockLmsClient.renamePlaylist.mockResolvedValue(err(UPSTREAM_TIMEOUT));

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(TIMEOUT_BODY);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });

    it("keeps the unreachable error when the pref probe fails too", async () => {
      givenRenameDropsTheConnection();
      givenPlaylistDirProbeFails();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
    });

    it("keeps the unreachable error when the playlist is still saved", async () => {
      givenRenameDropsTheConnection();
      givenPlaylistDirConfigured();
      givenPlaylistStillSaved();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });

    it("keeps the unreachable error when the saved playlists cannot be read", async () => {
      givenRenameDropsTheConnection();
      givenPlaylistDirConfigured();
      givenSavedPlaylistsCannotBeRead();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });
  });

  describe("DELETE /api/playlists/:id", () => {
    const givenDeleteDropsTheConnection = (): void => {
      mockLmsClient.deleteSavedPlaylist.mockResolvedValue(
        err(CONNECTION_DROPPED),
      );
    };

    it("returns 404 naming the playlist when the folder is configured", async () => {
      givenDeleteDropsTheConnection();
      givenPlaylistDirConfigured();

      const response = await whenDeletingUnknownPlaylist();

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual(NOT_FOUND_BODY);
      thenNoConnectivityBlame(response.body);
    });

    it("still returns 409 about the folder when no folder is configured", async () => {
      givenDeleteDropsTheConnection();
      givenNoPlaylistDirConfigured();

      const response = await whenDeletingUnknownPlaylist();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(PLAYLIST_DIR_BODY);
    });

    it("passes a timeout through unchanged without probing the pref", async () => {
      mockLmsClient.deleteSavedPlaylist.mockResolvedValue(
        err(UPSTREAM_TIMEOUT),
      );

      const response = await whenDeletingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(TIMEOUT_BODY);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });

    it("keeps the unreachable error when the pref probe fails too", async () => {
      givenDeleteDropsTheConnection();
      givenPlaylistDirProbeFails();

      const response = await whenDeletingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
    });

    it("keeps the unreachable error when the playlist is still saved", async () => {
      givenDeleteDropsTheConnection();
      givenPlaylistDirConfigured();
      givenPlaylistStillSaved();

      const response = await whenDeletingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });

    it("keeps the unreachable error when the saved playlists cannot be read", async () => {
      givenDeleteDropsTheConnection();
      givenPlaylistDirConfigured();
      givenSavedPlaylistsCannotBeRead();

      const response = await whenDeletingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });
  });

  describe("DELETE /api/playlists/:id/tracks/:index", () => {
    const givenTrackRemovalDropsTheConnection = (): void => {
      mockLmsClient.removeSavedPlaylistTrack.mockResolvedValue(
        err(CONNECTION_DROPPED),
      );
    };

    it("returns 404 naming the playlist when the folder is configured", async () => {
      givenTrackRemovalDropsTheConnection();
      givenPlaylistDirConfigured();

      const response = await whenDeletingTrackOfUnknownPlaylist();

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual(NOT_FOUND_BODY);
      thenNoConnectivityBlame(response.body);
    });

    it("still returns 409 about the folder when no folder is configured", async () => {
      givenTrackRemovalDropsTheConnection();
      givenNoPlaylistDirConfigured();

      const response = await whenDeletingTrackOfUnknownPlaylist();

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual(PLAYLIST_DIR_BODY);
    });

    it("passes a timeout through unchanged without probing the pref", async () => {
      mockLmsClient.removeSavedPlaylistTrack.mockResolvedValue(
        err(UPSTREAM_TIMEOUT),
      );

      const response = await whenDeletingTrackOfUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(TIMEOUT_BODY);
      expect(mockLmsClient.getPlaylistDir).not.toHaveBeenCalled();
    });

    it("keeps the unreachable error when the pref probe fails too", async () => {
      givenTrackRemovalDropsTheConnection();
      givenPlaylistDirProbeFails();

      const response = await whenDeletingTrackOfUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
    });

    it("keeps the unreachable error when the playlist is still saved", async () => {
      givenTrackRemovalDropsTheConnection();
      givenPlaylistDirConfigured();
      givenPlaylistStillSaved();

      const response = await whenDeletingTrackOfUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });

    it("keeps the unreachable error when the saved playlists cannot be read", async () => {
      givenTrackRemovalDropsTheConnection();
      givenPlaylistDirConfigured();
      givenSavedPlaylistsCannotBeRead();

      const response = await whenDeletingTrackOfUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });
  });

  // The two readings of a dropped connection are checked in order: an empty
  // folder answers on its own, so the saved playlists are never asked for.
  describe("probe order on a dropped connection", () => {
    type WritingRoute = {
      readonly name: string;
      readonly givenTheWriteFailsWith: (error: LmsError) => void;
      readonly whenRequesting: () => Promise<LightMyRequestResponse>;
    };

    const writingRoutes: readonly WritingRoute[] = [
      {
        name: "PATCH /api/playlists/:id",
        givenTheWriteFailsWith: (error: LmsError): void => {
          mockLmsClient.renamePlaylist.mockResolvedValue(err(error));
        },
        whenRequesting: (): Promise<LightMyRequestResponse> =>
          whenRenamingUnknownPlaylist(),
      },
      {
        name: "DELETE /api/playlists/:id",
        givenTheWriteFailsWith: (error: LmsError): void => {
          mockLmsClient.deleteSavedPlaylist.mockResolvedValue(err(error));
        },
        whenRequesting: (): Promise<LightMyRequestResponse> =>
          whenDeletingUnknownPlaylist(),
      },
      {
        name: "DELETE /api/playlists/:id/tracks/:index",
        givenTheWriteFailsWith: (error: LmsError): void => {
          mockLmsClient.removeSavedPlaylistTrack.mockResolvedValue(err(error));
        },
        whenRequesting: (): Promise<LightMyRequestResponse> =>
          whenDeletingTrackOfUnknownPlaylist(),
      },
    ];

    it.each(writingRoutes)(
      "does not ask for the saved playlists when no folder is configured on $name",
      async ({ givenTheWriteFailsWith, whenRequesting }) => {
        givenTheWriteFailsWith(CONNECTION_DROPPED);
        givenNoPlaylistDirConfigured();

        const response = await whenRequesting();

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toEqual(PLAYLIST_DIR_BODY);
        expect(mockLmsClient.listSavedPlaylists).not.toHaveBeenCalled();
      },
    );

    it.each(writingRoutes)(
      "does not ask for the saved playlists on a timeout on $name",
      async ({ givenTheWriteFailsWith, whenRequesting }) => {
        givenTheWriteFailsWith(UPSTREAM_TIMEOUT);

        const response = await whenRequesting();

        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toEqual(TIMEOUT_BODY);
        expect(mockLmsClient.listSavedPlaylists).not.toHaveBeenCalled();
      },
    );
  });

  describe("what the saved playlists have to prove", () => {
    it("returns 404 when only a playlist with a similar id is saved", async () => {
      mockLmsClient.renamePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenPlaylistDirConfigured();
      givenOnlyAPlaylistWithASimilarIdIsSaved();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual(NOT_FOUND_BODY);
    });

    it("keeps the unreachable error when the listing filled a whole page", async () => {
      mockLmsClient.renamePlaylist.mockResolvedValue(err(CONNECTION_DROPPED));
      givenPlaylistDirConfigured();
      givenAFullPageOfSavedPlaylists();

      const response = await whenRenamingUnknownPlaylist();

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      thenNoMissingPlaylistBlame(response.body);
    });
  });

  // Saving creates a playlist rather than addressing one, so a dropped
  // connection there can only ever be the folder or a lost server.
  describe("POST /api/playlists", () => {
    it("never reports a missing playlist when the folder is configured", async () => {
      const savingClient = {
        ...mockLmsClient,
        savePlaylist: vi
          .fn<LmsClient["savePlaylist"]>()
          .mockResolvedValue(err(CONNECTION_DROPPED)),
      };
      const saveServer = Fastify();
      createPlaylistsRoute(saveServer, savingClient);
      await saveServer.ready();

      const response = await saveServer.inject({
        method: "POST",
        url: "/api/playlists",
        payload: { name: "My Mix" },
      });

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual(UNREACHABLE_BODY);
      await saveServer.close();
    });
  });
});
