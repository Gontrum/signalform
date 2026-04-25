import { ok, err, type Result } from "@signalform/shared";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import {
  buildLibraryAlbumsResponse,
  mapLibraryLmsError,
} from "../core/service.js";
import type { LibraryAlbumsResponse } from "../core/types.js";
import type { LibraryServiceError } from "../core/types.js";

const LIBRARY_CACHE_TTL_MS = 3600 * 1000; // 1 hour
export const MAX_LIBRARY_CACHE_SIZE = 100; // exported for test verification

type LibraryCacheEntry = {
  readonly value: LibraryAlbumsResponse;
  readonly expireAt: number;
};

type LibraryCacheState = Readonly<Record<string, LibraryCacheEntry>>;

type LibraryCache = {
  readonly get: (key: string) => LibraryCacheEntry | undefined;
  readonly set: (key: string, entry: LibraryCacheEntry) => void;
  readonly clear: () => void;
};

const createLibraryCache = (): LibraryCache => {
  const ref = { current: {} as LibraryCacheState };
  return {
    get: (key: string): LibraryCacheEntry | undefined => ref.current[key],
    set: (key: string, entry: LibraryCacheEntry): void => {
      const keys = Object.keys(ref.current);
      const firstKey = keys[0];
      const trimmed: LibraryCacheState =
        keys.length >= MAX_LIBRARY_CACHE_SIZE && firstKey !== undefined
          ? (({ [firstKey]: _r, ...rest }): LibraryCacheState => rest)(
              ref.current,
            )
          : ref.current;
      ref.current = { ...trimmed, [key]: entry };
    },
    clear: (): void => {
      ref.current = {};
    },
  };
};

const libraryCache = createLibraryCache();

/**
 * Clears all cached library album entries.
 * @internal Exposed for test isolation and cache invalidation only.
 */
export const clearLibraryCache = (): void => libraryCache.clear();

export const getLibraryAlbums = async (
  offset: number,
  limit: number,
  lmsClient: LmsClient,
  config: LmsConfig,
): Promise<Result<LibraryAlbumsResponse, LibraryServiceError>> => {
  const cacheKey = `${offset}:${limit}`;
  const cached = libraryCache.get(cacheKey);

  if (cached !== undefined && Date.now() < cached.expireAt) {
    return ok(cached.value);
  }

  const result = await lmsClient.getLibraryAlbums(offset, limit);

  if (!result.ok) {
    return err(mapLibraryLmsError(result.error.message));
  }

  const baseUrl = `http://${config.host}:${config.port}`;
  const mapped: LibraryAlbumsResponse = buildLibraryAlbumsResponse(
    result.value.albums,
    result.value.count,
    baseUrl,
  );

  libraryCache.set(cacheKey, {
    value: mapped,
    expireAt: Date.now() + LIBRARY_CACHE_TTL_MS,
  });

  return ok(mapped);
};
