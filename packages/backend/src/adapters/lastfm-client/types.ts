import type { Result } from "@signalform/shared";
import type { Language } from "../../infrastructure/config/index.js";

// last.fm client configuration
export type LastFmConfig = {
  readonly apiKey: string;
  readonly timeout: number; // ms (e.g., 5000)
  readonly baseUrl: string; // "https://ws.audioscrobbler.com/2.0/"
  readonly language: Language;
};

// Error union — ALL errors, no exceptions
export type LastFmError =
  | { readonly type: "NetworkError"; readonly message: string }
  | { readonly type: "TimeoutError"; readonly message: string }
  | { readonly type: "RateLimitError"; readonly message: string }
  | {
      readonly type: "NotFoundError";
      readonly code: number;
      readonly message: string;
    }
  | {
      readonly type: "ApiError";
      readonly code: number;
      readonly message: string;
    }
  | { readonly type: "ParseError"; readonly message: string }
  | { readonly type: "CircuitOpenError"; readonly message: string };

export type CircuitBreakerConfig = {
  readonly failureThreshold: number; // default: 5
  readonly resetTimeoutMs: number; // default: 60_000
};

// last.fm domain types — NOT the same as shared Track type
// last.fm only provides name/artist/match; LMS lookup happens in radio-mode feature
export type SimilarTrack = {
  readonly name: string; // track title from last.fm
  readonly artist: string; // artist name from last.fm
  readonly mbid?: string; // MusicBrainz ID (may be empty string — treat "" as undefined)
  readonly match: number; // similarity score 0-1
  readonly duration?: number; // seconds (may be 0 — treat 0 as undefined)
  readonly url: string; // last.fm page URL (not a playback URL)
};

export type SimilarArtist = {
  readonly name: string;
  readonly mbid?: string; // may be empty string — treat "" as undefined
  readonly match: number; // similarity score 0-1
  readonly url: string;
};

export type ArtistInfo = {
  readonly name: string;
  readonly mbid?: string; // may be empty string — treat "" as undefined
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  /** Raw HTML from last.fm bio.summary — may contain <a> tags and appended "Read more" link */
  readonly bio: string;
};

export type AlbumInfo = {
  readonly name: string;
  readonly mbid?: string; // may be empty string — treat "" as undefined
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  /** Raw HTML from last.fm wiki.summary */
  readonly wiki: string;
};

export type ArtistTopTrack = {
  readonly name: string;
  readonly artist: string;
  readonly mbid?: string;
  readonly playcount: number;
  readonly listeners: number;
  readonly url: string;
};

export type ArtistTopAlbum = {
  readonly name: string;
  readonly artist: string;
  readonly mbid?: string;
  readonly playcount: number;
  readonly url: string;
};

export type TagTopTrack = {
  readonly name: string;
  readonly artist: string;
  readonly mbid?: string;
  readonly url: string;
};

export type TagSearchResult = {
  readonly name: string;
  readonly count: number;
  readonly url: string;
};

export type LastFmPeriod =
  | "overall"
  | "7day"
  | "1month"
  | "3month"
  | "6month"
  | "12month";

export type UserTopArtist = {
  readonly name: string;
  readonly mbid?: string;
  readonly playcount: number;
  readonly url: string;
};

export type UserTopTrack = {
  readonly name: string;
  readonly artist: string;
  readonly mbid?: string;
  readonly playcount: number;
  readonly url: string;
};

export type UserLovedTrack = {
  readonly name: string;
  readonly artist: string;
  readonly mbid?: string;
  readonly url: string;
};

export type UserRecentTrack = {
  readonly name: string;
  readonly artist: string;
  readonly url: string;
};

export type UserNeighbour = {
  readonly username: string;
  readonly url: string;
  readonly match: number;
};

export type RecommendedTrack = {
  readonly name: string;
  readonly artist: string;
  readonly url: string;
};

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

// Client contract type
export type LastFmClient = {
  readonly getSimilarTracks: (
    artist: string,
    track: string,
    limit?: number,
  ) => Promise<Result<readonly SimilarTrack[], LastFmError>>;
  readonly getSimilarArtists: (
    artist: string,
    limit?: number,
  ) => Promise<Result<readonly SimilarArtist[], LastFmError>>;
  readonly getArtistInfo: (
    artist: string,
    language?: Language,
  ) => Promise<Result<ArtistInfo, LastFmError>>;
  readonly getAlbumInfo: (
    artist: string,
    album: string,
    language?: Language,
  ) => Promise<Result<AlbumInfo, LastFmError>>;
  readonly getArtistTopTracks: (
    artist: string,
    limit?: number,
  ) => Promise<Result<readonly ArtistTopTrack[], LastFmError>>;
  readonly getArtistTopAlbums: (
    artist: string,
    limit?: number,
  ) => Promise<Result<readonly ArtistTopAlbum[], LastFmError>>;
  readonly getTagTopTracks: (
    tag: string,
    page?: number,
    limit?: number,
  ) => Promise<Result<readonly TagTopTrack[], LastFmError>>;
  readonly searchTags: (
    query: string,
    limit?: number,
  ) => Promise<Result<readonly TagSearchResult[], LastFmError>>;
  readonly getUserTopArtists: (
    username: string,
    period?: LastFmPeriod,
    limit?: number,
  ) => Promise<Result<readonly UserTopArtist[], LastFmError>>;
  readonly getUserTopTracks: (
    username: string,
    period?: LastFmPeriod,
    limit?: number,
  ) => Promise<Result<readonly UserTopTrack[], LastFmError>>;
  readonly getUserLovedTracks: (
    username: string,
    limit?: number,
  ) => Promise<Result<readonly UserLovedTrack[], LastFmError>>;
  readonly getUserRecentTracks: (
    username: string,
    limit?: number,
  ) => Promise<Result<readonly UserRecentTrack[], LastFmError>>;
  readonly getUserNeighbours: (
    username: string,
    limit?: number,
  ) => Promise<Result<readonly UserNeighbour[], LastFmError>>;
  readonly getRecommendedTracks: (
    sessionKey: string,
    sharedSecret: string,
    limit?: number,
  ) => Promise<Result<readonly RecommendedTrack[], LastFmError>>;
  readonly nowPlaying: (params: {
    readonly artist: string;
    readonly track: string;
    readonly duration?: number;
    readonly sessionKey: string;
    readonly sharedSecret: string;
  }) => Promise<Result<void, LastFmError>>;
  readonly scrobble: (params: {
    readonly artist: string;
    readonly track: string;
    readonly timestamp: number;
    readonly duration?: number;
    readonly sessionKey: string;
    readonly sharedSecret: string;
  }) => Promise<Result<void, LastFmError>>;
  readonly getCircuitState: () => CircuitState;
};
