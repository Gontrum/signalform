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
  readonly getCircuitState: () => CircuitState;
};
