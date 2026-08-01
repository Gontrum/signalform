import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err, type Result } from "@signalform/shared";
import { createLibraryRoute } from "./route.js";
import { clearLibraryCache } from "./service.js";
import {
  createLmsClient,
  type LibraryAlbumRaw,
  type LmsClient,
  type LmsConfig,
  type LmsError,
  type RescanProgress,
} from "../../../adapters/lms-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

type MockLmsClient = LmsClient & {
  readonly getLibraryAlbums: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbums"]>
  >;
  readonly getLibraryAlbumCount: ReturnType<
    typeof vi.fn<LmsClient["getLibraryAlbumCount"]>
  >;
  readonly getLibraryYears: ReturnType<
    typeof vi.fn<LmsClient["getLibraryYears"]>
  >;
  readonly getGenres: ReturnType<typeof vi.fn<LmsClient["getGenres"]>>;
  readonly rescanLibrary: ReturnType<typeof vi.fn<LmsClient["rescanLibrary"]>>;
  readonly getRescanProgress: ReturnType<
    typeof vi.fn<LmsClient["getRescanProgress"]>
  >;
};

const rescanProgress = (scanning: boolean): RescanProgress => ({
  scanning,
  step: scanning ? "importing" : "",
  info: "",
  totalTime: "00:00:04",
});

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getLibraryAlbums: vi
    .fn<LmsClient["getLibraryAlbums"]>()
    .mockResolvedValue(ok({ albums: [], count: 0 })),
  getLibraryAlbumCount: vi
    .fn<LmsClient["getLibraryAlbumCount"]>()
    .mockResolvedValue(ok(0)),
  getLibraryYears: vi
    .fn<LmsClient["getLibraryYears"]>()
    .mockResolvedValue(ok([2011, 2013])),
  getGenres: vi
    .fn<LmsClient["getGenres"]>()
    .mockResolvedValue(ok([{ id: 1, name: "Rock" }])),
  rescanLibrary: vi
    .fn<LmsClient["rescanLibrary"]>()
    .mockResolvedValue(ok(undefined)),
  getRescanProgress: vi
    .fn<LmsClient["getRescanProgress"]>()
    .mockResolvedValue(ok(rescanProgress(false))),
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

const albumTitles = (body: string): readonly string[] =>
  asRecords(parseBody(body)["albums"]).map((album) =>
    typeof album["title"] === "string" ? album["title"] : "",
  );

const genreCounts = (body: string): readonly unknown[] =>
  asRecords(parseBody(body)["genres"]).map((genre) => genre["albumCount"]);

const rawAlbum = (id: number, title: string): LibraryAlbumRaw => ({
  id,
  album: title,
  artist: `Artist ${id}`,
  year: 2013,
  artwork_track_id: `art${id}`,
});

const albumPage = (
  title: string,
): Result<
  { readonly albums: readonly LibraryAlbumRaw[]; readonly count: number },
  LmsError
> => ok({ albums: [rawAlbum(1, title)], count: 1 });

const settlePendingWork = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (value: T): void => settle(value) };
};

describe("library rescan invalidation", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  const albums = async (): Promise<string> =>
    (await server.inject({ method: "GET", url: "/api/library/albums" })).body;

  const genres = async (): Promise<string> =>
    (await server.inject({ method: "GET", url: "/api/library/genres" })).body;

  const triggerRescan = async (): Promise<number> =>
    (await server.inject({ method: "POST", url: "/api/library/rescan" }))
      .statusCode;

  const pollStatus = async (scanning: boolean): Promise<number> => {
    mockLmsClient.getRescanProgress.mockResolvedValue(
      ok(rescanProgress(scanning)),
    );
    return (
      await server.inject({ method: "GET", url: "/api/library/rescan/status" })
    ).statusCode;
  };

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

  it("answers 202 when LMS accepts the rescan", async () => {
    const statusCode = await triggerRescan();

    expect(statusCode).toBe(202);
    expect(mockLmsClient.rescanLibrary).toHaveBeenCalledOnce();
  });

  it("returns 503 when the rescan command fails", async () => {
    mockLmsClient.rescanLibrary.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    expect(await triggerRescan()).toBe(503);
  });

  it("returns 503 when the progress query fails", async () => {
    mockLmsClient.getRescanProgress.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/library/rescan/status",
    });

    expect(response.statusCode).toBe(503);
  });

  it("drops the album cache when the rescan is triggered", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(albumPage("Before"));

    await albums();
    await albums();
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();

    await triggerRescan();
    mockLmsClient.getLibraryAlbums.mockResolvedValue(albumPage("After"));

    expect(albumTitles(await albums())).toEqual(["After"]);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(2);
  });

  // The scan is asynchronous: everything cached between trigger and completion
  // still holds pre-scan data, so completion has to clear a second time.
  it("drops caches refilled during the scan once LMS reports it finished", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(albumPage("Before"));

    await triggerRescan();
    await albums();
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();

    expect(await pollStatus(true)).toBe(200);
    await albums();
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();

    expect(await pollStatus(false)).toBe(200);
    mockLmsClient.getLibraryAlbums.mockResolvedValue(albumPage("After"));

    expect(albumTitles(await albums())).toEqual(["After"]);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledTimes(2);
  });

  it("keeps the caches for a status poll without a preceding rescan", async () => {
    mockLmsClient.getLibraryAlbums.mockResolvedValue(albumPage("Before"));

    await albums();
    await pollStatus(false);
    await pollStatus(false);

    expect(albumTitles(await albums())).toEqual(["Before"]);
    expect(mockLmsClient.getLibraryAlbums).toHaveBeenCalledOnce();
  });

  it("drops the year and genre caches together with the albums", async () => {
    await server.inject({
      method: "GET",
      url: "/api/library/albums?decade=2010s",
    });
    await genres();
    expect(mockLmsClient.getLibraryYears).toHaveBeenCalledOnce();
    expect(mockLmsClient.getGenres).toHaveBeenCalledOnce();

    await triggerRescan();
    await pollStatus(false);

    await server.inject({
      method: "GET",
      url: "/api/library/albums?decade=2010s",
    });
    await genres();

    expect(mockLmsClient.getLibraryYears).toHaveBeenCalledTimes(2);
    expect(mockLmsClient.getGenres).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh warm-up pass when the rescan overtook a running one", async () => {
    const preScanPass = createDeferred<Result<number, LmsError>>();
    mockLmsClient.getLibraryAlbumCount.mockReturnValue(preScanPass.promise);

    await genres();
    await triggerRescan();
    await pollStatus(false);

    preScanPass.resolve(ok(42));
    await settlePendingWork();

    mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(7));
    expect(genreCounts(await genres())).toEqual([undefined]);

    await vi.waitFor(() =>
      expect(mockLmsClient.getLibraryAlbumCount).toHaveBeenCalledTimes(2),
    );
    expect(genreCounts(await genres())).toEqual([7]);
  });

  // Worst case of the same race: the pre-scan pass answers *after* the pass
  // that ran against the rescanned library, so its counts must not win.
  it("ignores counts from a pre-scan pass that finishes last", async () => {
    const preScanPass = createDeferred<Result<number, LmsError>>();
    mockLmsClient.getLibraryAlbumCount.mockReturnValue(preScanPass.promise);

    await genres();
    await triggerRescan();
    await pollStatus(false);

    mockLmsClient.getLibraryAlbumCount.mockResolvedValue(ok(7));
    await genres();
    await vi.waitFor(async () =>
      expect(genreCounts(await genres())).toEqual([7]),
    );

    preScanPass.resolve(ok(42));
    await settlePendingWork();

    expect(genreCounts(await genres())).toEqual([7]);
  });
});
