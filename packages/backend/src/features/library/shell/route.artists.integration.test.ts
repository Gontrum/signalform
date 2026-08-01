import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createLibraryRoute } from "./route.js";
import { clearLibraryCache } from "./service.js";
import {
  createLmsClient,
  type LibraryArtistRaw,
  type LmsClient,
  type LmsConfig,
  type RescanProgress,
} from "../../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getLibraryArtists: ReturnType<
    typeof vi.fn<LmsClient["getLibraryArtists"]>
  >;
  readonly rescanLibrary: ReturnType<typeof vi.fn<LmsClient["rescanLibrary"]>>;
  readonly getRescanProgress: ReturnType<
    typeof vi.fn<LmsClient["getRescanProgress"]>
  >;
};

const idleRescan: RescanProgress = {
  scanning: false,
  step: "",
  info: "",
  totalTime: "00:00:04",
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getLibraryArtists: vi
    .fn<LmsClient["getLibraryArtists"]>()
    .mockResolvedValue(ok({ artists: [], count: 0 })),
  rescanLibrary: vi
    .fn<LmsClient["rescanLibrary"]>()
    .mockResolvedValue(ok(undefined)),
  getRescanProgress: vi
    .fn<LmsClient["getRescanProgress"]>()
    .mockResolvedValue(ok(idleRescan)),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asRecords = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const parseBody = (body: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(body);
  expect(isRecord(parsed)).toBe(true);
  return isRecord(parsed) ? parsed : {};
};

const artistsOf = (
  body: string,
): readonly { readonly id: unknown; readonly name: unknown }[] =>
  asRecords(parseBody(body)["artists"]).map((artist) => ({
    id: artist["id"],
    name: artist["name"],
  }));

const namesOf = (body: string): readonly unknown[] =>
  artistsOf(body).map((artist) => artist.name);

const hasMoreOf = (body: string): unknown => parseBody(body)["hasMore"];

const codeOf = (body: string): unknown => parseBody(body)["code"];

const rawArtists = (...names: readonly string[]): readonly LibraryArtistRaw[] =>
  names.map((name, index) => ({ id: index + 1, artist: name }));

describe("GET /api/library/artists", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const get = async (query: string = ""): Promise<string> =>
    (
      await server.inject({
        method: "GET",
        url: `/api/library/artists${query}`,
      })
    ).body;

  const statusOf = async (query: string): Promise<number> =>
    (
      await server.inject({
        method: "GET",
        url: `/api/library/artists${query}`,
      })
    ).statusCode;

  beforeEach(async () => {
    clearLibraryCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createLibraryRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with the artists LMS delivered, in LMS order", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("ABBA", "Bowie", "Cure"), count: 3 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/library/artists",
    });

    expect(response.statusCode).toBe(200);
    expect(artistsOf(response.body)).toEqual([
      { id: "1", name: "ABBA" },
      { id: "2", name: "Bowie" },
      { id: "3", name: "Cure" },
    ]);
  });

  it("passes offset and limit through to LMS", async () => {
    await get("?offset=40&limit=20");

    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledWith(40, 20, {
      search: undefined,
    });
  });

  it("defaults to the first page when no parameters are given", async () => {
    await get();

    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledWith(0, 250, {
      search: undefined,
    });
  });

  it("reports hasMore while artists remain beyond the window", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("ABBA", "Bowie"), count: 431 }),
    );

    expect(hasMoreOf(await get("?offset=0&limit=2"))).toBe(true);
  });

  it("reports no hasMore on the last page", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("Yello", "Zappa"), count: 42 }),
    );

    expect(hasMoreOf(await get("?offset=40&limit=20"))).toBe(false);
  });

  it("passes the search term through", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("Pink Floyd"), count: 1 }),
    );

    expect(namesOf(await get("?search=floyd"))).toEqual(["Pink Floyd"]);
    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledWith(0, 250, {
      search: "floyd",
    });
  });

  it("trims the search term before passing it on", async () => {
    await get("?search=%20floyd%20");

    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledWith(0, 250, {
      search: "floyd",
    });
  });

  it("treats an empty search term as no search", async () => {
    await get("?search=");

    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledWith(0, 250, {
      search: undefined,
    });
  });

  it("treats a whitespace-only search term as no search", async () => {
    await get("?search=%20%20%20");

    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledWith(0, 250, {
      search: undefined,
    });
  });

  it("returns 400 for a non-numeric limit", async () => {
    expect(await statusOf("?limit=abc")).toBe(400);
    expect(codeOf(await get("?limit=abc"))).toBe("INVALID_INPUT");
    expect(mockLmsClient.getLibraryArtists).not.toHaveBeenCalled();
  });

  it("returns 400 for a limit outside the allowed range", async () => {
    expect(await statusOf("?limit=0")).toBe(400);
    expect(await statusOf("?limit=1000")).toBe(400);
  });

  it("returns 400 for a negative offset", async () => {
    expect(await statusOf("?offset=-1")).toBe(400);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    expect(await statusOf("")).toBe(503);
    expect(codeOf(await get())).toBe("LMS_UNREACHABLE");
  });
});

describe("GET /api/library/artists caching", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const get = async (query: string = ""): Promise<string> =>
    (
      await server.inject({
        method: "GET",
        url: `/api/library/artists${query}`,
      })
    ).body;

  beforeEach(async () => {
    clearLibraryCache();
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    createLibraryRoute(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("answers a repeated request from the cache", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("ABBA"), count: 1 }),
    );

    expect(namesOf(await get("?search=abba"))).toEqual(["ABBA"]);
    expect(namesOf(await get("?search=abba"))).toEqual(["ABBA"]);
    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledOnce();
  });

  // Regression guard: an album cache key without the search term once served
  // one search's page to a different search.
  it("does not answer a search with another search's page", async () => {
    mockLmsClient.getLibraryArtists
      .mockResolvedValueOnce(
        ok({ artists: rawArtists("Pink Floyd"), count: 1 }),
      )
      .mockResolvedValueOnce(ok({ artists: rawArtists("Queen"), count: 1 }));

    expect(namesOf(await get("?search=floyd"))).toEqual(["Pink Floyd"]);
    expect(namesOf(await get("?search=queen"))).toEqual(["Queen"]);
    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledTimes(2);
  });

  it("does not answer a page with a different page of the same search", async () => {
    mockLmsClient.getLibraryArtists
      .mockResolvedValueOnce(ok({ artists: rawArtists("ABBA"), count: 60 }))
      .mockResolvedValueOnce(ok({ artists: rawArtists("Zappa"), count: 60 }))
      .mockResolvedValueOnce(ok({ artists: rawArtists("Yello"), count: 60 }));

    expect(namesOf(await get("?offset=0&limit=20"))).toEqual(["ABBA"]);
    expect(namesOf(await get("?offset=20&limit=20"))).toEqual(["Zappa"]);
    expect(namesOf(await get("?offset=20&limit=40"))).toEqual(["Yello"]);
    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledTimes(3);
  });

  it("drops the artist cache together with the rest on rescan", async () => {
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("Before"), count: 1 }),
    );

    await get();
    await get();
    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledOnce();

    await server.inject({ method: "POST", url: "/api/library/rescan" });
    await server.inject({ method: "GET", url: "/api/library/rescan/status" });
    mockLmsClient.getLibraryArtists.mockResolvedValue(
      ok({ artists: rawArtists("After"), count: 1 }),
    );

    expect(namesOf(await get())).toEqual(["After"]);
    expect(mockLmsClient.getLibraryArtists).toHaveBeenCalledTimes(2);
  });
});
