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

type YearBounds = {
  readonly min: number;
  readonly max: number;
};

// LMS reports albums without a release year as 0; they count as "unknown",
// never as pre-1990 releases.
const FIRST_KNOWN_YEAR = 1;

const DECADE_BOUNDS = {
  "2020s": { min: 2020, max: Number.POSITIVE_INFINITY },
  "2010s": { min: 2010, max: 2020 },
  "2000s": { min: 2000, max: 2010 },
  "1990s": { min: 1990, max: 2000 },
  older: { min: FIRST_KNOWN_YEAR, max: 1990 },
} as const satisfies Record<Exclude<DecadeFilter, "all">, YearBounds>;

const newestFirst = (left: number, right: number): number => right - left;

// `undefined` means "no year filter at all" — for 'all' the caller fetches the
// list in one query instead of iterating over every year of the library.
export const selectDecadeYears = (
  years: readonly number[],
  decade: DecadeFilter,
): readonly number[] | undefined => {
  if (decade === "all") {
    return undefined;
  }

  const bounds = DECADE_BOUNDS[decade];

  return years
    .filter((year) => year >= bounds.min && year < bounds.max)
    .sort(newestFirst);
};

export type YearCount = {
  readonly year: number;
  readonly count: number;
};

export type YearSlice = {
  readonly year: number;
  readonly offset: number;
  readonly limit: number;
};

const NO_SLICES: readonly YearSlice[] = [];

type SliceCursor = {
  readonly pendingOffset: number;
  readonly pendingLimit: number;
  readonly slices: readonly YearSlice[];
};

const takeFromYear = (
  cursor: SliceCursor,
  { year, count }: YearCount,
): SliceCursor => {
  if (cursor.pendingLimit <= 0 || count <= 0) {
    return cursor;
  }

  if (cursor.pendingOffset >= count) {
    return { ...cursor, pendingOffset: cursor.pendingOffset - count };
  }

  const limit = Math.min(count - cursor.pendingOffset, cursor.pendingLimit);

  return {
    pendingOffset: 0,
    pendingLimit: cursor.pendingLimit - limit,
    slices: [...cursor.slices, { year, offset: cursor.pendingOffset, limit }],
  };
};

// The years arrive in delivery order (newest first for a decade), so a global
// page offset walks them in sequence and may straddle any number of years.
export const mapOffsetAcrossYears = (
  yearCounts: readonly YearCount[],
  offset: number,
  limit: number,
): readonly YearSlice[] => {
  if (limit <= 0 || offset < 0) {
    return NO_SLICES;
  }

  return yearCounts.reduce<SliceCursor>(takeFromYear, {
    pendingOffset: offset,
    pendingLimit: limit,
    slices: NO_SLICES,
  }).slices;
};
