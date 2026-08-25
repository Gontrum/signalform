import { err, ok, type Result, type TagDescriptor } from "@signalform/shared";
import type { DiscogsClient } from "../../../adapters/discogs-client/index.js";
import { toCandidates } from "../core/candidates.js";
import type { TagCandidate } from "../core/types.js";

export type TagLookupError = {
  readonly type: "DiscogsUnavailable";
  readonly message: string;
};

export type TagLookup = {
  readonly candidates: readonly TagCandidate[];
  readonly totalItems: number;
};

// Discogs is queried once per distinct tag/text pair and the result is reused
// by both the search route (the "N albums" preview) and the album-listing
// route (every page of that same query) — without this cache, paging through
// results would hit Discogs on every page.
const CACHE_TTL_MS = 3600 * 1000;
const MAX_CACHE_SIZE = 50;

type CacheEntry = {
  readonly value: TagLookup;
  readonly expireAt: number;
};

type CacheState = Readonly<Record<string, CacheEntry>>;

const createTagCandidateCache = (
  maxSize: number,
): {
  readonly get: (key: string) => TagLookup | undefined;
  readonly set: (key: string, value: TagLookup) => void;
} => {
  const ref = { current: {} as CacheState };

  return {
    get: (key: string): TagLookup | undefined => {
      const entry = ref.current[key];
      return entry !== undefined && Date.now() < entry.expireAt
        ? entry.value
        : undefined;
    },
    set: (key: string, value: TagLookup): void => {
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

const normalizeText = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

const cacheKeyOf = (tag: TagDescriptor, normalizedText: string): string =>
  [tag.id, normalizedText].join(":");

export const getTagCandidates = async (
  discogsClient: DiscogsClient,
  tag: TagDescriptor,
  text: string,
): Promise<Result<TagLookup, TagLookupError>> => {
  const normalizedText = normalizeText(text);
  const key = cacheKeyOf(tag, normalizedText);
  const cached = candidateCache.get(key);
  if (cached !== undefined) {
    return ok(cached);
  }

  const releasesResult = await discogsClient.searchReleases({
    tag,
    ...(normalizedText !== "" ? { text: normalizedText } : {}),
  });
  if (!releasesResult.ok) {
    return err({
      type: "DiscogsUnavailable",
      message: releasesResult.error.message,
    });
  }

  const lookup: TagLookup = {
    candidates: toCandidates(releasesResult.value.results),
    totalItems: releasesResult.value.totalItems,
  };
  candidateCache.set(key, lookup);
  return ok(lookup);
};
