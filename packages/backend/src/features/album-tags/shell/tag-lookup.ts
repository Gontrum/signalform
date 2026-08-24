import { err, ok, type Result } from "@signalform/shared";
import type { DiscogsClient } from "../../../adapters/discogs-client/index.js";
import { toCandidates } from "../core/candidates.js";
import type { TagCandidate } from "../core/types.js";

export type TagLookupError = {
  readonly type: "DiscogsUnavailable";
  readonly message: string;
};

// Discogs is queried once per distinct tag text and the result is reused by
// both the search route (the "N albums" preview) and the album-listing route
// (every page of that same tag) — without this cache, paging through results
// would hit Discogs on every page.
const CACHE_TTL_MS = 3600 * 1000; // 1 hour
const MAX_CACHE_SIZE = 50;

type CacheEntry = {
  readonly value: readonly TagCandidate[];
  readonly expireAt: number;
};

type CacheState = Readonly<Record<string, CacheEntry>>;

const createTagCandidateCache = (
  maxSize: number,
): {
  readonly get: (key: string) => readonly TagCandidate[] | undefined;
  readonly set: (key: string, value: readonly TagCandidate[]) => void;
} => {
  const ref = { current: {} as CacheState };

  return {
    get: (key: string): readonly TagCandidate[] | undefined => {
      const entry = ref.current[key];
      return entry !== undefined && Date.now() < entry.expireAt
        ? entry.value
        : undefined;
    },
    set: (key: string, value: readonly TagCandidate[]): void => {
      const keys = Object.keys(ref.current);
      const firstKey = keys[0];
      const trimmed: CacheState =
        keys.length >= maxSize && firstKey !== undefined
          ? (({ [firstKey]: _removed, ...rest }): CacheState => rest)(
              ref.current,
            )
          : ref.current;
      ref.current = {
        ...trimmed,
        [key]: { value, expireAt: Date.now() + CACHE_TTL_MS },
      };
    },
  };
};

const candidateCache = createTagCandidateCache(MAX_CACHE_SIZE);

const cacheKeyOf = (tagQuery: string): string => tagQuery.trim().toLowerCase();

/**
 * Discogs candidates for a tag search — shared and TTL-cached so the search
 * route and the album-listing route never issue duplicate Discogs requests
 * for the same tag. A Discogs failure is never cached, so the next call
 * retries immediately instead of staying empty for the full TTL.
 */
export const getTagCandidates = async (
  discogsClient: DiscogsClient,
  tagQuery: string,
): Promise<Result<readonly TagCandidate[], TagLookupError>> => {
  const key = cacheKeyOf(tagQuery);
  const cached = candidateCache.get(key);
  if (cached !== undefined) {
    return ok(cached);
  }

  const releasesResult = await discogsClient.searchReleases(tagQuery);
  if (!releasesResult.ok) {
    return err({
      type: "DiscogsUnavailable",
      message: releasesResult.error.message,
    });
  }

  const candidates = toCandidates(releasesResult.value);
  candidateCache.set(key, candidates);
  return ok(candidates);
};
