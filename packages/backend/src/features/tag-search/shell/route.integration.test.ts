import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { createTagSearchRoute } from "./route.js";
import { createLastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  LastFmClient,
  TagSearchResult,
} from "../../../adapters/lastfm-client/index.js";

const defaultLastFmConfig = {
  apiKey: "test-key",
  timeout: 5000,
  baseUrl: "https://ws.audioscrobbler.com/2.0/",
  language: "en" as const,
};

type MockLastFmClient = LastFmClient & {
  readonly searchTags: ReturnType<typeof vi.fn<LastFmClient["searchTags"]>>;
};

const createMockLastFmClient = (): MockLastFmClient => ({
  ...createLastFmClient(defaultLastFmConfig),
  searchTags: vi.fn<LastFmClient["searchTags"]>().mockResolvedValue(ok([])),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getTagsLength = (parsed: unknown): number | undefined => {
  if (!isRecord(parsed)) {
    return undefined;
  }
  const tags = parsed["tags"];
  return Array.isArray(tags) ? tags.length : undefined;
};

const makeTagSearchResult = (name: string): TagSearchResult => ({
  name,
  count: 1000,
  url: `https://last.fm/tag/${name}`,
});

describe("GET /api/tags/search", () => {
  let server: FastifyInstance;
  let mockLastFmClient: MockLastFmClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLastFmClient = createMockLastFmClient();
    server = Fastify({ logger: false });
    createTagSearchRoute(server, mockLastFmClient);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with tags array on happy path", async () => {
    mockLastFmClient.searchTags.mockResolvedValue(
      ok([makeTagSearchResult("jazz"), makeTagSearchResult("jazz fusion")]),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tags/search?q=jazz",
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && Array.isArray(parsed["tags"])).toBe(true);
    expect(getTagsLength(parsed)).toBe(2);
  });

  it("returns 503 when Last.fm searchTags fails", async () => {
    mockLastFmClient.searchTags.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/tags/search?q=jazz",
    });

    expect(response.statusCode).toBe(503);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && parsed["error"]).toBe("Last.fm unavailable");
  });

  it("returns 400 when q parameter is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/tags/search",
    });

    expect(response.statusCode).toBe(400);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && typeof parsed["error"] === "string").toBe(true);
  });

  it("returns 200 with empty tags array when Last.fm returns no results", async () => {
    mockLastFmClient.searchTags.mockResolvedValue(ok([]));

    const response = await server.inject({
      method: "GET",
      url: "/api/tags/search?q=xyznonexistent",
    });

    expect(response.statusCode).toBe(200);
    const parsed = parseJson(response.body);
    expect(isRecord(parsed) && Array.isArray(parsed["tags"])).toBe(true);
    expect(getTagsLength(parsed)).toBe(0);
  });
});
