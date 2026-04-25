/**
 * Radio Mode — Context-Aware Filtering Service
 *
 * Functional core: Pure functions with NO side effects, NO IO.
 * No let declarations, no mutations, no console.log, no fetch.
 * Recursive era expansion instead of loops (functional/no-let).
 */

import {
  type FilterConfig,
  type RadioContext,
  type CandidateTrack,
  DEFAULT_FILTER_CONFIG,
} from "./types.js";

// ---------------------------------------------------------------------------
// Genre Groups (AC2)
// ---------------------------------------------------------------------------

// Genre relatedness groups — case-insensitive matching.
// Two genres are "related" if they appear in the same group array.
// Based on common musical genre taxonomy.
const GENRE_GROUPS: readonly (readonly string[])[] = [
  [
    "jazz",
    "cool jazz",
    "bebop",
    "swing",
    "big band",
    "free jazz",
    "jazz fusion",
    "hard bop",
    "post-bop",
    "dixieland",
    "modal jazz",
    "soul jazz",
    "latin jazz",
  ],
  [
    "classical",
    "contemporary classical",
    "baroque",
    "romantic",
    "opera",
    "chamber music",
    "orchestral",
    "symphony",
    "minimalism",
  ],
  [
    "rock",
    "alternative rock",
    "indie rock",
    "classic rock",
    "hard rock",
    "punk rock",
    "progressive rock",
    "art rock",
    "garage rock",
    "psychedelic rock",
  ],
  ["pop", "indie pop", "synth pop", "power pop", "dream pop", "chamber pop"],
  [
    "electronic",
    "ambient",
    "techno",
    "house",
    "drum and bass",
    "idm",
    "electronica",
    "trip-hop",
    "downtempo",
    "breakbeat",
  ],
  ["blues", "soul", "r&b", "rhythm and blues", "gospel", "neo-soul"],
  ["country", "folk", "americana", "bluegrass", "country rock"],
  ["hip-hop", "rap", "hip hop", "trap"],
  [
    "metal",
    "heavy metal",
    "death metal",
    "black metal",
    "doom metal",
    "thrash metal",
  ],
  ["reggae", "ska", "dub", "dancehall"],
] as const;

// ---------------------------------------------------------------------------
// Helper Functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Returns true if genreA and genreB are the same or belong to the same genre group.
 * Case-insensitive comparison.
 *
 * Pure function — no side effects, no mutations.
 */
export const areGenresRelated = (genreA: string, genreB: string): boolean => {
  const normalizedA = genreA.toLowerCase();
  const normalizedB = genreB.toLowerCase();
  if (normalizedA === normalizedB) {
    return true;
  }
  return GENRE_GROUPS.some(
    (group) =>
      group.some((g) => g === normalizedA) &&
      group.some((g) => g === normalizedB),
  );
};

/**
 * Returns true if candidate passes the era filter (AC1, AC5).
 *
 * Graceful degradation rules (AC5):
 * - If seedYear is absent → no era filter → pass
 * - If candidate.year is absent → unknown era → pass
 *
 * Pure function — no side effects, no mutations.
 */
export const passesEraFilter = (
  candidate: CandidateTrack,
  seedYear: number | undefined,
  eraWindow: number,
): boolean => {
  if (seedYear === undefined) {
    return true;
  }
  if (candidate.year === undefined) {
    return true;
  }
  return Math.abs(candidate.year - seedYear) <= eraWindow;
};

/**
 * Returns true if candidate passes the genre filter (AC2, AC5).
 *
 * Graceful degradation rules (AC5):
 * - If seedGenres is absent or empty → no genre filter → pass
 * - If candidate.genres is absent or empty → unknown genre → pass
 *
 * Pure function — no side effects, no mutations.
 */
export const passesGenreFilter = (
  candidate: CandidateTrack,
  seedGenres: readonly string[] | undefined,
): boolean => {
  if (seedGenres === undefined || seedGenres.length === 0) {
    return true;
  }
  if (candidate.genres === undefined || candidate.genres.length === 0) {
    return true;
  }
  return candidate.genres.some((candidateGenre) =>
    seedGenres.some((seedGenre) => areGenresRelated(candidateGenre, seedGenre)),
  );
};

// ---------------------------------------------------------------------------
// Main Filter Function (AC1–AC6)
// ---------------------------------------------------------------------------

/**
 * Filters candidates by era and genre context (AC1+AC2).
 * Uses recursive era expansion when fewer than minResults survive (AC4).
 * No side effects, no IO, no mutable state — same input always yields same output (AC6).
 *
 * @param candidates - List of radio suggestion candidates
 * @param context - Seed track context (seedYear, seedGenres)
 * @param config - Filter configuration (defaults to DEFAULT_FILTER_CONFIG)
 * @returns Filtered list of candidates (readonly, never mutated)
 */
export const filterByContext = (
  candidates: readonly CandidateTrack[],
  context: RadioContext,
  config: FilterConfig = DEFAULT_FILTER_CONFIG,
): readonly CandidateTrack[] => {
  const applyFilters = (eraWindow: number): readonly CandidateTrack[] =>
    candidates.filter(
      (candidate) =>
        passesEraFilter(candidate, context.seedYear, eraWindow) &&
        passesGenreFilter(candidate, context.seedGenres),
    );

  // Recursive expansion: no let, no mutation (AC4 + functional/no-let compliance)
  // Guard: if eraExpansionStep <= 0, no expansion is possible → return immediately
  const expandIfNeeded = (eraWindow: number): readonly CandidateTrack[] => {
    const filtered = applyFilters(eraWindow);
    const nextWindow = eraWindow + config.eraExpansionStep;
    if (
      filtered.length >= config.minResults ||
      eraWindow >= config.maxEraWindow ||
      nextWindow <= eraWindow
    ) {
      return filtered;
    }
    return expandIfNeeded(nextWindow);
  };

  return expandIfNeeded(config.initialEraWindow);
};
