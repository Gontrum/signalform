import { ok, err, fromThrowable, type Result } from "@signalform/shared";
import { isRecord } from "../lms-client/execute.js";
import type {
  DiscogsClient,
  DiscogsError,
  DiscogsSearchResult,
} from "./types.js";

const DISCOGS_SEARCH_URL = "https://api.discogs.com/database/search";
const REQUEST_TIMEOUT_MS = 8000;
const RESULTS_PER_PAGE = 100;
const MAX_PAGES = 5;
// Discogs allows 25 requests/min without a token — 1100ms keeps us under it.
const PAGE_DELAY_MS = 1100;
const USER_AGENT = "Signalform/1.0";

type DiscogsPage = {
  readonly pages: number;
  readonly results: readonly DiscogsSearchResult[];
};

type FetchPage = (page: number) => Promise<Result<DiscogsPage, DiscogsError>>;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const parseYear = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const year = Number.parseInt(value, 10);
  return Number.isNaN(year) || year <= 0 ? undefined : year;
};

const parseCoverImageUrl = (
  entry: Record<string, unknown>,
): string | undefined => {
  const coverImage = entry["cover_image"];
  if (typeof coverImage === "string" && coverImage !== "") {
    return coverImage;
  }
  const thumb = entry["thumb"];
  return typeof thumb === "string" && thumb !== "" ? thumb : undefined;
};

const parseResults = (value: unknown): readonly DiscogsSearchResult[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): readonly DiscogsSearchResult[] => {
    if (!isRecord(entry) || typeof entry["title"] !== "string") {
      return [];
    }

    const title = entry["title"];
    if (title === "") {
      return [];
    }

    const year = parseYear(entry["year"]);
    const coverImageUrl = parseCoverImageUrl(entry);
    return [
      {
        title,
        ...(year !== undefined ? { year } : {}),
        ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
      },
    ];
  });
};

const parseTotalPages = (value: unknown): number => {
  if (!isRecord(value)) {
    return 1;
  }
  const pagination = value["pagination"];
  if (!isRecord(pagination) || typeof pagination["pages"] !== "number") {
    return 1;
  }
  return pagination["pages"];
};

const parsePage = (value: unknown): DiscogsPage => ({
  pages: parseTotalPages(value),
  results: parseResults(isRecord(value) ? value["results"] : undefined),
});

const parseJson = (text: string): Result<unknown, DiscogsError> => {
  return fromThrowable(
    () => JSON.parse(text),
    () => ({
      type: "ParseError",
      message: `Invalid JSON: ${text.slice(0, 100)}`,
    }),
  );
};

const buildUrl = (query: string, page: number): string => {
  const url = new URL(DISCOGS_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "release");
  url.searchParams.set("per_page", String(RESULTS_PER_PAGE));
  url.searchParams.set("page", String(page));
  return url.toString();
};

const buildHeaders = (token?: string): Readonly<Record<string, string>> => ({
  "User-Agent": USER_AGENT,
  ...(token !== undefined && token !== ""
    ? { Authorization: `Discogs token=${token}` }
    : {}),
});

const requestPage = async (
  query: string,
  page: number,
  headers: Readonly<Record<string, string>>,
): Promise<Result<DiscogsPage, DiscogsError>> => {
  const responseResult = await fetch(buildUrl(query, page), {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
    .then<Result<Response, DiscogsError>>((response) => ok(response))
    .catch<Result<Response, DiscogsError>>((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "TimeoutError") {
        return err({
          type: "TimeoutError",
          message: "Discogs request timed out",
        });
      }
      const message =
        cause instanceof Error ? cause.message : "Unknown network error";
      return err({ type: "NetworkError", message });
    });

  if (!responseResult.ok) {
    return responseResult;
  }

  const response = responseResult.value;
  if (response.status >= 400) {
    return err({
      type: "HttpError",
      status: response.status,
      message: `Discogs responded with status ${response.status}`,
    });
  }

  const text = await response.text();
  const parseResult = parseJson(text);
  if (!parseResult.ok) {
    return parseResult;
  }

  return ok(parsePage(parseResult.value));
};

const collectRemainingPages = async (
  fetchPage: FetchPage,
  collected: readonly DiscogsSearchResult[],
  page: number,
  totalPages: number,
): Promise<readonly DiscogsSearchResult[]> => {
  if (page > totalPages) {
    return collected;
  }

  await delay(PAGE_DELAY_MS);
  const pageResult = await fetchPage(page);
  if (!pageResult.ok) {
    return collected;
  }

  return collectRemainingPages(
    fetchPage,
    [...collected, ...pageResult.value.results],
    page + 1,
    totalPages,
  );
};

export const createDiscogsClient = (token?: string): DiscogsClient => {
  const headers = buildHeaders(token);

  return {
    searchReleases: async (
      query: string,
    ): Promise<Result<readonly DiscogsSearchResult[], DiscogsError>> => {
      const fetchPage: FetchPage = (page) => requestPage(query, page, headers);

      const firstPage = await fetchPage(1);
      if (!firstPage.ok) {
        return firstPage;
      }

      const totalPages = Math.min(firstPage.value.pages, MAX_PAGES);
      const results = await collectRemainingPages(
        fetchPage,
        firstPage.value.results,
        2,
        totalPages,
      );

      return ok(results);
    },
  };
};
