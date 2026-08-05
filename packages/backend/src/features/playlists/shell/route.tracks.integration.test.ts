/**
 * Playlist Tracks Route Integration Tests
 *
 * Sibling of route.integration.test.ts (kept separate for file size): covers
 * GET /api/playlists/:id/tracks and DELETE /api/playlists/:id/tracks/:index.
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
  readonly getSavedPlaylistTracks: ReturnType<
    typeof vi.fn<LmsClient["getSavedPlaylistTracks"]>
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
  getSavedPlaylistTracks: vi
    .fn<LmsClient["getSavedPlaylistTracks"]>()
    .mockResolvedValue(ok({ tracks: [], count: 0 })),
  removeSavedPlaylistTrack: vi
    .fn<LmsClient["removeSavedPlaylistTrack"]>()
    .mockResolvedValue(ok(undefined)),
  // A configured folder is the normal case; the empty one has its own file,
  // route.playlist-dir.integration.test.ts.
  getPlaylistDir: vi
    .fn<LmsClient["getPlaylistDir"]>()
    .mockResolvedValue(ok("/music/playlists")),
});

const track = (
  index: number,
  title: string,
): {
  readonly index: number;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
} => ({ index, title, artist: "Massive Attack", album: "Mezzanine" });

describe("Playlist Tracks Routes", () => {
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

  const whenListingTracks = async (
    url: string,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({ method: "GET", url });
  };

  const whenDeletingTrack = async (
    url: string,
  ): Promise<LightMyRequestResponse> => {
    return await server.inject({ method: "DELETE", url });
  };

  const thenRemoveWasNotCalled = (): void => {
    expect(mockLmsClient.removeSavedPlaylistTrack).not.toHaveBeenCalled();
  };

  describe("GET /api/playlists/:id/tracks", () => {
    it("returns 200 with the playlist's tracks", async () => {
      mockLmsClient.getSavedPlaylistTracks.mockResolvedValue(
        ok({
          tracks: [
            { ...track(0, "Teardrop"), duration: 330 },
            { ...track(1, "Angel"), duration: 379 },
          ],
          count: 2,
        }),
      );

      const response = await whenListingTracks("/api/playlists/42/tracks");

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        tracks: [
          {
            index: 0,
            title: "Teardrop",
            artist: "Massive Attack",
            album: "Mezzanine",
            duration: 330,
          },
          {
            index: 1,
            title: "Angel",
            artist: "Massive Attack",
            album: "Mezzanine",
            duration: 379,
          },
        ],
        hasMore: false,
      });
    });

    it("omits duration when the adapter reports none", async () => {
      mockLmsClient.getSavedPlaylistTracks.mockResolvedValue(
        ok({ tracks: [track(0, "Untagged")], count: 1 }),
      );

      const response = await whenListingTracks("/api/playlists/42/tracks");

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        tracks: [
          {
            index: 0,
            title: "Untagged",
            artist: "Massive Attack",
            album: "Mezzanine",
          },
        ],
        hasMore: false,
      });
    });

    it("applies the default paging when no query is given", async () => {
      await whenListingTracks("/api/playlists/42/tracks");

      expect(mockLmsClient.getSavedPlaylistTracks).toHaveBeenCalledWith(
        "42",
        0,
        250,
      );
    });

    it("passes limit and offset through to the adapter", async () => {
      await whenListingTracks("/api/playlists/42/tracks?limit=10&offset=20");

      expect(mockLmsClient.getSavedPlaylistTracks).toHaveBeenCalledWith(
        "42",
        20,
        10,
      );
    });

    it("decodes a percent-encoded id before reading", async () => {
      await whenListingTracks("/api/playlists/Road%20Trip%2F2026/tracks");

      expect(mockLmsClient.getSavedPlaylistTracks).toHaveBeenCalledWith(
        "Road Trip/2026",
        0,
        250,
      );
    });

    it("reports hasMore true when tracks remain after this page", async () => {
      mockLmsClient.getSavedPlaylistTracks.mockResolvedValue(
        ok({ tracks: [track(0, "Teardrop"), track(1, "Angel")], count: 40 }),
      );

      const response = await whenListingTracks(
        "/api/playlists/42/tracks?limit=2&offset=0",
      );

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).hasMore).toBe(true);
    });

    it("reports hasMore false on the last page", async () => {
      mockLmsClient.getSavedPlaylistTracks.mockResolvedValue(
        ok({ tracks: [track(38, "Teardrop"), track(39, "Angel")], count: 40 }),
      );

      const response = await whenListingTracks(
        "/api/playlists/42/tracks?limit=2&offset=38",
      );

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).hasMore).toBe(false);
    });

    // The index addresses the track for DELETE, so a page must not renumber
    // from zero — track 10 stays 10 even as the first row of its page.
    it("keeps the playlist-wide index on a page past the first", async () => {
      mockLmsClient.getSavedPlaylistTracks.mockResolvedValue(
        ok({
          tracks: [
            track(10, "eleventh"),
            track(11, "twelfth"),
            track(12, "thirteenth"),
          ],
          count: 40,
        }),
      );

      const response = await whenListingTracks(
        "/api/playlists/42/tracks?limit=3&offset=10",
      );

      expect(response.statusCode).toBe(200);
      expect(
        JSON.parse(response.body).tracks.map(
          (item: { readonly index: number }) => item.index,
        ),
      ).toEqual([10, 11, 12]);
    });

    it("returns 400 for a limit of zero", async () => {
      const response = await whenListingTracks(
        "/api/playlists/42/tracks?limit=0",
      );

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.getSavedPlaylistTracks).not.toHaveBeenCalled();
    });

    it("returns 400 for a negative offset", async () => {
      const response = await whenListingTracks(
        "/api/playlists/42/tracks?offset=-1",
      );

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.getSavedPlaylistTracks).not.toHaveBeenCalled();
    });

    it("returns 400 for a non-numeric limit", async () => {
      const response = await whenListingTracks(
        "/api/playlists/42/tracks?limit=many",
      );

      expect(response.statusCode).toBe(400);
      expect(mockLmsClient.getSavedPlaylistTracks).not.toHaveBeenCalled();
    });

    it("returns 400 when the id is whitespace only", async () => {
      const response = await whenListingTracks("/api/playlists/%20/tracks");

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: "Playlist id is required",
      });
      expect(mockLmsClient.getSavedPlaylistTracks).not.toHaveBeenCalled();
    });

    it("returns 503 with a user-friendly message when LMS is unreachable", async () => {
      mockLmsClient.getSavedPlaylistTracks.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenListingTracks("/api/playlists/42/tracks");

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        error: "LMS_UNREACHABLE",
        message:
          "Cannot connect to music server. Please check that Lyrion Music Server is running.",
      });
    });

    it("returns an empty page for an unknown id, mirroring the other playlist routes", async () => {
      const response = await whenListingTracks("/api/playlists/9999/tracks");

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ tracks: [], hasMore: false });
    });
  });

  describe("DELETE /api/playlists/:id/tracks/:index", () => {
    it("returns 204 and removes the track", async () => {
      const response = await whenDeletingTrack("/api/playlists/42/tracks/3");

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.removeSavedPlaylistTrack).toHaveBeenCalledWith(
        "42",
        3,
      );
    });

    // The first track is a real case that a truthy index check would reject.
    it("accepts index 0", async () => {
      const response = await whenDeletingTrack("/api/playlists/42/tracks/0");

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.removeSavedPlaylistTrack).toHaveBeenCalledWith(
        "42",
        0,
      );
    });

    it("decodes a percent-encoded id before removing", async () => {
      const response = await whenDeletingTrack(
        "/api/playlists/Road%20Trip%2F2026/tracks/1",
      );

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.removeSavedPlaylistTrack).toHaveBeenCalledWith(
        "Road Trip/2026",
        1,
      );
    });

    it("returns 400 for a negative index", async () => {
      const response = await whenDeletingTrack("/api/playlists/42/tracks/-1");

      expect(response.statusCode).toBe(400);
      thenRemoveWasNotCalled();
    });

    it("returns 400 for a fractional index", async () => {
      const response = await whenDeletingTrack("/api/playlists/42/tracks/1.5");

      expect(response.statusCode).toBe(400);
      thenRemoveWasNotCalled();
    });

    it("returns 400 for a non-numeric index", async () => {
      const response = await whenDeletingTrack("/api/playlists/42/tracks/abc");

      expect(response.statusCode).toBe(400);
      thenRemoveWasNotCalled();
    });

    // A blank segment must not be read as position 0 and delete the first track.
    it("returns 400 for a whitespace index", async () => {
      const response = await whenDeletingTrack("/api/playlists/42/tracks/%20");

      expect(response.statusCode).toBe(400);
      thenRemoveWasNotCalled();
    });

    it("returns 400 when the id is whitespace only", async () => {
      const response = await whenDeletingTrack("/api/playlists/%20/tracks/1");

      expect(response.statusCode).toBe(400);
      thenRemoveWasNotCalled();
    });

    it("returns 503 with a user-friendly message when LMS is unreachable", async () => {
      mockLmsClient.removeSavedPlaylistTrack.mockResolvedValue(
        err({ type: "NetworkError", message: "connection refused" }),
      );

      const response = await whenDeletingTrack("/api/playlists/42/tracks/3");

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        error: "LMS_UNREACHABLE",
        message:
          "Cannot connect to music server. Please check that Lyrion Music Server is running.",
      });
      expect(mockLmsClient.removeSavedPlaylistTrack).toHaveBeenCalledWith(
        "42",
        3,
      );
    });

    it("succeeds for an unknown id, mirroring DELETE /api/playlists/:id", async () => {
      const response = await whenDeletingTrack("/api/playlists/9999/tracks/0");

      expect(response.statusCode).toBe(204);
      expect(mockLmsClient.removeSavedPlaylistTrack).toHaveBeenCalledWith(
        "9999",
        0,
      );
    });
  });
});
