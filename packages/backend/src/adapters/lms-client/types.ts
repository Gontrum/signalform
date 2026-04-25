/**
 * LMS Client Type Definitions
 *
 * Type-safe abstractions for Lyrion Music Server JSON-RPC 2.0 protocol.
 * Follows functional programming patterns with readonly types and Result<T, E>.
 */

import type { AudioQuality, QueuePreviewItem } from "@signalform/shared";

/**
 * Configuration for LMS client connection.
 */
export type LmsConfig = {
  readonly host: string;
  readonly port: number;
  readonly playerId: string;
  readonly timeout: number; // milliseconds (5000)
  readonly retryBaseDelayMs?: number; // exponential backoff base delay (default: 1000ms; set to 0 in tests)
};

/**
 * LMS command structure (readonly tuple).
 * Commands follow JSON-RPC 2.0 format: ['command', ...params]
 */
export type LmsCommand = readonly [string, ...(readonly (string | number)[])];

/**
 * JSON-RPC 2.0 request structure for LMS.
 */
export type LmsRequest = {
  readonly method: "slim.request";
  readonly params: readonly [string, LmsCommand];
  readonly id: number;
};

/**
 * JSON-RPC 2.0 response structure from LMS.
 */
export type LmsResponse<T> = {
  readonly result: T;
  readonly id: number;
  readonly error: LmsErrorResponse | null;
};

/**
 * JSON-RPC 2.0 error object from LMS.
 */
export type LmsErrorResponse = {
  readonly code: number;
  readonly message: string;
};

/**
 * Union type for all LMS client errors.
 * All errors are wrapped in Result<T, E> - NO exceptions thrown.
 */
export type LmsError =
  | { readonly type: "NetworkError"; readonly message: string }
  | { readonly type: "TimeoutError"; readonly message: string }
  | { readonly type: "JsonParseError"; readonly message: string }
  | {
      readonly type: "LmsApiError";
      readonly code: number;
      readonly message: string;
    }
  | { readonly type: "EmptyQueryError"; readonly message: string }
  | { readonly type: "ValidationError"; readonly message: string };

/**
 * Search result from LMS (track metadata).
 */
export type SearchResult = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly albumartist?: string; // LMS tag A — album-level artist; overrides track artist for album display
  readonly album: string;
  readonly url: string;
  readonly source: "local" | "qobuz" | "tidal" | "unknown";
  readonly type: "track" | "artist" | "album";
  readonly coverArtUrl?: string; // LMS HTTP cover art URL
  readonly audioQuality?: AudioQuality; // undefined for streaming tracks without quality data
  readonly artistId?: string; // LMS numeric artist ID converted to string; undefined for streaming tracks
  readonly albumId?: string; // LMS numeric album ID converted to string; undefined for streaming tracks
};

export type { AudioQuality };

/**
 * Raw track item from LMS titles command filtered by album_id.
 * Used internally by getAlbumTracks — not exported beyond client.
 */
export type AlbumTrackRaw = {
  readonly id: number; // numeric in titles-response — convert to string
  readonly title: string;
  readonly artist?: string;
  readonly albumartist?: string; // tag: A — album-level artist (differs from per-track artist for compilation/classical)
  readonly album?: string;
  readonly url?: string;
  readonly tracknum?: string; // tag: t — 1-indexed track number (LMS returns as string)
  readonly duration?: number; // tag: d — track duration in seconds
  readonly bitrate?: string; // tag: b — e.g. "1411kb/s VBR"
  readonly samplerate?: string; // tag: r — e.g. "44100"
  readonly type?: string; // tag: o — codec: "flc", "mp3", "aac", etc.
  readonly samplesize?: number; // tag: T — bit depth (24, 16, etc.)
  readonly year?: number | string; // tag: y — release year (LMS may return as string e.g. "2008")
};

/**
 * Raw album item from LMS albums command without artist_id filter.
 * Used internally by getLibraryAlbums — same shape as ArtistAlbumRaw.
 * Live probe 2026-03-14: id=number, year=number (0 if untagged), artwork_track_id=hex string|absent.
 */
export type LibraryAlbumRaw = {
  readonly id: number; // numeric album_id — convert to string for domain layer
  readonly album: string; // album title (always present)
  readonly artist?: string; // tag: a — artist name
  readonly year?: number; // tag: y — release year (0 if untagged → map to null)
  readonly artwork_track_id?: string; // tag: j — hex track ID for cover art URL
  readonly genre?: string; // enriched from songs bulk query (not from albums command — LMS albums command does not return genre)
};

/**
 * Raw album item from LMS albums command filtered by artist_id.
 * Used internally by getArtistAlbums — not exported beyond client.
 */
export type ArtistAlbumRaw = {
  readonly id: number; // numeric album_id — convert to string for domain layer
  readonly album: string; // album title (always present)
  readonly artist?: string; // tag: a — artist name
  readonly year?: number | string; // tag: y — release year (LMS may return as string; see AlbumTrackRaw.year note)
  readonly artwork_track_id?: string; // tag: j — first track ID for cover art URL construction
};

/**
 * Raw album item from LMS Tidal plugin — tidal items command with item_id:4.
 * item_id:4 = "Alben" (user's Tidal library albums).
 * Live probe 2026-03-15: name = "{title} - {artist}", image = relative LMS proxy path.
 * No separate artist or artwork_url fields — both embedded or derivable from name/image.
 */
export type TidalAlbumRaw = {
  readonly id: string; // e.g. "4.0", "4.1" — string item index
  readonly name: string; // "{album_title} - {artist_name}" — split on last " - "
  readonly image?: string; // relative LMS proxy URL: "/imageproxy/..." — prepend http://{host}:{port}
  readonly type?: string; // "playlist" for albums
  readonly isaudio?: number; // 1 for albums
  readonly hasitems?: number; // 1 — album contains tracks
};

/**
 * Raw album item from LMS Tidal artist albums browse — tidal items command with item_id:{artistId}.1.
 * item_id:{artistId}.1 = "Alben" (artist's album section — always position 1 in artist submenu).
 * Live probe 2026-03-15 (Story 8.6): name = album title ONLY — differs from TidalAlbumRaw.name
 * which uses "{title} - {artist}" format (that is from the user's flat album library, item_id:4).
 */
export type TidalArtistAlbumRaw = {
  readonly id: string; // e.g. "6.0.1.0" — positional index within artist albums
  readonly name: string; // album title only — NOT "{title} - {artist}"
  readonly image?: string; // relative LMS proxy URL: "/imageproxy/..." — prepend http://{host}:{port}
  readonly type?: string; // "playlist" for albums
  readonly isaudio?: number; // 1 for albums
  readonly hasitems?: number; // 1 — album contains tracks
};

/**
 * Raw track item from LMS Tidal plugin — tidal items command with item_id:{albumId}.
 * Returned when browsing into a specific Tidal album (item_id:4.0, 4.1, etc.).
 * Story 8.1: used by getTidalAlbumTracks — exported for service layer.
 */
export type TidalTrackRaw = {
  readonly id: string; // e.g. "4.0.0", "4.0.1" — positional index in album browse
  readonly name: string; // track title
  readonly url?: string; // tidal:// URL for playback (present with want_url:1)
  readonly duration?: number; // track duration in seconds
  readonly type?: string; // "audio" for playable tracks
  readonly isaudio?: number; // 1 for audio tracks, absent for non-audio items
};

/**
 * Raw artist item from LMS Tidal plugin — tidal items command with item_id:7_{query}.2.
 * Returned when searching for Tidal artists by query string.
 * Story 8.8 (AC2): used by searchTidalArtists — exported for service layer.
 */
export type TidalSearchArtistRaw = {
  readonly id: string; // e.g. "7_sabrina carpenter.2.0" — positional index in search results
  readonly name: string; // artist name (e.g. "Sabrina Carpenter")
  readonly image?: string; // relative LMS proxy URL: "/imageproxy/..." — prepend http://{host}:{port}
  readonly type?: string; // "outline" for artist browse nodes
  readonly isaudio?: number; // 0 for artists (not directly playable)
};

/**
 * Raw track item from LMS status command (queue entry).
 * Used internally by getQueue — not exported beyond client.
 */
export type QueueTrackRaw = {
  readonly id: number | string; // LMS returns numeric IDs at runtime
  readonly title: string;
  readonly artist?: string; // tag a — may be absent
  readonly album?: string; // tag l — may be absent
  readonly duration?: number | string; // tag d — seconds (float); LMS returns string for Tidal tracks
  readonly url?: string; // tag u — track URI (for source detection)
  readonly bitrate?: string; // tag b — e.g. "1411kb/s VBR"
  readonly samplerate?: string; // tag r — e.g. "44100"
  readonly type?: string; // tag o — codec: "flc", "mp3", "aac", etc.
  readonly samplesize?: number; // tag s — bit depth (24, 16, etc.)
};

/**
 * Player status from LMS.
 */
export type PlayerStatus = {
  readonly mode: "play" | "pause" | "stop";
  readonly time: number; // seconds
  readonly duration: number; // seconds
  readonly volume: number; // 0-100
  readonly currentTrack: SearchResult | null;
  readonly queuePreview: readonly QueuePreviewItem[];
};

export type { QueuePreviewItem };

/**
 * LMS library rescan progress.
 * rescan:1 = scanning in progress, rescan:0 = idle.
 */
export type RescanProgress = {
  readonly scanning: boolean;
  readonly step: string; // e.g. "discovering_directory", "importing"
  readonly info: string; // current path or info string
  readonly totalTime: string; // e.g. "00:00:04"
};
