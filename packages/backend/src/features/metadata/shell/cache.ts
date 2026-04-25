/**
 * Metadata Cache
 *
 * In-memory cache for album/artist metadata from LMS.
 * TTL: 1 hour (metadata changes rarely — NFR architecture requirement)
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */

export const ALBUM_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MAX_ALBUM_CACHE_SIZE = 1000;

type CacheEntry<T> = {
  readonly value: T;
  readonly timestamp: number;
};

type AlbumCacheState = Readonly<Record<string, CacheEntry<unknown>>>;

type MetadataCache = {
  readonly getCachedAlbum: (albumId: string) => unknown | null;
  readonly setCachedAlbum: <T>(albumId: string, data: T) => void;
  readonly clearAlbumCache: () => void;
};

const createMetadataCache = (): MetadataCache => {
  const ref = { current: {} as AlbumCacheState };

  const getCachedAlbum = (albumId: string): unknown | null => {
    const cached = ref.current[albumId];
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.timestamp >= ALBUM_CACHE_TTL_MS) {
      const { [albumId]: _r, ...rest } = ref.current;
      ref.current = rest;
      return null;
    }
    return cached.value;
  };

  const setCachedAlbum = <T>(albumId: string, data: T): void => {
    if (Object.keys(ref.current).length >= MAX_ALBUM_CACHE_SIZE) {
      return;
    }
    ref.current = {
      ...ref.current,
      [albumId]: { value: data, timestamp: Date.now() },
    };
  };

  const clearAlbumCache = (): void => {
    ref.current = {};
  };

  return { getCachedAlbum, setCachedAlbum, clearAlbumCache };
};

const cache = createMetadataCache();

export const getCachedAlbum = (albumId: string): unknown | null =>
  cache.getCachedAlbum(albumId);
export const setCachedAlbum = <T>(albumId: string, data: T): void =>
  cache.setCachedAlbum(albumId, data);
export const clearAlbumCache = (): void => cache.clearAlbumCache();
