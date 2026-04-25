import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@signalform/shared";
import {
  getAlbumEnrichment,
  getArtistEnrichment,
  getSimilarArtistsEnrichment,
} from "./enrichment-service.js";
import type {
  LastFmAlbumInfo,
  LastFmArtistInfo,
  SimilarArtist,
} from "../core/types.js";
import type { Language } from "../../../infrastructure/config/index.js";

type LastFmError = {
  readonly type:
    | "NotFoundError"
    | "CircuitOpenError"
    | "NetworkError"
    | "TimeoutError"
    | "ParseError";
  readonly message: string;
  readonly code?: number;
};

type MockLastFmClient = {
  readonly getSimilarArtists: ReturnType<
    typeof vi.fn<
      (
        name: string,
        limit: number,
      ) => Promise<
        | ReturnType<typeof ok<readonly SimilarArtist[]>>
        | ReturnType<typeof err<LastFmError>>
      >
    >
  >;
  readonly getArtistInfo: ReturnType<
    typeof vi.fn<
      (
        name: string,
        language: Language,
      ) => Promise<
        | ReturnType<typeof ok<LastFmArtistInfo>>
        | ReturnType<typeof err<LastFmError>>
      >
    >
  >;
  readonly getAlbumInfo: ReturnType<
    typeof vi.fn<
      (
        artist: string,
        album: string,
        language: Language,
      ) => Promise<
        | ReturnType<typeof ok<LastFmAlbumInfo>>
        | ReturnType<typeof err<LastFmError>>
      >
    >
  >;
};

const makeArtistInfo = (): LastFmArtistInfo => ({
  name: "Die Ärzte",
  mbid: "abc123",
  listeners: 500000,
  playcount: 10000000,
  tags: ["punk", "rock"],
  bio: "<p>A German punk band.</p>",
});

const makeAlbumInfo = (): LastFmAlbumInfo => ({
  name: "Geräusch",
  mbid: "def456",
  listeners: 100000,
  playcount: 2000000,
  tags: ["punk", "alternative"],
  wiki: "<p>An album by Die Ärzte.</p>",
});

const makeSimilarArtists = (): readonly SimilarArtist[] => [
  {
    name: "Tocotronic",
    mbid: "mbid-1",
    match: 0.9,
    url: "https://www.last.fm/music/Tocotronic",
  },
  {
    name: "Wizo",
    mbid: undefined,
    match: 0.8,
    url: "https://www.last.fm/music/Wizo",
  },
];

const defaultLanguage: Language = "en";

const unavailableError = (
  type: Extract<
    LastFmError["type"],
    "CircuitOpenError" | "NetworkError" | "TimeoutError" | "ParseError"
  >,
  message: string,
): LastFmError => ({ type, message });

const makeMockClient = (): MockLastFmClient => ({
  getSimilarArtists: vi.fn(),
  getArtistInfo: vi.fn(),
  getAlbumInfo: vi.fn(),
});

describe("getArtistEnrichment", () => {
  it("returns ArtistEnrichment on happy path", async () => {
    const client = makeMockClient();
    client.getArtistInfo.mockResolvedValue(ok(makeArtistInfo()));

    const result = await getArtistEnrichment(
      "Die Ärzte",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.name).toBe("Die Ärzte");
    expect(result.value.mbid).toBe("abc123");
    expect(result.value.listeners).toBe(500000);
    expect(result.value.playcount).toBe(10000000);
    expect(result.value.tags).toEqual(["punk", "rock"]);
    expect(result.value.bio).toBe("<p>A German punk band.</p>");
  });

  it("maps NotFoundError to EnrichmentError { type: 'NotFound' }", async () => {
    const client = makeMockClient();
    client.getArtistInfo.mockResolvedValue(
      err({
        type: "NotFoundError",
        code: 6,
        message: "Artist not found",
      }),
    );

    const result = await getArtistEnrichment(
      "Unknown Artist",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("NotFound");
    expect(result.error.message).toBe("Artist not found");
  });

  it("maps CircuitOpenError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getArtistInfo.mockResolvedValue(
      err(unavailableError("CircuitOpenError", "Circuit breaker is open")),
    );

    const result = await getArtistEnrichment(
      "Die Ärzte",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });

  it("maps NetworkError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getArtistInfo.mockResolvedValue(
      err(unavailableError("NetworkError", "Connection refused")),
    );

    const result = await getArtistEnrichment(
      "Die Ärzte",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });

  it("maps TimeoutError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getArtistInfo.mockResolvedValue(
      err(unavailableError("TimeoutError", "Request timed out")),
    );

    const result = await getArtistEnrichment(
      "Die Ärzte",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });

  it("maps ParseError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getArtistInfo.mockResolvedValue(
      err(unavailableError("ParseError", "Unexpected token")),
    );

    const result = await getArtistEnrichment(
      "Die Ärzte",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });
});

describe("getAlbumEnrichment", () => {
  it("returns AlbumEnrichment on happy path", async () => {
    const client = makeMockClient();
    client.getAlbumInfo.mockResolvedValue(ok(makeAlbumInfo()));

    const result = await getAlbumEnrichment(
      "Die Ärzte",
      "Geräusch",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.name).toBe("Geräusch");
    expect(result.value.mbid).toBe("def456");
    expect(result.value.listeners).toBe(100000);
    expect(result.value.playcount).toBe(2000000);
    expect(result.value.tags).toEqual(["punk", "alternative"]);
    expect(result.value.wiki).toBe("<p>An album by Die Ärzte.</p>");
  });

  it("maps NotFoundError to EnrichmentError { type: 'NotFound' }", async () => {
    const client = makeMockClient();
    client.getAlbumInfo.mockResolvedValue(
      err({
        type: "NotFoundError",
        code: 6,
        message: "Album not found",
      }),
    );

    const result = await getAlbumEnrichment(
      "Die Ärzte",
      "Nonexistent",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("NotFound");
    expect(result.error.message).toBe("Album not found");
  });

  it("maps CircuitOpenError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getAlbumInfo.mockResolvedValue(
      err(unavailableError("CircuitOpenError", "Circuit breaker is open")),
    );

    const result = await getAlbumEnrichment(
      "Die Ärzte",
      "Geräusch",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });

  it("maps NetworkError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getAlbumInfo.mockResolvedValue(
      err(unavailableError("NetworkError", "Connection refused")),
    );

    const result = await getAlbumEnrichment(
      "Die Ärzte",
      "Geräusch",
      client,
      defaultLanguage,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });
});

describe("getSimilarArtistsEnrichment", () => {
  it("returns array of SimilarArtist on happy path", async () => {
    const client = makeMockClient();
    client.getSimilarArtists.mockResolvedValue(ok(makeSimilarArtists()));

    const result = await getSimilarArtistsEnrichment("Die Ärzte", client);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.name).toBe("Tocotronic");
    expect(result.value[1]?.name).toBe("Wizo");
  });

  it("returns ok([]) when last.fm returns empty array", async () => {
    const client = makeMockClient();
    client.getSimilarArtists.mockResolvedValue(ok([]));

    const result = await getSimilarArtistsEnrichment("UnknownArtist", client);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual([]);
  });

  it("maps NotFoundError to EnrichmentError { type: 'NotFound' }", async () => {
    const client = makeMockClient();
    client.getSimilarArtists.mockResolvedValue(
      err({ type: "NotFoundError", code: 6, message: "Artist not found" }),
    );

    const result = await getSimilarArtistsEnrichment("Unknown", client);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("NotFound");
    expect(result.error.message).toBe("Artist not found");
  });

  it("maps CircuitOpenError to EnrichmentError { type: 'Unavailable' }", async () => {
    const client = makeMockClient();
    client.getSimilarArtists.mockResolvedValue(
      err(unavailableError("CircuitOpenError", "Circuit breaker is open")),
    );

    const result = await getSimilarArtistsEnrichment("Die Ärzte", client);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.type).toBe("Unavailable");
  });
});
