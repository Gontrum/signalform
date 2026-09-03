/**
 * Tidal Playlists Route Integration Tests
 *
 * Real Fastify instance, mocked LmsClient — mirrors
 * tidal-albums/shell/route.integration.test.ts. Covers the happy paths, the
 * 503 fallback on an LMS error, and the playlist-ID depth/length validation
 * that guards against the 2026-08-18 OOM incident (a deep `item_id:` path).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { ok, err } from "@signalform/shared";
import { createTidalPlaylistsRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
  type TidalAlbumRaw,
  type TidalTrackRaw,
} from "../../../adapters/lms-client/index.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getTidalPlaylists: ReturnType<
    typeof vi.fn<LmsClient["getTidalPlaylists"]>
  >;
  readonly getTidalPlaylistTracks: ReturnType<
    typeof vi.fn<LmsClient["getTidalPlaylistTracks"]>
  >;
  readonly playTidalPlaylist: ReturnType<
    typeof vi.fn<LmsClient["playTidalPlaylist"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  getTidalPlaylists: vi
    .fn<LmsClient["getTidalPlaylists"]>()
    .mockResolvedValue(ok({ items: [], count: 0 })),
  getTidalPlaylistTracks: vi
    .fn<LmsClient["getTidalPlaylistTracks"]>()
    .mockResolvedValue(ok({ items: [], count: 0 })),
  playTidalPlaylist: vi
    .fn<LmsClient["playTidalPlaylist"]>()
    .mockResolvedValue(ok(undefined)),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const codeOf = (body: string): string => {
  const parsed = JSON.parse(body) as unknown;
  return isRecord(parsed) && typeof parsed["code"] === "string"
    ? parsed["code"]
    : "";
};

const TWO_PLAYLISTS: readonly TidalAlbumRaw[] = [
  {
    id: "3.0",
    name: "Bacoben's Top 500 Rock 'n Roll Songs",
    image: "/imageproxy/tidal/1080x1080.jpg/image.jpg",
    type: "playlist",
    isaudio: 1,
    hasitems: 1,
  },
  {
    id: "3.1",
    name: "No Cover Playlist",
    type: "playlist",
    isaudio: 1,
    hasitems: 1,
  },
];

const TWO_TRACKS: readonly TidalTrackRaw[] = [
  {
    id: "3.0.0",
    name: "Stairway to Heaven (Remaster)",
    url: "tidal://36336297.flc",
    type: "audio",
    isaudio: 1,
  },
  {
    id: "3.0.1",
    name: "(I Can't Get No) Satisfaction",
    url: "tidal://5693554.flc",
    type: "audio",
    isaudio: 1,
  },
];

// Same "id with too many dots" / "id too long" fixtures as
// tidal-albums/shell/route.integration.test.ts — the schema is shared.
const OVER_DEEP_PLAYLIST_ID = "1.1.1.1.1.1.1.1.1.1";
const OVER_LONG_PLAYLIST_ID = "9".repeat(101);

describe("GET /api/tidal/playlists", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const getPlaylists = async (query = ""): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "GET",
      url: `/api/tidal/playlists${query}`,
    });

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalPlaylistsRoute(server, mockLmsClient, defaultLmsConfig);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with mapped playlists and an absolute coverArtUrl", async () => {
    mockLmsClient.getTidalPlaylists.mockResolvedValue(
      ok({ items: TWO_PLAYLISTS, count: 2 }),
    );

    const response = await getPlaylists();
    const body = response.json() as {
      readonly playlists: readonly { readonly coverArtUrl: string }[];
      readonly totalCount: number;
      readonly hasMore: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.totalCount).toBe(2);
    expect(body.playlists).toHaveLength(2);
    expect(body.playlists[0]?.coverArtUrl).toBe(
      "http://localhost:9000/imageproxy/tidal/1080x1080.jpg/image.jpg",
    );
    expect(body.playlists[1]?.coverArtUrl).toBe("");
  });

  it("answers 503 when LMS is unreachable", async () => {
    mockLmsClient.getTidalPlaylists.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS down" }),
    );

    const response = await getPlaylists();

    expect(response.statusCode).toBe(503);
  });

  it("rejects limit=0 with 400", async () => {
    const response = await getPlaylists("?limit=0");

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.getTidalPlaylists).not.toHaveBeenCalled();
  });

  it("rejects limit=9999 with 400", async () => {
    const response = await getPlaylists("?limit=9999");

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.getTidalPlaylists).not.toHaveBeenCalled();
  });
});

describe("GET /api/tidal/playlists/:id/tracks", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const getTracks = async (
    id: string,
    query = "",
  ): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "GET",
      url: `/api/tidal/playlists/${encodeURIComponent(id)}/tracks${query}`,
    });

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalPlaylistsRoute(server, mockLmsClient, defaultLmsConfig);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with mapped tracks and correct hasMore when count exceeds the page", async () => {
    mockLmsClient.getTidalPlaylistTracks.mockResolvedValue(
      ok({ items: TWO_TRACKS, count: 10 }),
    );

    const response = await getTracks("3.0", "?limit=5&offset=0");
    const body = response.json() as {
      readonly tracks: readonly { readonly title: string }[];
      readonly totalCount: number;
      readonly hasMore: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.getTidalPlaylistTracks).toHaveBeenCalledWith(
      "3.0",
      0,
      5,
    );
    expect(body.totalCount).toBe(10);
    expect(body.tracks).toHaveLength(2);
    expect(body.hasMore).toBe(true);
  });

  it("rejects an id with too many path components with 400 and never calls LMS", async () => {
    const response = await getTracks(OVER_DEEP_PLAYLIST_ID);

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.getTidalPlaylistTracks).not.toHaveBeenCalled();
  });

  it("never lets a 101-character id reach LMS", async () => {
    // 414, not 400: Fastify's maxParamLength rejects the route parameter
    // before the handler runs — same behaviour pinned in
    // tidal-albums/shell/route.integration.test.ts for :albumId.
    const response = await getTracks(OVER_LONG_PLAYLIST_ID);

    expect(response.statusCode).toBe(414);
    expect(mockLmsClient.getTidalPlaylistTracks).not.toHaveBeenCalled();
  });

  it("answers 503 when LMS is unreachable", async () => {
    mockLmsClient.getTidalPlaylistTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS down" }),
    );

    const response = await getTracks("3.0");

    expect(response.statusCode).toBe(503);
  });
});

describe("POST /api/playback/play-tidal-playlist", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const playPlaylist = async (
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "POST",
      url: "/api/playback/play-tidal-playlist",
      payload: body,
    });

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalPlaylistsRoute(server, mockLmsClient, defaultLmsConfig);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns 204 and calls playTidalPlaylist with exactly the given id", async () => {
    const response = await playPlaylist({ id: "3.0" });

    expect(response.statusCode).toBe(204);
    expect(mockLmsClient.playTidalPlaylist).toHaveBeenCalledWith("3.0");
  });

  it("rejects a body without id with 400", async () => {
    const response = await playPlaylist({});

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.playTidalPlaylist).not.toHaveBeenCalled();
  });

  it("rejects an over-deep id with 400 and never calls LMS", async () => {
    const response = await playPlaylist({ id: OVER_DEEP_PLAYLIST_ID });

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.playTidalPlaylist).not.toHaveBeenCalled();
  });

  it("answers 503 when LMS is unreachable", async () => {
    mockLmsClient.playTidalPlaylist.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS down" }),
    );

    const response = await playPlaylist({ id: "3.0" });

    expect(response.statusCode).toBe(503);
  });
});
