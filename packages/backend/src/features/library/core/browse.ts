import type { DecadeFilter, SortOption } from "@signalform/shared";

export type LmsAlbumSort = "album" | "artistalbum" | "yearalbum" | "new";

export type LmsSortQuery = {
  readonly lmsSort: LmsAlbumSort;
  readonly paginateBackward: boolean;
  readonly hardLimit?: number;
};

// LMS pref `browseagelimit` truncates `sort:new` at 100 rows — paginating past it returns nothing.
const RECENTLY_ADDED_LIMIT = 100;

const SORT_QUERIES = {
  "artist-az": { lmsSort: "artistalbum", paginateBackward: false },
  "title-az": { lmsSort: "album", paginateBackward: false },
  // LMS sorts years ascending only, so the newest albums sit at the end of the result.
  "year-newest": { lmsSort: "yearalbum", paginateBackward: true },
  "recently-added": {
    lmsSort: "new",
    paginateBackward: false,
    hardLimit: RECENTLY_ADDED_LIMIT,
  },
} as const satisfies Record<SortOption, LmsSortQuery>;

export const mapSortToLmsQuery = (sort: SortOption): LmsSortQuery =>
  SORT_QUERIES[sort];

export type BackwardPage = {
  readonly offset: number;
  readonly limit: number;
};

const EMPTY_PAGE: BackwardPage = { offset: 0, limit: 0 };

// Page 0 is the newest slice and therefore the *last* rows of the ascending LMS
// result — the caller reverses the fetched rows before returning them.
export const computeBackwardPage = (
  totalCount: number,
  limit: number,
  page: number,
): BackwardPage => {
  const end = totalCount - page * limit;
  const offset = Math.max(end - limit, 0);
  const pageLimit = Math.min(end, totalCount) - offset;

  return pageLimit > 0 ? { offset, limit: pageLimit } : EMPTY_PAGE;
};

export type DecadeRange = {
  readonly offset: number;
  readonly count: number;
};

type YearBounds = {
  readonly min: number;
  readonly max: number;
};

// LMS reports albums without a release year as 0; they lead the ascending
// column and count as "unknown", never as pre-1990 releases.
const FIRST_KNOWN_YEAR = 1;

const DECADE_BOUNDS = {
  "2020s": { min: 2020, max: Number.POSITIVE_INFINITY },
  "2010s": { min: 2010, max: 2020 },
  "2000s": { min: 2000, max: 2010 },
  "1990s": { min: 1990, max: 2000 },
  older: { min: FIRST_KNOWN_YEAR, max: 1990 },
} as const satisfies Record<Exclude<DecadeFilter, "all">, YearBounds>;

const firstIndexFrom = (years: readonly number[], bound: number): number => {
  const index = years.findIndex((year) => year >= bound);

  return index === -1 ? years.length : index;
};

export const findDecadeRange = (
  years: readonly number[],
  decade: DecadeFilter,
): DecadeRange => {
  if (decade === "all") {
    return { offset: 0, count: years.length };
  }

  const bounds = DECADE_BOUNDS[decade];
  const offset = firstIndexFrom(years, bounds.min);
  const end = firstIndexFrom(years, bounds.max);

  return { offset, count: Math.max(end - offset, 0) };
};
