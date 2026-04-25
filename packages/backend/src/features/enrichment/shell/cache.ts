/**
 * Enrichment Cache
 *
 * In-memory cache for artist and album enrichment data from last.fm.
 * TTL: 24 hours (enrichment data changes very rarely)
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */

import type {
  ArtistEnrichment,
  AlbumEnrichment,
  SimilarArtist,
} from "../core/types.js";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";
import type { Language } from "../../../infrastructure/config/index.js";

const ENRICHMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENRICHMENT_CACHE_SIZE = 1000;

type CacheEntry<T> = {
  readonly value: T;
  readonly timestamp: number;
};

type EnrichmentCacheState = {
  readonly artistCache: Readonly<Record<string, CacheEntry<ArtistEnrichment>>>;
  readonly albumCache: Readonly<Record<string, CacheEntry<AlbumEnrichment>>>;
  readonly similarArtistsCache: Readonly<
    Record<string, CacheEntry<readonly SimilarArtist[]>>
  >;
};

const EMPTY_STATE: EnrichmentCacheState = {
  artistCache: {},
  albumCache: {},
  similarArtistsCache: {},
};

const makeArtistKey = (name: string, language: Language): string =>
  `${normalizeArtist(name)}::${language}`;

const makeAlbumKey = (
  artist: string,
  album: string,
  language: Language,
): string =>
  `${normalizeArtist(artist)}::${album.trim().toLowerCase()}::${language}`;

const isExpired = (entry: CacheEntry<unknown>): boolean =>
  Date.now() - entry.timestamp >= ENRICHMENT_CACHE_TTL_MS;

type EnrichmentCache = {
  readonly getCachedArtist: (
    name: string,
    language: Language,
  ) => ArtistEnrichment | null;
  readonly setCachedArtist: (
    name: string,
    language: Language,
    data: ArtistEnrichment,
  ) => void;
  readonly getCachedAlbum: (
    artist: string,
    album: string,
    language: Language,
  ) => AlbumEnrichment | null;
  readonly setCachedAlbum: (
    artist: string,
    album: string,
    language: Language,
    data: AlbumEnrichment,
  ) => void;
  readonly getCachedSimilarArtists: (
    name: string,
    language: Language,
  ) => readonly SimilarArtist[] | null;
  readonly setCachedSimilarArtists: (
    name: string,
    language: Language,
    data: readonly SimilarArtist[],
  ) => void;
  readonly clearEnrichmentCache: () => void;
};

const createEnrichmentCache = (): EnrichmentCache => {
  const ref = { current: EMPTY_STATE };

  const getCachedArtist = (
    name: string,
    language: Language,
  ): ArtistEnrichment | null => {
    const key = makeArtistKey(name, language);
    const cached = ref.current.artistCache[key];
    if (!cached) {
      return null;
    }
    if (isExpired(cached)) {
      const { [key]: _r, ...rest } = ref.current.artistCache;
      ref.current = { ...ref.current, artistCache: rest };
      return null;
    }
    return cached.value;
  };

  const setCachedArtist = (
    name: string,
    language: Language,
    data: ArtistEnrichment,
  ): void => {
    if (
      Object.keys(ref.current.artistCache).length >= MAX_ENRICHMENT_CACHE_SIZE
    ) {
      return;
    }
    const key = makeArtistKey(name, language);
    ref.current = {
      ...ref.current,
      artistCache: {
        ...ref.current.artistCache,
        [key]: { value: data, timestamp: Date.now() },
      },
    };
  };

  const getCachedAlbum = (
    artist: string,
    album: string,
    language: Language,
  ): AlbumEnrichment | null => {
    const key = makeAlbumKey(artist, album, language);
    const cached = ref.current.albumCache[key];
    if (!cached) {
      return null;
    }
    if (isExpired(cached)) {
      const { [key]: _r, ...rest } = ref.current.albumCache;
      ref.current = { ...ref.current, albumCache: rest };
      return null;
    }
    return cached.value;
  };

  const setCachedAlbum = (
    artist: string,
    album: string,
    language: Language,
    data: AlbumEnrichment,
  ): void => {
    if (
      Object.keys(ref.current.albumCache).length >= MAX_ENRICHMENT_CACHE_SIZE
    ) {
      return;
    }
    const key = makeAlbumKey(artist, album, language);
    ref.current = {
      ...ref.current,
      albumCache: {
        ...ref.current.albumCache,
        [key]: { value: data, timestamp: Date.now() },
      },
    };
  };

  const getCachedSimilarArtists = (
    name: string,
    language: Language,
  ): readonly SimilarArtist[] | null => {
    const key = makeArtistKey(name, language);
    const cached = ref.current.similarArtistsCache[key];
    if (!cached) {
      return null;
    }
    if (isExpired(cached)) {
      const { [key]: _r, ...rest } = ref.current.similarArtistsCache;
      ref.current = { ...ref.current, similarArtistsCache: rest };
      return null;
    }
    return cached.value;
  };

  const setCachedSimilarArtists = (
    name: string,
    language: Language,
    data: readonly SimilarArtist[],
  ): void => {
    if (
      Object.keys(ref.current.similarArtistsCache).length >=
      MAX_ENRICHMENT_CACHE_SIZE
    ) {
      return;
    }
    const key = makeArtistKey(name, language);
    ref.current = {
      ...ref.current,
      similarArtistsCache: {
        ...ref.current.similarArtistsCache,
        [key]: { value: data, timestamp: Date.now() },
      },
    };
  };

  const clearEnrichmentCache = (): void => {
    ref.current = EMPTY_STATE;
  };

  return {
    getCachedArtist,
    setCachedArtist,
    getCachedAlbum,
    setCachedAlbum,
    getCachedSimilarArtists,
    setCachedSimilarArtists,
    clearEnrichmentCache,
  };
};

const cache = createEnrichmentCache();

export const getCachedArtist = (
  name: string,
  language: Language,
): ArtistEnrichment | null => cache.getCachedArtist(name, language);
export const setCachedArtist = (
  name: string,
  language: Language,
  data: ArtistEnrichment,
): void => cache.setCachedArtist(name, language, data);
export const getCachedAlbum = (
  artist: string,
  album: string,
  language: Language,
): AlbumEnrichment | null => cache.getCachedAlbum(artist, album, language);
export const setCachedAlbum = (
  artist: string,
  album: string,
  language: Language,
  data: AlbumEnrichment,
): void => cache.setCachedAlbum(artist, album, language, data);
export const getCachedSimilarArtists = (
  name: string,
  language: Language,
): readonly SimilarArtist[] | null =>
  cache.getCachedSimilarArtists(name, language);
export const setCachedSimilarArtists = (
  name: string,
  language: Language,
  data: readonly SimilarArtist[],
): void => cache.setCachedSimilarArtists(name, language, data);
export const clearEnrichmentCache = (): void => cache.clearEnrichmentCache();
