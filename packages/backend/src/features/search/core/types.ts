/**
 * Search Feature Type Definitions
 *
 * Type-safe abstractions for multi-source search API.
 * Follows functional programming patterns with readonly types.
 */

import type { SearchResult as LmsSearchResult } from "../../../adapters/lms-client/index.js";
import type { AudioQuality } from "@signalform/shared";

/**
 * Search request from client.
 */
export type SearchRequest = {
  readonly query: string;
};

/**
 * Search response to client.
 */
export type SearchResponse = {
  readonly results: readonly LmsSearchResult[];
  readonly query: string;
  readonly totalCount: number;
};

/**
 * Union type for all search errors.
 * Mapped to HTTP status codes in route handler.
 */
export type SearchError =
  | { readonly code: "EMPTY_QUERY"; readonly message: string }
  | {
      readonly code: "INVALID_INPUT";
      readonly message: string;
      readonly details?: unknown;
    }
  | { readonly code: "LMS_UNREACHABLE"; readonly message: string }
  | {
      readonly code: "LMS_ERROR";
      readonly message: string;
      readonly details?: string;
    }
  | { readonly code: "INTERNAL_ERROR"; readonly message: string };

export type { AudioQuality };

/**
 * Autocomplete suggestion (artist or album only).
 */
export type AutocompleteSuggestion = {
  readonly id: string;
  readonly type: "artist" | "album";
  readonly artist: string;
  readonly album?: string; // Only for album type
  readonly albumCover?: string; // Thumbnail URL
  readonly quality?: AudioQuality; // Optional quality badge
  readonly artistId?: string; // Real LMS artist ID; undefined for streaming tracks
  readonly albumId?: string; // Real LMS album ID; undefined for streaming tracks
};

/**
 * Source entry representing one available source for a deduplicated track.
 * Used in DeduplicatedTrackResult to list all sources where the track is available.
 */
export type AvailableSource = {
  readonly source: "local" | "qobuz" | "tidal" | "unknown";
  readonly url: string;
  readonly audioQuality?: AudioQuality; // undefined for streaming tracks or unknown format
};

/**
 * Deduplicated track result — same track from multiple sources merged into one.
 * The url and source fields refer to the best (quality- or priority-selected) source.
 * The availableSources field lists all sources (including the selected one).
 *
 * Story 3.3 uses selectedSource badge display.
 * Story 3.4 uses availableSources for "Also available on:" UI.
 */
export type DeduplicatedTrackResult = {
  readonly id: string; // Best source URL (stable ID for deduplicated result)
  readonly title: string;
  readonly artist: string;
  readonly albumartist?: string; // LMS tag A — album-level artist for correct album grouping display
  readonly album: string;
  readonly duration?: number; // Optional - LMS search API doesn't provide it
  readonly url: string; // URL of best (quality- or priority-selected) source
  readonly source: "local" | "qobuz" | "tidal" | "unknown"; // Best source
  readonly availableSources: readonly AvailableSource[]; // All sources incl. selected
  readonly audioQuality?: AudioQuality; // Quality of best source; undefined if priority-fallback was used
  readonly albumId?: string; // Real LMS album ID from first track in group; undefined for streaming
  readonly artistId?: string; // Real LMS artist ID from first track in group; undefined for streaming
  readonly coverArtUrl?: string; // LMS HTTP cover art URL from best source track (Story 9.8)
};

/**
 * Album result for display in search results.
 * id: LMS albumId for local albums, compound "artist::album" key for streaming albums.
 * albumId: real LMS album ID — undefined for streaming albums (determines navigability).
 * source: originating source — used to display source-specific badge for streaming albums.
 * trackUrls: track URLs for streaming albums (populated when albumId is undefined) — enables
 *   play/queue actions in SearchResultsList without a LMS album ID. undefined for local albums.
 * trackTitles: track titles parallel to trackUrls — enables track list display (Story 9.12).
 */
export type AlbumResult = {
  readonly id: string;
  readonly albumId?: string; // undefined for streaming albums — determines navigability
  readonly source?: "local" | "qobuz" | "tidal" | "unknown"; // source of the first track
  readonly title: string;
  readonly artist: string;
  readonly trackCount: number;
  readonly trackUrls?: ReadonlyArray<string>; // populated for streaming albums; undefined for local
  readonly trackTitles?: ReadonlyArray<string>; // parallel to trackUrls (Story 9.12); undefined for local
  readonly coverArtUrl?: string; // LMS HTTP cover art URL for local albums (Story 9.8); undefined for streaming
};

/**
 * Artist result for navigation to artist detail page.
 * Extracted from deduplicated track results (Story 7.4).
 */
export type ArtistResult = {
  readonly name: string;
  readonly artistId: string | null;
  /** Cover art URL of a representative track — used as artist thumbnail fallback */
  readonly coverArtUrl?: string;
};

/**
 * Full search results response with tracks, albums, and artists.
 * Tracks are deduplicated across sources (Story 3.2).
 * Artists are extracted from deduplicated tracks (Story 7.4).
 */
export type SearchResultsResponse = {
  readonly tracks: readonly DeduplicatedTrackResult[];
  readonly albums: readonly AlbumResult[];
  readonly artists: readonly ArtistResult[];
  readonly query: string;
  readonly totalResults: number;
};
