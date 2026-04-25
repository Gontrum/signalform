/**
 * Autocomplete Route Integration Tests
 *
 * Tests the HTTP layer for autocomplete endpoint.
 * Uses Given/When/Then pattern with helper functions.
 */

import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createSearchRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";
import { ok, err } from "@signalform/shared";

type MockLmsClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
};

type SuggestionResponse = {
  readonly suggestions: readonly unknown[];
};

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient({
    host: "localhost",
    port: 9000,
    playerId: "00:00:00:00:00:00",
    timeout: 5000,
    retryBaseDelayMs: 0,
  }),
  search: vi.fn<LmsClient["search"]>(),
});

const parseJson = (body: string): unknown => JSON.parse(body);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const parseSuggestionsBody = (body: string): SuggestionResponse => {
  const parsed = parseJson(body);
  const suggestions =
    isRecord(parsed) && Array.isArray(parsed["suggestions"])
      ? parsed["suggestions"]
      : null;
  expect(suggestions).not.toBeNull();
  return { suggestions: suggestions ?? [] };
};

const parseCodeBody = (body: string): { readonly code: string } => {
  const parsed = parseJson(body);
  const code =
    isRecord(parsed) && typeof parsed["code"] === "string"
      ? parsed["code"]
      : null;
  expect(code).not.toBeNull();
  return { code: code ?? "" };
};

const parseMessageBody = (body: string): { readonly message: string } => {
  const parsed = parseJson(body);
  const message =
    isRecord(parsed) && typeof parsed["message"] === "string"
      ? parsed["message"]
      : null;
  expect(message).not.toBeNull();
  return { message: message ?? "" };
};

const givenLmsReturnsValidAutocompleteResults = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    ok([
      {
        id: "track-money",
        title: "Money",
        artist: "Pink Floyd",
        album: "The Dark Side of the Moon",
        url: "local://tracks/money",
        source: "local" as const,
        type: "track" as const,
      },
      {
        id: "track-wish-you",
        title: "Wish You Were Here",
        artist: "Pink Floyd",
        album: "Wish You Were Here",
        url: "local://tracks/wish-you-were-here",
        source: "local" as const,
        type: "track" as const,
      },
      {
        id: "track-time",
        title: "Time",
        artist: "Pink Floyd",
        album: "The Dark Side of the Moon",
        url: "local://tracks/time",
        source: "local" as const,
        type: "track" as const,
      },
    ]),
  );
};

const givenLmsIsUnreachable = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    err({
      type: "NetworkError",
      message: "Cannot connect to LMS server",
    }),
  );
};

const givenLmsReturnsEmptyResults = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(ok([]));
};

const givenLmsReturnsMixedResults = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  mockLmsClient.search.mockResolvedValue(
    ok([
      {
        id: "artist-pink-floyd",
        title: "Pink Floyd",
        artist: "Pink Floyd",
        album: "",
        url: "",
        source: "local" as const,
        type: "artist" as const,
      },
      {
        id: "track-comfortably-numb",
        title: "Comfortably Numb",
        artist: "Pink Floyd",
        album: "The Wall",
        url: "",
        source: "local" as const,
        type: "track" as const,
      },
      {
        id: "album-dark-side",
        title: "The Dark Side of the Moon",
        artist: "Pink Floyd",
        album: "The Dark Side of the Moon",
        url: "",
        source: "local" as const,
        type: "album" as const,
      },
    ]),
  );
};

const givenLmsReturns10Results = async (
  mockLmsClient: MockLmsClient,
): Promise<void> => {
  const results = Array.from({ length: 10 }, (_, i) => ({
    id: `track-${i}`,
    title: `Track ${i}`,
    artist: `Artist ${i}`,
    album: `Album ${i}`,
    url: `local://tracks/track-${i}`,
    source: "local" as const,
    type: "track" as const,
  }));

  mockLmsClient.search.mockResolvedValue(ok(results));
};

const whenAutocompleteRequestIsSent = async (
  app: FastifyInstance,
  query: string,
): Promise<InjectResponse> => {
  return app.inject({
    method: "GET",
    url: `/api/search/autocomplete?q=${encodeURIComponent(query)}`,
  });
};

const whenAutocompleteRequestIsSentWithoutQuery = async (
  app: FastifyInstance,
): Promise<InjectResponse> => {
  return app.inject({
    method: "GET",
    url: "/api/search/autocomplete",
  });
};

const thenResponseIsSuccessful = async (
  response: InjectResponse,
): Promise<void> => {
  expect(response.statusCode).toBe(200);
};

const thenResponseStatusIs = async (
  response: InjectResponse,
  statusCode: number,
): Promise<void> => {
  expect(response.statusCode).toBe(statusCode);
};

const thenResponseContainsTop5Results = async (
  response: InjectResponse,
): Promise<void> => {
  const body = parseSuggestionsBody(response.body);
  expect(body.suggestions.length).toBeLessThanOrEqual(5);
};

const thenResultsAreOnlyArtistsAndAlbums = async (
  response: InjectResponse,
): Promise<void> => {
  const body = parseSuggestionsBody(response.body);
  const allArtistsOrAlbums = body.suggestions.every(
    (suggestion) =>
      isRecord(suggestion) &&
      (suggestion["type"] === "artist" || suggestion["type"] === "album"),
  );
  expect(allArtistsOrAlbums).toBe(true);
};

const thenResponseContainsError = async (
  response: InjectResponse,
  errorMessage: string,
): Promise<void> => {
  const body = parseMessageBody(response.body);
  expect(body.message).toContain(errorMessage);
};

const thenResponseContainsErrorCode = async (
  response: InjectResponse,
  errorCode: string,
): Promise<void> => {
  const body = parseCodeBody(response.body);
  expect(body.code).toBe(errorCode);
};

const thenResponseContainsEmptyResults = async (
  response: InjectResponse,
): Promise<void> => {
  const body = parseSuggestionsBody(response.body);
  expect(body.suggestions).toEqual([]);
};

const thenResponseTimeIsUnder200ms = async (
  duration: number,
): Promise<void> => {
  expect(duration).toBeLessThan(200);
};

const thenResponseContainsExactlyNResults = async (
  response: InjectResponse,
  count: number,
): Promise<void> => {
  const body = parseSuggestionsBody(response.body);
  expect(body.suggestions.length).toBe(count);
};

describe("GET /api/search/autocomplete", () => {
  let app: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    mockLmsClient = createMockLmsClient();
    createSearchRoute(app, mockLmsClient);
    await app.ready();
  });

  afterEach(() => {
    void app.close();
  });

  it("returns top 5 artist/album matches when query is valid", async () => {
    await givenLmsReturnsValidAutocompleteResults(mockLmsClient);

    const response = await whenAutocompleteRequestIsSent(app, "Pink");

    await thenResponseIsSuccessful(response);
    await thenResponseContainsTop5Results(response);
    await thenResultsAreOnlyArtistsAndAlbums(response);
  });

  it("returns 400 when query is less than 2 characters", async () => {
    const response = await whenAutocompleteRequestIsSent(app, "P");

    await thenResponseStatusIs(response, 400);
    await thenResponseContainsErrorCode(response, "INVALID_INPUT");
  });

  it("returns 400 when query parameter is missing", async () => {
    const response = await whenAutocompleteRequestIsSentWithoutQuery(app);

    await thenResponseStatusIs(response, 400);
  });

  it("returns 400 when query is only whitespace", async () => {
    const response = await whenAutocompleteRequestIsSent(app, "   ");

    await thenResponseStatusIs(response, 400);
  });

  it("returns 503 when LMS is unreachable", async () => {
    await givenLmsIsUnreachable(mockLmsClient);

    const response = await whenAutocompleteRequestIsSent(app, "Pink");

    await thenResponseStatusIs(response, 503);
    await thenResponseContainsError(response, "LMS not reachable");
  });

  it("returns empty array when no matches found", async () => {
    await givenLmsReturnsEmptyResults(mockLmsClient);

    const response = await whenAutocompleteRequestIsSent(app, "zzzzzz");

    await thenResponseIsSuccessful(response);
    await thenResponseContainsEmptyResults(response);
  });

  it("responds in less than 200ms (95th percentile)", async () => {
    await givenLmsReturnsValidAutocompleteResults(mockLmsClient);

    const startTime = Date.now();
    const response = await whenAutocompleteRequestIsSent(app, "Pink Floyd");
    const duration = Date.now() - startTime;

    await thenResponseIsSuccessful(response);
    await thenResponseTimeIsUnder200ms(duration);
  });

  it("filters out tracks and returns only artists and albums", async () => {
    await givenLmsReturnsMixedResults(mockLmsClient);

    const response = await whenAutocompleteRequestIsSent(app, "Pink");

    await thenResponseIsSuccessful(response);
    await thenResultsAreOnlyArtistsAndAlbums(response);
  });

  it("limits results to top 5 when more matches exist", async () => {
    await givenLmsReturns10Results(mockLmsClient);

    const response = await whenAutocompleteRequestIsSent(app, "Pi");

    await thenResponseIsSuccessful(response);
    await thenResponseContainsExactlyNResults(response, 5);
  });
});
