import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFanartClient } from "./client.js";

const fetchMock = vi.fn();

const TEST_API_KEY = "test-api-key";
const TEST_MBID = "abc-123-def";

const makeBackground = (
  url: string,
  likes: string,
): { readonly url: string; readonly likes: string } => ({ url, likes });
const makeThumb = (
  url: string,
  likes: string,
): { readonly url: string; readonly likes: string } => ({ url, likes });

describe("createFanartClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockFetch = (status: number, body: unknown): void => {
    fetchMock.mockResolvedValue({
      status,
      text: async () => JSON.stringify(body),
    });
  };

  it("returns the highest-likes artistbackground URL", async () => {
    mockFetch(200, {
      artistbackground: [
        makeBackground("https://example.com/bg-low.jpg", "5"),
        makeBackground("https://example.com/bg-high.jpg", "20"),
        makeBackground("https://example.com/bg-mid.jpg", "10"),
      ],
    });

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("https://example.com/bg-high.jpg");
    }
  });

  it("falls back to first artistthumb URL when no artistbackground entries", async () => {
    mockFetch(200, {
      artistbackground: [],
      artistthumb: [
        makeThumb("https://example.com/thumb-first.jpg", "3"),
        makeThumb("https://example.com/thumb-second.jpg", "7"),
      ],
    });

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // First thumb (not highest-likes) — plan spec says "first artistthumb"
      expect(result.value).toBe("https://example.com/thumb-first.jpg");
    }
  });

  it("returns null when both artistbackground and artistthumb are empty", async () => {
    mockFetch(200, {
      artistbackground: [],
      artistthumb: [],
    });

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("returns null when both artistbackground and artistthumb are absent", async () => {
    mockFetch(200, {});

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("returns NotFoundError on 404", async () => {
    fetchMock.mockResolvedValue({
      status: 404,
      text: async () => "Not found",
    });

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFoundError");
    }
  });

  it("returns NetworkError on fetch rejection", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
      expect(result.error.message).toBe("Connection refused");
    }
  });

  it("returns TimeoutError when AbortSignal fires", async () => {
    const abortError = new DOMException(
      "The operation was aborted",
      "TimeoutError",
    );
    fetchMock.mockRejectedValue(abortError);

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("TimeoutError");
    }
  });

  it("returns ParseError on malformed JSON", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => "this is not json {{{",
    });

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ParseError");
    }
  });

  it("correctly selects highest likes when values need parseInt (string comparison would give wrong order)", async () => {
    // "9" > "20" lexicographically but 9 < 20 numerically — verify parseInt is used
    mockFetch(200, {
      artistbackground: [
        makeBackground("https://example.com/nine.jpg", "9"),
        makeBackground("https://example.com/twenty.jpg", "20"),
      ],
    });

    const client = createFanartClient(TEST_API_KEY);
    const result = await client.getArtistImages(TEST_MBID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("https://example.com/twenty.jpg");
    }
  });
});
