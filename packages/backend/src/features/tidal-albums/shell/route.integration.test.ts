/**
 * Tidal Albums Route Integration Tests — album ID validation
 *
 * The album ID reaches LMS as `item_id:<value>`, which LMS splits at dots
 * into a browse path. These cases pin both directions: every album ID shape
 * the app actually produces still reaches LMS unchanged, and an over-deep or
 * over-long path is rejected before any LMS call happens.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { ok, err } from "@signalform/shared";
import { createTidalAlbumsRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
} from "../../../adapters/lms-client/index.js";

const defaultLmsConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getTidalAlbumTracks: ReturnType<
    typeof vi.fn<LmsClient["getTidalAlbumTracks"]>
  >;
  readonly getTidalAlbumParentItems: ReturnType<
    typeof vi.fn<LmsClient["getTidalAlbumParentItems"]>
  >;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultLmsConfig),
  getTidalAlbumTracks: vi
    .fn<LmsClient["getTidalAlbumTracks"]>()
    .mockResolvedValue(ok({ tracks: [], count: 0 })),
  getTidalAlbumParentItems: vi
    .fn<LmsClient["getTidalAlbumParentItems"]>()
    .mockResolvedValue(ok({ items: [], count: 0 })),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const codeOf = (body: string): string => {
  const parsed = JSON.parse(body) as unknown;
  return isRecord(parsed) && typeof parsed["code"] === "string"
    ? parsed["code"]
    : "";
};

// Every album ID shape observed in the wild: bare numeric, dotted browse
// paths, and the search-derived form that carries free text and a space.
const REAL_ALBUM_IDS = [
  "883",
  "123",
  "4.0",
  "6.0.1.0",
  "1.0.1.0",
  "7_sabrina carpenter.2.0.1.4",
] as const;

describe("GET /api/tidal/albums/:albumId/tracks — album ID validation", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const getTracks = async (albumId: string): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "GET",
      url: `/api/tidal/albums/${encodeURIComponent(albumId)}/tracks`,
    });

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalAlbumsRoute(server, mockLmsClient, defaultLmsConfig);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it.each(REAL_ALBUM_IDS)(
    "accepts the real-world album ID %s and forwards it to LMS unchanged",
    async (albumId) => {
      const response = await getTracks(albumId);

      expect(response.statusCode).toBe(200);
      expect(mockLmsClient.getTidalAlbumTracks).toHaveBeenCalledWith(
        albumId,
        0,
        999,
      );
    },
  );

  it("rejects a pathologically deep album ID with 400 and never calls LMS", async () => {
    const response = await getTracks("1.1.1.1.1.1.1.1.1.1");

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.getTidalAlbumTracks).not.toHaveBeenCalled();
  });

  it("never lets an over-long album ID reach LMS", async () => {
    // 414, not 400: Fastify's maxParamLength rejects the route parameter
    // before the handler runs, which is why the schema's own length ceiling
    // is set to the same value rather than a looser one.
    const response = await getTracks("9".repeat(101));

    expect(response.statusCode).toBe(414);
    expect(mockLmsClient.getTidalAlbumTracks).not.toHaveBeenCalled();
  });

  it("rejects a blank album ID with 400", async () => {
    const response = await getTracks("   ");

    expect(response.statusCode).toBe(400);
    expect(mockLmsClient.getTidalAlbumTracks).not.toHaveBeenCalled();
  });

  it("answers 503 when LMS is unreachable for an accepted album ID", async () => {
    mockLmsClient.getTidalAlbumTracks.mockResolvedValue(
      err({ type: "NetworkError", message: "LMS down" }),
    );

    const response = await getTracks("6.0.1.0");

    expect(response.statusCode).toBe(503);
    expect(codeOf(response.body)).toBe("LMS_UNREACHABLE");
  });
});

describe("GET /api/tidal/albums/:albumId — album ID validation", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const getAlbum = async (albumId: string): Promise<LightMyRequestResponse> =>
    await server.inject({
      method: "GET",
      url: `/api/tidal/albums/${encodeURIComponent(albumId)}`,
    });

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createTidalAlbumsRoute(server, mockLmsClient, defaultLmsConfig);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("accepts a search-derived album ID and forwards it to both LMS calls", async () => {
    const albumId = "7_sabrina carpenter.2.0.1.4";

    const response = await getAlbum(albumId);

    expect(response.statusCode).toBe(200);
    expect(mockLmsClient.getTidalAlbumParentItems).toHaveBeenCalledWith(
      albumId,
    );
    expect(mockLmsClient.getTidalAlbumTracks).toHaveBeenCalledWith(
      albumId,
      0,
      999,
    );
  });

  it("rejects a pathologically deep album ID with 400 and never calls LMS", async () => {
    const response = await getAlbum("1.1.1.1.1.1.1.1.1.1");

    expect(response.statusCode).toBe(400);
    expect(codeOf(response.body)).toBe("INVALID_INPUT");
    expect(mockLmsClient.getTidalAlbumParentItems).not.toHaveBeenCalled();
    expect(mockLmsClient.getTidalAlbumTracks).not.toHaveBeenCalled();
  });
});
