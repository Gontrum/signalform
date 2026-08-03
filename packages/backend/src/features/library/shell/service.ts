import {
  ok,
  err,
  type DecadeFilter,
  type Result,
  type SortOption,
} from "@signalform/shared";
import type {
  LibraryAlbumRaw,
  LibraryArtistRaw,
  LmsClient,
  LmsConfig,
  LmsGenreRaw,
  RescanProgress,
} from "../../../adapters/lms-client/index.js";
import {
  buildLibraryAlbumsResponse,
  mapLibraryLmsError,
} from "../core/service.js";
import {
  capTotal,
  clampPage,
  computeBackwardPage,
  countAcrossYears,
  hasMoreAfter,
  mapOffsetAcrossYears,
  pageIndexOf,
  resolvePagination,
  reverseYearBlocks,
  selectDecadeYears,
  type LmsPage,
  type LmsSortQuery,
  type YearCount,
} from "../core/browse.js";
import type { LibraryAlbumsResponse } from "../core/types.js";
import type { LibraryServiceError } from "../core/types.js";

const LIBRARY_CACHE_TTL_MS = 3600 * 1000; // 1 hour
export const MAX_LIBRARY_CACHE_SIZE = 100; // exported for test verification

// Counts are one small entry per year or genre — a library can legitimately
// hold ~100 years times a few filter combinations, and ~150 genres.
const MAX_COUNT_CACHE_SIZE = 1000;
const SINGLETON_CACHE_SIZE = 4;

// LMS answers a single count in ~30 ms, but a genre warm-up fires one per genre —
// eight at a time keeps the server responsive for playback commands meanwhile.
const MAX_LMS_CONCURRENCY = 8;

type CacheEntry<T> = {
  readonly value: T;
  readonly expireAt: number;
};

type CacheState<T> = Readonly<Record<string, CacheEntry<T>>>;

type TtlCache<T> = {
  readonly get: (key: string) => T | undefined;
  readonly set: (key: string, value: T) => void;
  readonly clear: () => void;
};

const createTtlCache = <T>(maxSize: number): TtlCache<T> => {
  const ref = { current: {} as CacheState<T> };

  return {
    get: (key: string): T | undefined => {
      const entry = ref.current[key];
      return entry !== undefined && Date.now() < entry.expireAt
        ? entry.value
        : undefined;
    },
    set: (key: string, value: T): void => {
      const keys = Object.keys(ref.current);
      const firstKey = keys[0];
      const trimmed: CacheState<T> =
        keys.length >= maxSize && firstKey !== undefined
          ? (({ [firstKey]: _r, ...rest }): CacheState<T> => rest)(ref.current)
          : ref.current;
      ref.current = {
        ...trimmed,
        [key]: { value, expireAt: Date.now() + LIBRARY_CACHE_TTL_MS },
      };
    },
    clear: (): void => {
      ref.current = {};
    },
  };
};

const albumCache = createTtlCache<LibraryAlbumsResponse>(
  MAX_LIBRARY_CACHE_SIZE,
);
const artistCache = createTtlCache<LibraryArtistsResponse>(
  MAX_LIBRARY_CACHE_SIZE,
);
const yearsCache = createTtlCache<readonly number[]>(SINGLETON_CACHE_SIZE);
const yearCountCache = createTtlCache<number>(MAX_COUNT_CACHE_SIZE);
const genresCache =
  createTtlCache<readonly LmsGenreRaw[]>(SINGLETON_CACHE_SIZE);
const genreCountCache = createTtlCache<number>(MAX_COUNT_CACHE_SIZE);

// "A warm-up already ran" is itself cached, so the one-pass-per-window rule
// expires together with the counts that pass produced.
const genreWarmupCache = createTtlCache<true>(SINGLETON_CACHE_SIZE);

const genreWarmupRef = { current: undefined as Promise<void> | undefined };

// A warm-up outlives the cache it writes into: this counter lets a pass that
// started before an invalidation recognise that its results are stale.
const cacheGenerationRef = { current: 0 };

const rescanPendingRef = { current: false };

const YEARS_CACHE_KEY = "years";
const GENRES_CACHE_KEY = "genres";
const GENRE_WARMUP_CACHE_KEY = "genre-counts";

/**
 * Clears every cached library entry — albums, artists, years, per-year counts,
 * genres and genre counts.
 * @internal Exposed for test isolation; production code invalidates through
 * the rescan functions below.
 */
export const clearLibraryCache = (): void => {
  albumCache.clear();
  artistCache.clear();
  yearsCache.clear();
  yearCountCache.clear();
  genresCache.clear();
  genreCountCache.clear();
  genreWarmupCache.clear();
  genreWarmupRef.current = undefined;
  rescanPendingRef.current = false;
  cacheGenerationRef.current += 1;
};

/**
 * Starts an LMS rescan and arms the deferred invalidation.
 *
 * The scan itself runs asynchronously, so clearing here is not enough: every
 * request during the scan refills the caches with pre-scan data. The second
 * clear happens in getLibraryRescanProgress once LMS reports the scan done.
 */
export const startLibraryRescan = async (
  lmsClient: LmsClient,
): Promise<Result<void, LibraryServiceError>> => {
  const result = await lmsClient.rescanLibrary();
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  // Arm after clearing — clearLibraryCache disarms.
  clearLibraryCache();
  rescanPendingRef.current = true;

  return ok(undefined);
};

export const getLibraryRescanProgress = async (
  lmsClient: LmsClient,
): Promise<Result<RescanProgress, LibraryServiceError>> => {
  const result = await lmsClient.getRescanProgress();
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  if (rescanPendingRef.current && !result.value.scanning) {
    clearLibraryCache();
  }

  return ok(result.value);
};

export type LibraryBrowseOptions = {
  readonly sort?: SortOption;
  readonly decade?: DecadeFilter;
  readonly genreId?: number;
  readonly search?: string;
};

export type LibraryBrowseError =
  | LibraryServiceError
  | { readonly type: "InvalidFilter"; readonly message: string };

export type LibraryGenre = {
  readonly id: number;
  readonly name: string;
  readonly albumCount?: number;
};

type AlbumFilters = {
  readonly genreId?: number;
  readonly search?: string;
};

const DEFAULT_SORT: SortOption = "artist-az";
const DEFAULT_DECADE: DecadeFilter = "all";
const NO_YEARS: readonly number[] = [];

const baseUrlOf = (config: LmsConfig): string =>
  `http://${config.host}:${config.port}`;

const normalizeSearch = (search?: string): string | undefined => {
  const trimmed = search?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
};

const chunk = <T>(
  items: readonly T[],
  size: number,
): readonly (readonly T[])[] =>
  items.length === 0
    ? []
    : [items.slice(0, size), ...chunk(items.slice(size), size)];

const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
): Promise<readonly R[]> =>
  await chunk(items, MAX_LMS_CONCURRENCY).reduce<Promise<readonly R[]>>(
    async (previous, group) => [
      ...(await previous),
      ...(await Promise.all(group.map(worker))),
    ],
    Promise.resolve([]),
  );

const collectResults = <T, E>(
  results: readonly Result<T, E>[],
): Result<readonly T[], E> =>
  results.reduce<Result<readonly T[], E>>(
    (acc, item) =>
      !acc.ok ? acc : item.ok ? ok([...acc.value, item.value]) : item,
    ok([]),
  );

const fetchYears = async (
  lmsClient: LmsClient,
): Promise<Result<readonly number[], LibraryServiceError>> => {
  const cached = yearsCache.get(YEARS_CACHE_KEY);
  if (cached !== undefined) {
    return ok(cached);
  }

  const result = await lmsClient.getLibraryYears();
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  yearsCache.set(YEARS_CACHE_KEY, result.value);
  return ok(result.value);
};

const yearCountKey = (year: number, filters: AlbumFilters): string =>
  `${year}:${filters.genreId ?? ""}:${filters.search ?? ""}`;

const fetchYearCount = async (
  lmsClient: LmsClient,
  filters: AlbumFilters,
  year: number,
): Promise<Result<YearCount, LibraryServiceError>> => {
  const cached = yearCountCache.get(yearCountKey(year, filters));
  if (cached !== undefined) {
    return ok({ year, count: cached });
  }

  const result = await lmsClient.getLibraryAlbumCount({ ...filters, year });
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  yearCountCache.set(yearCountKey(year, filters), result.value);
  return ok({ year, count: result.value });
};

const fetchFilteredCount = async (
  lmsClient: LmsClient,
  filters: AlbumFilters,
): Promise<Result<number, LibraryServiceError>> => {
  const result = await lmsClient.getLibraryAlbumCount(filters);

  return result.ok
    ? ok(result.value)
    : err(mapLibraryLmsError(result.error.message));
};

type PagePlan = {
  readonly page: LmsPage;
  readonly totalCount?: number;
};

// Backward pagination needs the filtered total before it can name an offset,
// so it costs one extra count request per page.
const planPage = async (
  lmsClient: LmsClient,
  query: LmsSortQuery,
  filters: AlbumFilters,
  offset: number,
  limit: number,
): Promise<Result<PagePlan, LibraryServiceError>> => {
  if (!query.paginateBackward) {
    return ok({ page: clampPage(offset, limit, query.hardLimit) });
  }

  const countResult = await fetchFilteredCount(lmsClient, filters);
  if (!countResult.ok) {
    return countResult;
  }

  const backward = computeBackwardPage(
    countResult.value,
    limit,
    pageIndexOf(offset, limit),
  );

  return ok({
    page: clampPage(backward.offset, backward.limit, query.hardLimit),
    totalCount: countResult.value,
  });
};

const fetchCountOnlyPage = async (
  lmsClient: LmsClient,
  query: LmsSortQuery,
  filters: AlbumFilters,
  knownTotal: number | undefined,
  offset: number,
  limit: number,
): Promise<Result<LibraryAlbumsResponse, LibraryServiceError>> => {
  const totalResult: Result<number, LibraryServiceError> =
    knownTotal === undefined
      ? await fetchFilteredCount(lmsClient, filters)
      : ok(knownTotal);
  if (!totalResult.ok) {
    return totalResult;
  }

  return ok({
    albums: [],
    hasMore: hasMoreAfter(
      capTotal(totalResult.value, query.hardLimit),
      offset,
      limit,
    ),
  });
};

const fetchPageWithoutDecade = async (
  lmsClient: LmsClient,
  config: LmsConfig,
  query: LmsSortQuery,
  filters: AlbumFilters,
  offset: number,
  limit: number,
): Promise<Result<LibraryAlbumsResponse, LibraryServiceError>> => {
  const planResult = await planPage(lmsClient, query, filters, offset, limit);
  if (!planResult.ok) {
    return planResult;
  }

  const { page, totalCount } = planResult.value;

  if (page.limit <= 0) {
    return await fetchCountOnlyPage(
      lmsClient,
      query,
      filters,
      totalCount,
      offset,
      limit,
    );
  }

  const result = await lmsClient.getLibraryAlbums(page.offset, page.limit, {
    ...filters,
    sort: query.lmsSort,
  });
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  // LMS only sorts years ascending, so the newest page arrives back to front —
  // per year block, because the album order inside a year is already correct.
  const rows = query.paginateBackward
    ? reverseYearBlocks(result.value.albums)
    : result.value.albums;

  return ok(
    buildLibraryAlbumsResponse(
      rows,
      hasMoreAfter(
        capTotal(totalCount ?? result.value.count, query.hardLimit),
        offset,
        limit,
      ),
      baseUrlOf(config),
    ),
  );
};

const NO_COUNTS: readonly YearCount[] = [];

// Counting every year of a decade is the most expensive path in the library —
// `older` is open ended, and the count cache key holds the search term, so each
// debounced keystroke would pay for it. Since the answer only needs "is there
// another page", counting stops as soon as the years counted so far prove it;
// otherwise the exhausted years are the exact total. Groups keep the request
// concurrency identical to mapWithConcurrency.
const countYearsUntilPageDecided = async (
  lmsClient: LmsClient,
  filters: AlbumFilters,
  groups: readonly (readonly number[])[],
  offset: number,
  limit: number,
  counted: readonly YearCount[],
): Promise<Result<readonly YearCount[], LibraryServiceError>> => {
  const [group, ...remaining] = groups;
  if (group === undefined) {
    return ok(counted);
  }

  const groupResult = collectResults(
    await Promise.all(
      group.map(async (year) => await fetchYearCount(lmsClient, filters, year)),
    ),
  );
  if (!groupResult.ok) {
    return groupResult;
  }

  const yearCounts = [...counted, ...groupResult.value];

  return hasMoreAfter(countAcrossYears(yearCounts), offset, limit)
    ? ok(yearCounts)
    : await countYearsUntilPageDecided(
        lmsClient,
        filters,
        remaining,
        offset,
        limit,
        yearCounts,
      );
};

const fetchDecadePage = async (
  lmsClient: LmsClient,
  config: LmsConfig,
  query: LmsSortQuery,
  filters: AlbumFilters,
  years: readonly number[],
  offset: number,
  limit: number,
): Promise<Result<LibraryAlbumsResponse, LibraryServiceError>> => {
  const countsResult = await countYearsUntilPageDecided(
    lmsClient,
    filters,
    chunk(years, MAX_LMS_CONCURRENCY),
    offset,
    limit,
    NO_COUNTS,
  );
  if (!countsResult.ok) {
    return countsResult;
  }

  // The years are consumed in delivery order, so the counted prefix carries
  // every year the requested window can reach.
  const yearCounts = countsResult.value;
  const slices = mapOffsetAcrossYears(yearCounts, offset, limit);

  const slicesResult = collectResults(
    await mapWithConcurrency(slices, async (slice) => {
      const result = await lmsClient.getLibraryAlbums(
        slice.offset,
        slice.limit,
        {
          ...filters,
          sort: query.lmsSort,
          year: slice.year,
        },
      );

      return result.ok
        ? ok(result.value.albums)
        : err(mapLibraryLmsError(result.error.message));
    }),
  );
  if (!slicesResult.ok) {
    return slicesResult;
  }

  const albums = slicesResult.value.reduce<readonly LibraryAlbumRaw[]>(
    (acc, part) => [...acc, ...part],
    [],
  );

  return ok(
    buildLibraryAlbumsResponse(
      albums,
      hasMoreAfter(countAcrossYears(yearCounts), offset, limit),
      baseUrlOf(config),
    ),
  );
};

const fetchLibraryPage = async (
  lmsClient: LmsClient,
  config: LmsConfig,
  query: LmsSortQuery,
  decade: DecadeFilter,
  filters: AlbumFilters,
  offset: number,
  limit: number,
): Promise<Result<LibraryAlbumsResponse, LibraryServiceError>> => {
  const yearsResult =
    decade === "all" ? ok(NO_YEARS) : await fetchYears(lmsClient);
  if (!yearsResult.ok) {
    return yearsResult;
  }

  const decadeYears = selectDecadeYears(yearsResult.value, decade);

  return decadeYears === undefined
    ? await fetchPageWithoutDecade(
        lmsClient,
        config,
        query,
        filters,
        offset,
        limit,
      )
    : await fetchDecadePage(
        lmsClient,
        config,
        query,
        filters,
        decadeYears,
        offset,
        limit,
      );
};

const albumCacheKey = (
  offset: number,
  limit: number,
  sort: SortOption,
  decade: DecadeFilter,
  filters: AlbumFilters,
): string =>
  `${offset}:${limit}:${sort}:${decade}:${filters.genreId ?? ""}:${filters.search ?? ""}`;

export const getLibraryAlbums = async (
  offset: number,
  limit: number,
  lmsClient: LmsClient,
  config: LmsConfig,
  options: LibraryBrowseOptions = {},
): Promise<Result<LibraryAlbumsResponse, LibraryBrowseError>> => {
  const sort = options.sort ?? DEFAULT_SORT;
  const decade = options.decade ?? DEFAULT_DECADE;
  const filters: AlbumFilters = {
    genreId: options.genreId,
    search: normalizeSearch(options.search),
  };

  const pagination = resolvePagination(sort, decade);
  if (!pagination.ok) {
    return err({ type: "InvalidFilter", message: pagination.error.message });
  }

  const cacheKey = albumCacheKey(offset, limit, sort, decade, filters);
  const cached = albumCache.get(cacheKey);
  if (cached !== undefined) {
    return ok(cached);
  }

  const pageResult = await fetchLibraryPage(
    lmsClient,
    config,
    pagination.value,
    decade,
    filters,
    offset,
    limit,
  );
  if (!pageResult.ok) {
    return pageResult;
  }

  albumCache.set(cacheKey, pageResult.value);
  return pageResult;
};

type LibraryArtist = {
  readonly id: string;
  readonly name: string;
};

export type LibraryArtistsResponse = {
  readonly artists: readonly LibraryArtist[];
  readonly hasMore: boolean;
};

export type LibraryArtistOptions = {
  readonly search?: string;
};

// Every parameter that changes the answer belongs in the key — an album cache
// key that omitted the search term once served unfiltered pages to searches.
const artistCacheKey = (
  offset: number,
  limit: number,
  search?: string,
): string => `${offset}:${limit}:${search ?? ""}`;

const toLibraryArtist = (raw: LibraryArtistRaw): LibraryArtist => ({
  id: String(raw.id),
  name: raw.artist,
});

/**
 * One page of the library's artists, in the alphabetical order LMS delivers.
 */
export const getLibraryArtists = async (
  offset: number,
  limit: number,
  lmsClient: LmsClient,
  options: LibraryArtistOptions = {},
): Promise<Result<LibraryArtistsResponse, LibraryServiceError>> => {
  const search = normalizeSearch(options.search);

  const cacheKey = artistCacheKey(offset, limit, search);
  const cached = artistCache.get(cacheKey);
  if (cached !== undefined) {
    return ok(cached);
  }

  const result = await lmsClient.getLibraryArtists(offset, limit, { search });
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  const response: LibraryArtistsResponse = {
    artists: result.value.artists.map(toLibraryArtist),
    hasMore: hasMoreAfter(result.value.count, offset, limit),
  };

  artistCache.set(cacheKey, response);
  return ok(response);
};

const fetchGenreList = async (
  lmsClient: LmsClient,
): Promise<Result<readonly LmsGenreRaw[], LibraryServiceError>> => {
  const cached = genresCache.get(GENRES_CACHE_KEY);
  if (cached !== undefined) {
    return ok(cached);
  }

  const result = await lmsClient.getGenres();
  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  genresCache.set(GENRES_CACHE_KEY, result.value);
  return ok(result.value);
};

const warmGenreCounts = async (
  lmsClient: LmsClient,
  genres: readonly LmsGenreRaw[],
  generation: number,
): Promise<void> => {
  await mapWithConcurrency(genres, async (genre) => {
    const result = await lmsClient.getLibraryAlbumCount({ genreId: genre.id });
    if (result.ok && cacheGenerationRef.current === generation) {
      genreCountCache.set(String(genre.id), result.value);
    }
  });
};

// One warm-up at a time, and one per cache window: a genre whose count keeps
// failing must not make every genre request start another full pass.
const startGenreCountWarmup = (
  lmsClient: LmsClient,
  genres: readonly LmsGenreRaw[],
): void => {
  if (genreWarmupRef.current !== undefined) {
    return;
  }

  const generation = cacheGenerationRef.current;

  genreWarmupRef.current = warmGenreCounts(lmsClient, genres, generation)
    .catch(() => undefined)
    .finally(() => {
      if (cacheGenerationRef.current === generation) {
        genreWarmupCache.set(GENRE_WARMUP_CACHE_KEY, true);
        genreWarmupRef.current = undefined;
      }
    });
};

const hasWarmedGenreCounts = (): boolean =>
  genreWarmupCache.get(GENRE_WARMUP_CACHE_KEY) === true;

const withCachedCount = (genre: LmsGenreRaw): LibraryGenre => ({
  id: genre.id,
  name: genre.name,
  albumCount: genreCountCache.get(String(genre.id)),
});

const byNameAsc = (left: LibraryGenre, right: LibraryGenre): number =>
  left.name.localeCompare(right.name);

// A genre whose count never arrived ranks below one that genuinely has none.
const MISSING_COUNT_RANK = -1;

const countRankOf = (genre: LibraryGenre): number =>
  genre.albumCount ?? MISSING_COUNT_RANK;

const byAlbumCountDesc = (left: LibraryGenre, right: LibraryGenre): number =>
  countRankOf(right) - countRankOf(left) || byNameAsc(left, right);

export const getLibraryGenres = async (
  lmsClient: LmsClient,
): Promise<Result<readonly LibraryGenre[], LibraryServiceError>> => {
  const genresResult = await fetchGenreList(lmsClient);
  if (!genresResult.ok) {
    return genresResult;
  }

  const genres = genresResult.value;

  if (!hasWarmedGenreCounts()) {
    startGenreCountWarmup(lmsClient, genres);

    // Degraded answer: the names are usable immediately, the counts follow.
    return ok(genres.map(({ id, name }) => ({ id, name })).sort(byNameAsc));
  }

  // Whatever the single pass produced is the answer for this cache window;
  // genres it could not count sort to the end.
  return ok(genres.map(withCachedCount).sort(byAlbumCountDesc));
};
