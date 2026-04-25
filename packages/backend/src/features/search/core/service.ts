/**
 * Search Service - Functional Core
 *
 * Pure business logic for search operations.
 * No side effects - all IO handled in route layer.
 */

import {
  ok,
  err,
  type Result,
  DEFAULT_SOURCE_HIERARCHY,
} from "@signalform/shared";
import type { SourceType, TrackSource, AudioQuality } from "@signalform/shared";
import type { SearchResult as LmsSearchResult } from "../../../adapters/lms-client/index.js";
import { selectBestSource } from "../../source-hierarchy/index.js";
import type {
  SearchError,
  AutocompleteSuggestion,
  SearchResultsResponse,
  AvailableSource,
  DeduplicatedTrackResult,
  ArtistResult,
} from "./types.js";

const isKnownSourceType = (
  source: AvailableSource["source"],
): source is SourceType => {
  return source !== "unknown";
};

const getSourceRank = (source: AvailableSource["source"]): number => {
  if (!isKnownSourceType(source)) {
    return DEFAULT_SOURCE_HIERARCHY.length;
  }

  return DEFAULT_SOURCE_HIERARCHY.indexOf(source);
};

/**
 * Validates and processes search query.
 * Pure function - no side effects.
 *
 * @param query - User search query
 * @param lmsResults - Results from LMS client
 * @returns Result with tracks or error
 */
export const searchTracks = (
  query: string,
  lmsResults: readonly LmsSearchResult[],
): Result<readonly LmsSearchResult[], SearchError> => {
  // Validate query
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return err({
      code: "EMPTY_QUERY",
      message: "Query cannot be empty",
    });
  }

  // For MVP: Return LMS results as-is
  // Deduplication is handled in transformToFullResults (full search mode, Story 3.2)
  // No need to spread - lmsResults is already readonly and immutable
  return ok(lmsResults);
};

/**
 * Processes autocomplete results for quick artist/album access.
 *
 * Since the LMS titles command returns only tracks (type: "track"), suggestions
 * are derived from the artist and album metadata embedded in track results.
 * Artists and albums are deduplicated and limited to top 5 combined.
 *
 * Pure function — no side effects.
 *
 * @param query - User search query
 * @param lmsResults - Results from LMS client (all type: "track" when using titles command)
 * @returns Result with autocomplete suggestions or error
 */
export const getAutocompleteSuggestions = (
  query: string,
  lmsResults: readonly LmsSearchResult[],
): Result<readonly AutocompleteSuggestion[], SearchError> => {
  // Validate query
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return err({
      code: "EMPTY_QUERY",
      message: "Query cannot be empty",
    });
  }

  const tracks = lmsResults.filter(isTrack);

  // Unique artists derived from track metadata.
  // Uses getNavigationArtist (albumartist with VA guard) to avoid showing
  // collaboration names like "Taylor Swift, Hayley Williams" as separate artist entries.
  // Pure: filter by first occurrence of each artist key — no external state needed.
  const artistSuggestions: readonly AutocompleteSuggestion[] = tracks
    .filter((t, idx, arr) => {
      const navArtist = getNavigationArtist(t);
      return (
        navArtist.trim() !== "" &&
        arr.findIndex(
          (other) =>
            getNavigationArtist(other).trim().toLowerCase() ===
            navArtist.trim().toLowerCase(),
        ) === idx
      );
    })
    .map((t) => ({
      id: `artist::${getNavigationArtist(t).trim().toLowerCase()}`,
      type: "artist" as const,
      artist: getNavigationArtist(t),
      artistId: t.artistId,
      albumCover: undefined,
      quality: undefined,
    }));

  // Unique albums derived from track metadata (keyed by artist+album).
  // Pure: filter by first occurrence of each artist::album key — no external state needed.
  // coverArtUrl from the first matching track is used as the album thumbnail.
  const albumSuggestions: readonly AutocompleteSuggestion[] = tracks
    .filter(
      (t, idx, arr) =>
        t.album.trim() !== "" &&
        arr.findIndex(
          (other) =>
            other.artist.trim().toLowerCase() ===
              t.artist.trim().toLowerCase() &&
            other.album.trim().toLowerCase() === t.album.trim().toLowerCase(),
        ) === idx,
    )
    .map((t) => ({
      id: `album::${t.artist.trim().toLowerCase()}::${t.album.trim().toLowerCase()}`,
      type: "album" as const,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      // Track-ID-based cover URLs from LMS are unreliable: albums without
      // embedded artwork return the same generic placeholder (HTTP 200, 28KB PNG).
      // We have no way to distinguish real covers from the placeholder here,
      // so we omit the cover and show the ♪ placeholder instead.
      albumCover: undefined,
      quality: undefined,
    }));

  // Score each suggestion by how closely its name matches the query.
  // This compensates for the LMS returning tracks in an arbitrary order:
  // an artist that exactly matches the query should rank above one that
  // merely contains it somewhere.
  const q = trimmedQuery.toLowerCase();
  const scoreLabel = (label: string): number => {
    const normalized = label.toLowerCase();
    if (normalized === q) {
      return 3; // exact match
    }
    if (normalized.startsWith(q)) {
      return 2; // prefix match
    }
    if (normalized.includes(q)) {
      return 1; // substring match
    }
    return 0;
  };

  const scoreArtist = (s: AutocompleteSuggestion): number =>
    scoreLabel(s.artist);

  const scoreAlbum = (s: AutocompleteSuggestion): number =>
    Math.max(
      scoreLabel(s.artist),
      s.album !== undefined ? scoreLabel(s.album) : 0,
    );

  const rankedArtists = [...artistSuggestions].sort(
    (a, b) => scoreArtist(b) - scoreArtist(a),
  );
  const rankedAlbums = [...albumSuggestions].sort(
    (a, b) => scoreAlbum(b) - scoreAlbum(a),
  );

  // Artists first, then albums — limit combined to top 5
  const suggestions: readonly AutocompleteSuggestion[] = [
    ...rankedArtists,
    ...rankedAlbums,
  ].slice(0, 5);

  return ok(suggestions);
};

/**
 * Type guard to narrow LmsSearchResult to track only.
 */
const isTrack = (
  result: LmsSearchResult,
): result is LmsSearchResult & { readonly type: "track" } => {
  return result.type === "track";
};

/**
 * Normalizes artist, album, and title into a deduplication key.
 * Lowercases and trims all fields; separates with '::' delimiter.
 * Pure function — no side effects.
 *
 * @param artist - Track artist name
 * @param album - Track album name
 * @param title - Track title
 * @returns Normalized deduplication key string
 */
export const normalizeDeduplicationKey = (
  artist: string,
  album: string,
  title: string,
  url: string,
): string => {
  const normArtist = artist.trim().toLowerCase();
  const normAlbum = album.trim().toLowerCase();
  // Without artist AND album we cannot reliably identify a unique track across sources
  // (e.g. two unrelated "Intro" tracks with no metadata would be falsely merged).
  // Fall back to URL — effectively disabling cross-source deduplication for that track.
  //
  // Story 7.9: Tidal tracks are enriched with artist/album via LMS tidal_info command before
  // reaching this function — cross-source deduplication works for fresh (never-played) tracks.
  // When enrichment fails (graceful degradation), tracks with empty artist+album still
  // use the URL fallback (no false merges, both tracks visible to the user).
  if (normArtist === "" && normAlbum === "") {
    return url;
  }
  return `${normArtist}::${normAlbum}::${title.trim().toLowerCase()}`;
};

/**
 * Selects the best source from available sources using DEFAULT_SOURCE_HIERARCHY priority.
 * Priority order: local > qobuz > tidal. Unknown sources have lowest priority.
 * Pure function — no side effects.
 *
 * NOTE: Uses source priority only — called as fallback when not all sources have AudioQuality.
 * Quality-based selection is handled by selectBestAvailableSource() which calls this as fallback.
 *
 * @param sources - Available sources for a track
 * @returns Best source by priority, or undefined if sources is empty
 */
export const selectSourceByPriority = (
  sources: readonly AvailableSource[],
): AvailableSource | undefined => {
  if (sources.length === 0) {
    return undefined;
  }
  return [...sources].sort((a, b) => {
    const rankA = getSourceRank(a.source);
    const rankB = getSourceRank(b.source);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    // Secondary sort by URL for deterministic tie-breaking when priorities are equal (e.g. multiple "unknown" sources)
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  })[0];
};

/**
 * Selects best source using AudioQuality when all candidates have quality data.
 * Falls back to source priority when quality data is missing (e.g. streaming tracks).
 * When quality selection is used, the source is returned as-is (with audioQuality).
 * When priority fallback is used, audioQuality is cleared (quality comparison was not possible).
 * Pure function — no side effects.
 *
 * Precondition: sources is non-empty (caller guarantees via `?? sources[0]!`)
 */
export const selectBestAvailableSource = (
  sources: readonly AvailableSource[],
): AvailableSource | undefined => {
  if (sources.length === 0) {
    return undefined;
  }

  // "unknown" sources are excluded from quality comparison:
  // TrackSource.source: SourceType doesn't include "unknown".
  // Quality selection requires ALL non-unknown sources to have quality data —
  // this prevents unfair comparison when a known source is missing quality info.
  const nonUnknownSources = sources.filter(
    (s): s is AvailableSource & { readonly source: SourceType } =>
      isKnownSourceType(s.source),
  );
  const sourcesWithQuality = sources.filter(
    (
      s,
    ): s is AvailableSource & {
      readonly audioQuality: AudioQuality;
      readonly source: SourceType;
    } => s.audioQuality !== undefined && isKnownSourceType(s.source),
  );

  if (
    sourcesWithQuality.length === nonUnknownSources.length &&
    sourcesWithQuality.length > 0
  ) {
    const trackSources: readonly TrackSource[] = sourcesWithQuality.map(
      (s) => ({
        source: s.source,
        url: s.url,
        quality: s.audioQuality, // narrowed by filter: AudioQuality (not undefined)
        available: true,
      }),
    );
    const result = selectBestSource(trackSources);
    if (result.ok) {
      // Guaranteed: result.value.url is in sources — trackSources were built from
      // sourcesWithQuality which is a filtered subset of sources (same URL objects).
      // The non-null assertion is safe; the fallback would be unreachable dead code.
      return sources.find((s) => s.url === result.value.url)!;
    }
    // selectBestSource error (e.g. INVALID_QUALITY_DATA) → fall through to priority
  }

  // Fallback: priority-based selection
  // Clear audioQuality: quality data was incomplete so quality comparison was not possible
  const fallback = selectSourceByPriority(sources);
  return fallback ? { source: fallback.source, url: fallback.url } : undefined;
};

/**
 * Deduplicates LMS track results across sources.
 * Groups tracks by normalized (artist + album + title) key.
 * Selects best source by priority (DEFAULT_SOURCE_HIERARCHY).
 * Pure function — no side effects, no mutations.
 *
 * @param tracks - Raw LMS search results (may include non-track types)
 * @returns Deduplicated track results with all available sources listed
 */
export const deduplicateTracks = (
  tracks: readonly LmsSearchResult[],
): readonly DeduplicatedTrackResult[] => {
  // Step 1: Filter to tracks only (skip artists/albums) — validate input type first (Story 3.1 H1 learning)
  const trackOnly = tracks.filter((t) => t.type === "track");

  // Step 2: Group tracks by normalized deduplication key (immutable reduce)
  const groupMap = trackOnly.reduce((acc, track) => {
    const key = normalizeDeduplicationKey(
      track.artist,
      track.album,
      track.title,
      track.url,
    );
    const existing = acc.get(key) ?? [];
    return new Map([...acc, [key, [...existing, track]]]);
  }, new Map<string, readonly LmsSearchResult[]>());

  // Step 3: Build DeduplicatedTrackResult for each group
  return Array.from(groupMap.values()).map((group) => {
    const allSources: readonly AvailableSource[] = group.map((t) => ({
      source: t.source,
      url: t.url,
      audioQuality: t.audioQuality,
    }));
    // Deduplicate by source — keep one entry per source, best quality wins within same source.
    // Prevents "Also available on: Tidal, Tidal, Tidal" when Tidal returns multiple quality tiers.
    const sources: readonly AvailableSource[] = Array.from(
      allSources
        .reduce((acc, s) => {
          const existing = acc.get(s.source);
          if (!existing) {
            return new Map([...acc, [s.source, s]]);
          }
          const betterInGroup =
            selectBestAvailableSource([existing, s]) ?? existing;
          return new Map([...acc, [s.source, betterInGroup]]);
        }, new Map<string, AvailableSource>())
        .values(),
    );
    const best = selectBestAvailableSource(sources) ?? sources[0]!;
    return {
      id: best.url, // LMS URL as stable ID for deduplicated result
      title: group[0]!.title,
      artist: group[0]!.artist,
      albumartist: group[0]!.albumartist,
      album: group[0]!.album,
      duration: undefined, // TODO(Story 3.x): Implement LMS metadata query for track duration
      url: best.url,
      source: best.source,
      availableSources: sources,
      audioQuality: best.audioQuality,
      albumId: group[0]!.albumId,
      artistId: group[0]!.artistId,
      coverArtUrl: group.find((t) => t.coverArtUrl !== undefined)?.coverArtUrl,
    } satisfies DeduplicatedTrackResult;
  });
};

/**
 * Returns the artist name to use for navigation to an artist page.
 * Prefers albumartist over track artist to avoid showing collaboration names
 * (e.g. "Taylor Swift, Hayley Williams") when the album artist is "Taylor Swift".
 * Falls back to track artist for Various Artists compilations so individual
 * artists (e.g. "Radiohead") appear instead of "Various Artists".
 */
const getNavigationArtist = (t: {
  readonly artist: string;
  readonly albumartist?: string;
}): string => {
  const albumartist = t.albumartist?.trim();
  if (albumartist && albumartist.toLowerCase() !== "various artists") {
    return albumartist;
  }
  return t.artist;
};

/**
 * Extracts unique artists from deduplicated tracks.
 * Deduplication is case-insensitive by navigation artist name.
 * Uses albumartist (when set and not "Various Artists") as navigation target
 * to avoid showing collaboration track-artist names like "Taylor Swift, Hayley Williams".
 * First occurrence of each navigation artist name wins (preserves original casing).
 * Pure function — no side effects, no mutations.
 *
 * @param tracks - Deduplicated track results
 * @returns Array of unique artist results with artistId when available
 */
const extractUniqueArtists = (
  tracks: readonly DeduplicatedTrackResult[],
): readonly ArtistResult[] =>
  tracks
    .filter((t, idx, arr) => {
      const navArtist = getNavigationArtist(t);
      return (
        navArtist.trim() !== "" &&
        arr.findIndex(
          (other) =>
            getNavigationArtist(other).trim().toLowerCase() ===
            navArtist.trim().toLowerCase(),
        ) === idx
      );
    })
    .map((t) => ({
      name: getNavigationArtist(t),
      artistId: t.artistId ?? null,
      // Track-ID-based cover URLs are unreliable (LMS returns a generic
      // placeholder for albums without embedded artwork). Omit until we
      // have a reliable cover source (e.g. album_id-based URL or external API).
      coverArtUrl: undefined,
    }));

/**
 * Transforms LMS search results to full results with tracks, albums, and artists.
 * Pure function - deduplicates tracks across sources, groups by album, extracts artists.
 *
 * @param query - User search query
 * @param lmsResults - Results from LMS client
 * @returns Result with full search results or error
 */
export const transformToFullResults = (
  query: string,
  lmsResults: readonly LmsSearchResult[],
): Result<SearchResultsResponse, SearchError> => {
  // Validate query
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return err({
      code: "EMPTY_QUERY",
      message: "Query cannot be empty",
    });
  }

  // Filter to tracks only, then deduplicate across sources (Story 3.2)
  const trackResults = lmsResults.filter(isTrack);
  const tracks = deduplicateTracks(trackResults);

  // Group deduplicated tracks by album using reduce (fully immutable approach).
  // Groups by albumId when available (correct for tracks with different track artists
  // on the same album, e.g. classical pieces credited individually). Falls back to
  // artist::album composite key for streaming tracks without a LMS album ID.
  type AlbumAccEntry = {
    readonly title: string;
    readonly count: number;
    readonly albumId?: string;
    readonly source?: "local" | "qobuz" | "tidal" | "unknown";
    readonly albumArtist?: string; // LMS albumartist tag — used preferentially over most-common track artist
    readonly allArtists: readonly string[];
    readonly trackUrls: readonly string[]; // accumulated track URLs — used for streaming albums only
    readonly trackTitles: readonly string[]; // parallel to trackUrls (Story 9.12)
    readonly coverArtUrl?: string; // LMS HTTP cover art URL for local albums (Story 9.8)
  };
  const albumMap = tracks.reduce((acc, track) => {
    // Skip tracks with missing album/artist info (edge case)
    if (!track.album || !track.artist) {
      return acc;
    }

    // Prefer albumId-based key so tracks with different track artists on the same
    // physical album are merged into one entry (fixes wrong-artist display).
    const albumKey =
      track.albumId ??
      `${track.artist.trim().toLowerCase()}::${track.album.trim().toLowerCase()}`;
    const existing = acc.get(albumKey);
    // Collect track URL if non-empty (streaming tracks have tidal:// or similar URLs)
    const existingUrls = existing?.trackUrls ?? [];
    const newTrackUrls =
      typeof track.url === "string" && track.url.length > 0
        ? [...existingUrls, track.url]
        : existingUrls;
    // Accumulate track titles parallel to trackUrls (Story 9.12)
    const existingTitles = existing?.trackTitles ?? [];
    const newTrackTitles =
      typeof track.url === "string" && track.url.length > 0
        ? [...existingTitles, track.title]
        : existingTitles;
    const newEntry: AlbumAccEntry = {
      title: track.album,
      count: (existing?.count ?? 0) + 1,
      albumId: existing?.albumId ?? track.albumId,
      source: existing?.source ?? track.source,
      albumArtist: existing?.albumArtist ?? track.albumartist,
      allArtists: [...(existing?.allArtists ?? []), track.artist],
      trackUrls: newTrackUrls,
      trackTitles: newTrackTitles,
      coverArtUrl: existing?.coverArtUrl ?? track.coverArtUrl,
    };

    // Immutable: create new Map with updated entry
    return new Map([...acc, [albumKey, newEntry]]);
  }, new Map<string, AlbumAccEntry>());

  // Finds the most frequently occurring non-empty artist in an album's track list.
  // Handles albums where individual tracks credit different artists (e.g. classical covers).
  // Returns "" when all artists are empty — consistent with metadata/service.ts implementation.
  const findMostCommonArtist = (artists: readonly string[]): string => {
    const nonEmpty = artists.filter((a) => a !== "");
    if (nonEmpty.length === 0) {
      return "";
    }
    const freq = nonEmpty.reduce((freqMap, artist) => {
      return new Map([...freqMap, [artist, (freqMap.get(artist) ?? 0) + 1]]);
    }, new Map<string, number>());
    return (
      [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? nonEmpty[0]!
    );
  };

  // Convert map to AlbumResult array — includes ALL albums (local and streaming).
  // Local albums: id = albumId (LMS album ID), albumId is defined → navigable. trackUrls: undefined.
  // Streaming albums: id = compound lowercase "artist::album" key, albumId undefined → non-navigable.
  //   trackUrls: populated with track URLs from search results (enables play/queue in SearchResultsList).
  const albums = Array.from(albumMap.entries()).map(([key, data]) => ({
    id: data.albumId ?? key,
    albumId: data.albumId,
    source: data.source,
    title: data.title,
    artist: data.albumArtist || findMostCommonArtist(data.allArtists),
    trackCount: data.count,
    trackUrls:
      data.albumId === undefined && data.trackUrls.length > 0
        ? data.trackUrls
        : undefined,
    trackTitles:
      data.albumId === undefined && data.trackTitles.length > 0
        ? data.trackTitles
        : undefined,
    coverArtUrl: data.coverArtUrl,
  }));

  return ok({
    tracks,
    albums,
    artists: extractUniqueArtists(tracks),
    query: trimmedQuery,
    totalResults: tracks.length,
  });
};
