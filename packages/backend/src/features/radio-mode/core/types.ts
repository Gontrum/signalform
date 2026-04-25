/**
 * Radio Mode — Domain Types
 *
 * Functional core: Pure domain types with NO side effects.
 * All types are readonly (immutability enforced).
 * CandidateTrack is a new domain type — NOT extending SimilarTrack from adapter layer.
 */

// Context about the seed track — used to filter radio suggestions
export type RadioContext = {
  readonly seedYear?: number; // Release year of seed track (e.g. 1959 for "Take Five")
  readonly seedGenres?: readonly string[]; // Genre tags of seed track (e.g. ["Jazz", "Cool Jazz"])
};

// A candidate track from last.fm with optional enrichment metadata.
// NOTE: year and genres are NOT available from last.fm's getSimilarTracks response.
//       They will be populated in Story 6.4 via LMS metadata or MusicBrainz lookups.
//       When absent, the filter passes candidates through (graceful degradation — AC5).
export type CandidateTrack = {
  readonly name: string; // Track title (from last.fm SimilarTrack)
  readonly artist: string; // Artist name (from last.fm SimilarTrack)
  readonly mbid?: string; // MusicBrainz ID (from last.fm SimilarTrack, may be undefined)
  readonly match: number; // last.fm similarity score 0-1
  readonly duration?: number; // seconds (from last.fm, may be undefined)
  readonly url: string; // last.fm page URL
  readonly year?: number; // Release year — enriched from LMS/MusicBrainz (deferred post-Story 6.4)
  readonly genres?: readonly string[]; // Genre tags — enriched from LMS/MusicBrainz (deferred post-Story 6.4)
};

// Configuration for the context-aware filtering algorithm
export type FilterConfig = {
  readonly minResults: number; // Target minimum results before expansion (default: 10)
  readonly initialEraWindow: number; // Initial ±years filter window (default: 20)
  readonly eraExpansionStep: number; // Years to expand per pass if below minResults (default: 10)
  readonly maxEraWindow: number; // Maximum ±years window before giving up expansion (default: 40)
};

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minResults: 10,
  initialEraWindow: 20,
  eraExpansionStep: 10,
  maxEraWindow: 40,
} as const;

// Configuration for the artist diversity filter
export type DiversityConfig = {
  readonly windowSize: number; // Number of recent tracks to check for diversity (default: 10)
};

export const DEFAULT_DIVERSITY_CONFIG: DiversityConfig = {
  windowSize: 10,
} as const;
