/**
 * Search Results Cache
 *
 * In-memory cache for search results to achieve NFR4 (< 300ms response).
 * TTL: 5 minutes
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry<T> = {
  readonly value: T;
  readonly timestamp: number;
};

type CacheState = Readonly<Record<string, CacheEntry<unknown>>>;

const createSearchCache = (): {
  readonly getCachedResults: {
    (query: string): unknown | null;
    <T>(query: string, isCachedValue: (v: unknown) => v is T): T | null;
  };
  readonly setCachedResults: <T>(query: string, results: T) => void;
  readonly clearCache: () => void;
} => {
  const ref = { current: {} as CacheState };

  function getCachedResults(query: string): unknown | null;
  function getCachedResults<T>(
    query: string,
    isCachedValue: (v: unknown) => v is T,
  ): T | null;
  function getCachedResults<T>(
    query: string,
    isCachedValue?: (v: unknown) => v is T,
  ): T | unknown | null {
    const cached = ref.current[query];
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      const { [query]: _r, ...rest } = ref.current;
      ref.current = rest;
      return null;
    }
    if (isCachedValue === undefined) {
      return cached.value;
    }
    return isCachedValue(cached.value) ? cached.value : null;
  }

  const setCachedResults = <T>(query: string, results: T): void => {
    ref.current = {
      ...ref.current,
      [query]: { value: results, timestamp: Date.now() },
    };
  };

  const clearCache = (): void => {
    ref.current = {};
  };

  return { getCachedResults, setCachedResults, clearCache };
};

const cache = createSearchCache();

export function getCachedResults(query: string): unknown | null;
export function getCachedResults<T>(
  query: string,
  isCachedValue: (v: unknown) => v is T,
): T | null;
export function getCachedResults<T>(
  query: string,
  isCachedValue?: (v: unknown) => v is T,
): T | unknown | null {
  if (isCachedValue === undefined) {
    return cache.getCachedResults(query);
  }
  return cache.getCachedResults(query, isCachedValue);
}

export const setCachedResults = <T>(query: string, results: T): void =>
  cache.setCachedResults(query, results);

export const clearCache = (): void => cache.clearCache();
