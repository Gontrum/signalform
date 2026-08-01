import type { DecadeFilter, SortOption } from "./types/library.js";

// True wherever the server hands out albums grouped by year: 'year-newest'
// through the backward `yearalbum` pagination of resolvePagination, every
// decade filter through the descending years of selectDecadeYears.
export const ordersByYearFirst = (
  sort: SortOption,
  decade: DecadeFilter,
): boolean => sort === "year-newest" || decade !== "all";
