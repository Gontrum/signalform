/**
 * Radio Mode — Artist Diversity Filter Service
 *
 * Functional core: Pure functions with NO side effects, NO IO.
 * No let declarations, no mutations, no console.log, no fetch.
 */

import {
  type CandidateTrack,
  type DiversityConfig,
  DEFAULT_DIVERSITY_CONFIG,
} from "./types.js";

/**
 * Returns true if the artist appears in the recent artists window.
 * Case-insensitive comparison.
 *
 * Pure function — no side effects, no mutations.
 */
export const isArtistInWindow = (
  artist: string,
  recentArtists: readonly string[],
): boolean => {
  const normalized = artist.toLowerCase();
  return recentArtists.some((recent) => recent.toLowerCase() === normalized);
};

/**
 * Filters candidates by artist diversity.
 * Candidates whose artist appears in the recent window (sliced to config.windowSize) are excluded.
 *
 * Pure function — same input always yields same output (AC6).
 */
export const filterByDiversity = (
  candidates: readonly CandidateTrack[],
  recentArtists: readonly string[],
  config: DiversityConfig = DEFAULT_DIVERSITY_CONFIG,
): readonly CandidateTrack[] => {
  const recentWindow =
    config.windowSize <= 0 ? [] : recentArtists.slice(-config.windowSize);
  return candidates.filter(
    (candidate) => !isArtistInWindow(candidate.artist, recentWindow),
  );
};

/**
 * Returns a new sliding window with the artist added.
 * Maintains max windowSize by dropping oldest entries.
 *
 * Pure function — returns new array, does not mutate input.
 */
export const addToSlidingWindow = (
  window: readonly string[],
  artist: string,
  windowSize: number,
): readonly string[] =>
  windowSize <= 0 ? [] : [...window, artist].slice(-windowSize);
