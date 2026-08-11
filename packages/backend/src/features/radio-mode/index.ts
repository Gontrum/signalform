/**
 * Radio Mode — Public API
 *
 * Exports all public types and functions for the radio-mode feature module.
 * Helper functions exported for testability.
 */

// Domain types
export type {
  RadioContext,
  CandidateTrack,
  FilterConfig,
} from "./core/types.js";
export { DEFAULT_FILTER_CONFIG } from "./core/types.js";

// Filtering functions (main + helpers)
export {
  filterByContext,
  areGenresRelated,
  passesEraFilter,
  passesGenreFilter,
} from "./core/service.js";

export type { DiversityConfig } from "./core/types.js";
export { DEFAULT_DIVERSITY_CONFIG } from "./core/types.js";
export {
  filterByDiversity,
  isArtistInWindow,
  addToSlidingWindow,
} from "./core/diversity-service.js";

export type { RadioEngine } from "./shell/radio-service.js";
export { createRadioEngine } from "./shell/radio-service.js";
// Genre Radio context
export type { GenreRadioContext } from "./shell/radio-state.js";
export {
  setGenreRadioContext,
  incrementGenreRadioPage,
  setRadioModeEnabledState,
} from "./shell/radio-state.js";
// Personal Radio context
export type { PersonalRadioContext } from "./shell/radio-state.js";
export {
  setPersonalRadioContext,
  incrementPersonalRadioCycle,
} from "./shell/radio-state.js";
// Loved Radio context
export type { LovedRadioContext } from "./shell/radio-state.js";
export { setLovedRadioContext } from "./shell/radio-state.js";

// Track selection (quality-aware LMS result / artist matching)
export { artistMatches, selectBestTrackUrl } from "./core/track-selection.js";
export { shuffleWithRandom } from "./core/replenish.js";

// Start pipeline (shared candidate→playable-URL resolution + play/queue tail)
export type { StartPipelineDeps } from "./shell/start-pipeline.js";
export { resolvePlayableUrls, playAndQueue } from "./shell/start-pipeline.js";
