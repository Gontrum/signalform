import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TagDescriptor } from "@signalform/shared";
import { createDiscogsClient } from "./client.js";
import type { DiscogsQuery } from "./types.js";

const fetchMock = vi.fn();

const TEXT_TAG: TagDescriptor = {
  id: "qsound",
  label: "QSound",
  mode: "text",
  term: "qsound",
};

const FORMAT_TAG: TagDescriptor = {
  id: "sacd",
  label: "SACD",
  mode: "format",
  term: "SACD",
};

const TEST_QUERY: DiscogsQuery = { tag: TEXT_TAG };
const TEST_TOKEN = "test-discogs-token";
// Four inter-page waits of 1100ms plus headroom.
const ALL_PAGE_DELAYS_MS = 10_000;

const makeResponse = (
  status: number,
  body: unknown,
): { readonly status: number; readonly text: () => Promise<string> } => ({
  status,
  text: async () => JSON.stringify(body),
});

const makePageWithItems = (
  page: number,
  pages: number,
  items: number,
  results: readonly unknown[],
): { readonly status: number; readonly text: () => Promise<string> } =>
  makeResponse(200, {
    pagination: { page, pages, items },
    results,
  });

const makePage = (
  page: number,
  pages: number,
  results: readonly unknown[],
): { readonly status: number; readonly text: () => Promise<string> } =>
  makePageWithItems(page, pages, pages * 100, results);

const requestUrl = (index: number): URL =>
  new URL(String(fetchMock.mock.calls[index]?.[0]));

const requestHeaders = (index: number): unknown =>
  fetchMock.mock.calls[index]?.[1]?.headers;

const requestedPages = (): readonly (string | null)[] =>
  fetchMock.mock.calls.map((call) =>
    new URL(String(call[0])).searchParams.get("page"),
  );

const respondPerPage = (totalPages: number): void => {
  fetchMock.mockImplementation(async (url: unknown) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return makePage(page, totalPages, [
      {
        id: page,
        title: `Artist ${page} - Album ${page}`,
        year: `${1990 + page}`,
      },
    ]);
  });
};

const drainPageDelays = async <T>(pending: Promise<T>): Promise<T> => {
  await vi.advanceTimersByTimeAsync(ALL_PAGE_DELAYS_MS);
  return pending;
};

describe("createDiscogsClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns parsed titles and years for a single page", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [
        { id: 7, title: "Sting - The Soul Cages", year: "1991" },
        { id: 9, title: "Sting - Ten Summoner's Tales", year: "1993" },
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toStrictEqual([
        { title: "Sting - The Soul Cages", year: 1991 },
        { title: "Sting - Ten Summoner's Tales", year: 1993 },
      ]);
    }
  });

  it("sends query, type, per_page and page on the first request", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases(TEST_QUERY);

    const url = requestUrl(0);
    expect(url.origin + url.pathname).toBe(
      "https://api.discogs.com/database/search",
    );
    expect(url.searchParams.get("q")).toBe("qsound");
    expect(url.searchParams.get("type")).toBe("release");
    expect(url.searchParams.get("per_page")).toBe("100");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("sends format without q for a format tag and no text", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({ tag: FORMAT_TAG });

    const url = requestUrl(0);
    expect(url.searchParams.get("format")).toBe("SACD");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("sends format and q as two separate parameters for a format tag with text", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({ tag: FORMAT_TAG, text: "sting" });

    const url = requestUrl(0);
    expect(url.searchParams.get("format")).toBe("SACD");
    expect(url.searchParams.get("q")).toBe("sting");
  });

  it("sends the term as q without a format parameter for a text tag and no text", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({ tag: TEXT_TAG });

    const url = requestUrl(0);
    expect(url.searchParams.get("q")).toBe("qsound");
    expect(url.searchParams.has("format")).toBe(false);
  });

  it("joins a text tag and the text into a single q parameter", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({ tag: TEXT_TAG, text: "sting" });

    const url = requestUrl(0);
    expect(url.searchParams.get("q")).toBe("qsound sting");
    expect(url.searchParams.has("format")).toBe(false);
  });

  it("collapses surrounding and repeated whitespace in the joined q parameter", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({ tag: TEXT_TAG, text: "  sting  " });

    expect(requestUrl(0).searchParams.get("q")).toBe("qsound sting");
  });

  it("collapses whitespace inside the text of a format tag query", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({
      tag: FORMAT_TAG,
      text: "  sting   nothing  ",
    });

    const url = requestUrl(0);
    expect(url.searchParams.get("format")).toBe("SACD");
    expect(url.searchParams.get("q")).toBe("sting nothing");
  });

  it("omits q for a format tag whose text is whitespace only", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases({ tag: FORMAT_TAG, text: "   " });

    expect(requestUrl(0).searchParams.has("q")).toBe(false);
  });

  it("reports pagination.items as totalItems, not the number of returned results", async () => {
    fetchMock.mockResolvedValue(
      makePageWithItems(1, 1, 16005, [
        { id: 1, title: "Sting - The Soul Cages", year: "1991" },
        { id: 2, title: "Sting - Ten Summoner's Tales", year: "1993" },
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalItems).toBe(16005);
      expect(result.value.results).toHaveLength(2);
    }
  });

  it("takes totalItems from the first page even when later pages report a different count", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (url: unknown) => {
      const page = Number(new URL(String(url)).searchParams.get("page"));
      return makePageWithItems(page, 2, page === 1 ? 249 : 7, [
        { id: page, title: `Artist ${page} - Album ${page}` },
      ]);
    });

    const client = createDiscogsClient();
    const result = await drainPageDelays(client.searchReleases(TEST_QUERY));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalItems).toBe(249);
      expect(result.value.results).toHaveLength(2);
    }
  });

  it("reports totalItems 0 when pagination carries no items field", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, {
        pagination: { page: 1, pages: 1 },
        results: [{ id: 1, title: "Sting - The Soul Cages" }],
      }),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalItems).toBe(0);
      expect(result.value.results).toHaveLength(1);
    }
  });

  it("does not wait before the first page request", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits 1100ms before requesting the next page", async () => {
    vi.useFakeTimers();
    respondPerPage(2);

    const client = createDiscogsClient();
    const pending = client.searchReleases(TEST_QUERY);

    await vi.advanceTimersByTimeAsync(1099);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const result = await drainPageDelays(pending);
    expect(result.ok).toBe(true);
  });

  it("merges the results of every page when pagination reports three pages", async () => {
    vi.useFakeTimers();
    respondPerPage(3);

    const client = createDiscogsClient();
    const result = await drainPageDelays(client.searchReleases(TEST_QUERY));

    expect(requestedPages()).toStrictEqual(["1", "2", "3"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toStrictEqual([
        { title: "Artist 1 - Album 1", year: 1991 },
        { title: "Artist 2 - Album 2", year: 1992 },
        { title: "Artist 3 - Album 3", year: 1993 },
      ]);
    }
  });

  it("stops after five pages even when pagination reports far more", async () => {
    vi.useFakeTimers();
    respondPerPage(99);

    const client = createDiscogsClient();
    const result = await drainPageDelays(client.searchReleases(TEST_QUERY));

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(requestedPages()).toStrictEqual(["1", "2", "3", "4", "5"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results.map((entry) => entry.year)).toStrictEqual([
        1991, 1992, 1993, 1994, 1995,
      ]);
    }
  });

  it("omits year when it is empty, unparsable or absent", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [
        { id: 1, title: "A - Parsable", year: "1991" },
        { id: 2, title: "B - Empty", year: "" },
        { id: 3, title: "C - Words", year: "unbekannt" },
        { id: 4, title: "D - Missing" },
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toStrictEqual([
        { title: "A - Parsable", year: 1991 },
        { title: "B - Empty" },
        { title: "C - Words" },
        { title: "D - Missing" },
      ]);
    }
  });

  it("skips entries without a usable title", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [
        { id: 1, title: "Kept - Release", year: "2001" },
        { id: 2, year: "2002" },
        { id: 3, title: 1234, year: "2003" },
        { id: 4, title: "", year: "2004" },
        "not a record",
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toStrictEqual([
        { title: "Kept - Release", year: 2001 },
      ]);
    }
  });

  it("returns HttpError with status 429 when the first page is rate limited", async () => {
    fetchMock.mockResolvedValue(makeResponse(429, { message: "too many" }));

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("HttpError");
      if (result.error.type === "HttpError") {
        expect(result.error.status).toBe(429);
      }
    }
  });

  it("returns HttpError with status 500 when the first page fails upstream", async () => {
    fetchMock.mockResolvedValue(makeResponse(500, { message: "boom" }));

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("HttpError");
      if (result.error.type === "HttpError") {
        expect(result.error.status).toBe(500);
      }
    }
  });

  it("keeps the results collected so far when a later page fails", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        makePage(1, 3, [
          { id: 1, title: "Kept - From Page One", year: "1988" },
        ]),
      )
      .mockResolvedValueOnce(makeResponse(500, { message: "boom" }));

    const client = createDiscogsClient();
    const result = await drainPageDelays(client.searchReleases(TEST_QUERY));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toStrictEqual([
        { title: "Kept - From Page One", year: 1988 },
      ]);
    }
  });

  it("returns NetworkError on fetch rejection", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
      expect(result.error.message).toBe("Connection refused");
    }
  });

  it("returns TimeoutError when the request aborts on timeout", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted", "TimeoutError"),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

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

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ParseError");
    }
  });

  it("sends the Authorization header when a token is configured", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient(TEST_TOKEN);
    await client.searchReleases(TEST_QUERY);

    expect(requestHeaders(0)).toMatchObject({
      "User-Agent": "Signalform/1.0",
      Authorization: `Discogs token=${TEST_TOKEN}`,
    });
  });

  it("omits the Authorization header but keeps the User-Agent without a token", async () => {
    fetchMock.mockResolvedValue(makePage(1, 1, []));

    const client = createDiscogsClient();
    await client.searchReleases(TEST_QUERY);

    expect(requestHeaders(0)).toMatchObject({
      "User-Agent": "Signalform/1.0",
    });
    expect(requestHeaders(0)).not.toHaveProperty("Authorization");
  });

  it("uses cover_image as coverImageUrl when present", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [
        {
          id: 1,
          title: "Sting - The Soul Cages",
          cover_image: "https://example.com/cover.jpg",
          thumb: "https://example.com/thumb.jpg",
        },
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results[0]?.coverImageUrl).toBe(
        "https://example.com/cover.jpg",
      );
    }
  });

  it("falls back to thumb as coverImageUrl when cover_image is empty", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [
        {
          id: 1,
          title: "Sting - The Soul Cages",
          cover_image: "",
          thumb: "https://example.com/thumb.jpg",
        },
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results[0]?.coverImageUrl).toBe(
        "https://example.com/thumb.jpg",
      );
    }
  });

  it("omits coverImageUrl entirely when cover_image and thumb are both empty strings", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [
        {
          id: 1,
          title: "Sting - The Soul Cages",
          cover_image: "",
          thumb: "",
        },
      ]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("coverImageUrl" in (result.value.results[0] ?? {})).toBe(false);
    }
  });

  it("omits coverImageUrl entirely when cover_image and thumb are both absent from the JSON", async () => {
    fetchMock.mockResolvedValue(
      makePage(1, 1, [{ id: 1, title: "Sting - The Soul Cages" }]),
    );

    const client = createDiscogsClient();
    const result = await client.searchReleases(TEST_QUERY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("coverImageUrl" in (result.value.results[0] ?? {})).toBe(false);
    }
  });
});
