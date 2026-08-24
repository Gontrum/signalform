import { err, ok, type Result } from "@signalform/shared";
import { MAX_SEARCH_RESULTS } from "../../../adapters/lms-client/helpers.js";
import type {
  LibraryAlbumRaw,
  LmsClient,
  LmsError,
} from "../../../adapters/lms-client/index.js";

// Mirrors the TtlCache pattern in features/library/shell/service.ts — a small
// local copy rather than an import, since this is a one-off singleton cache
// (a single "all albums" entry), not a keyed cache like the library one.
const LOCAL_ALBUMS_CACHE_TTL_MS = 3600 * 1000; // 1 hour

type CacheEntry = {
  readonly value: readonly LibraryAlbumRaw[];
  readonly expireAt: number;
};

const cacheRef = { current: undefined as CacheEntry | undefined };

const getCachedAlbums = (): readonly LibraryAlbumRaw[] | undefined => {
  const entry = cacheRef.current;
  return entry !== undefined && Date.now() < entry.expireAt
    ? entry.value
    : undefined;
};

const setCachedAlbums = (value: readonly LibraryAlbumRaw[]): void => {
  cacheRef.current = {
    value,
    expireAt: Date.now() + LOCAL_ALBUMS_CACHE_TTL_MS,
  };
};

/**
 * Clears the cached full album list. Called from clearLibraryCache in
 * features/library/shell/service.ts so a rescan drops this list together
 * with the library caches — otherwise newly imported albums stay without a
 * "local" badge on tag pages for up to the full hour of TTL.
 */
export const clearLocalAlbumsCache = (): void => {
  cacheRef.current = undefined;
};

// LMS caps every getLibraryAlbums call at MAX_SEARCH_RESULTS (999) rows — the
// library already holds 807 albums, only 24% below that ceiling, so a single
// page silently drops albums once the library crosses 999. Page until the
// accumulated offset reaches the reported count. A failure on any page
// invalidates the whole fetch: a partial list would misreport real albums as
// "not available locally".
const fetchAllPages = async (
  lmsClient: LmsClient,
  offset: number,
  collected: readonly LibraryAlbumRaw[],
): Promise<Result<readonly LibraryAlbumRaw[], LmsError>> => {
  const pageResult = await lmsClient.getLibraryAlbums(
    offset,
    MAX_SEARCH_RESULTS,
    {},
  );
  if (!pageResult.ok) {
    return pageResult;
  }

  const rows = pageResult.value.albums;
  const merged = [...collected, ...rows];
  // Advance by the rows actually delivered, not by the page size asked for:
  // a short page (LMS filtering internally, or capping mid-rescan) would
  // otherwise skip the undelivered albums silently. An empty page then ends
  // the walk — without it, a permanently empty page under a high `count`
  // never advances the offset and loops forever.
  const nextOffset = offset + rows.length;

  return rows.length === 0 || nextOffset >= pageResult.value.count
    ? ok(merged)
    : await fetchAllPages(lmsClient, nextOffset, merged);
};

/**
 * The complete local album library, paginated past LMS's per-query cap and
 * cached for an hour so repeated tag-search requests reuse the same fetch
 * instead of re-downloading the whole library on every request.
 */
export const getAllLocalAlbums = async (
  lmsClient: LmsClient,
): Promise<Result<readonly LibraryAlbumRaw[], LmsError>> => {
  const cached = getCachedAlbums();
  if (cached !== undefined) {
    return ok(cached);
  }

  const result = await fetchAllPages(lmsClient, 0, []);
  if (!result.ok) {
    return err(result.error);
  }

  setCachedAlbums(result.value);
  return ok(result.value);
};
