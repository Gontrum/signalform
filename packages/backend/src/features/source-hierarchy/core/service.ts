/**
 * Source Hierarchy Service - Pure Business Logic
 *
 * Functional core: Pure functions with NO side effects.
 * All errors returned as Result<T, E> - NO exceptions thrown.
 * All data structures are readonly (immutability enforced).
 */

import { ok, err, type Result } from "@signalform/shared";
import type { AudioQuality, TrackSource, SourceType } from "@signalform/shared";
import type {
  SelectionError,
  QualityHierarchyConfig,
  SourceHierarchyService,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Lossless factor applied in quality score calculation.
 * Lossless formats (FLAC, ALAC) get a 10x multiplier.
 */
const LOSSLESS_FACTOR = 10 as const;

/**
 * Format bonuses applied on top of the base score.
 */
const FORMAT_BONUSES: Readonly<Record<AudioQuality["format"], number>> = {
  FLAC: 1000,
  ALAC: 1000,
  AAC: 500,
  OGG: 250,
  MP3: 250,
} as const;

/**
 * Default source priority order: Local → Qobuz → Tidal (FR11).
 */
const DEFAULT_SOURCE_PRIORITY: readonly SourceType[] = [
  "local",
  "qobuz",
  "tidal",
] as const;

/**
 * Default quality hierarchy configuration.
 */
export const DEFAULT_QUALITY_CONFIG: QualityHierarchyConfig = {
  sourcePriority: DEFAULT_SOURCE_PRIORITY,
  losslessFactor: LOSSLESS_FACTOR,
  formatBonuses: FORMAT_BONUSES,
} as const;

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates that an AudioQuality object has well-formed values.
 * Returns true if valid, false if any field is invalid.
 */
const isValidAudioQuality = (quality: AudioQuality): boolean => {
  return (
    quality.bitrate > 0 &&
    quality.sampleRate > 0 &&
    (quality.bitDepth === undefined ||
      (quality.bitDepth > 0 && Number.isFinite(quality.bitDepth))) &&
    Number.isFinite(quality.bitrate) &&
    Number.isFinite(quality.sampleRate)
  );
};

/**
 * Validates that a TrackSource has all required quality fields present.
 */
const hasCompleteQualityData = (source: TrackSource): boolean => {
  const q = source.quality;
  return (
    typeof q.bitrate === "number" &&
    typeof q.sampleRate === "number" &&
    // bitDepth is optional per AudioQuality type — absence is valid, not missing data
    (q.bitDepth === undefined || typeof q.bitDepth === "number") &&
    typeof q.lossless === "boolean" &&
    typeof q.format === "string"
  );
};

// ---------------------------------------------------------------------------
// Pure Ranking Functions (Task 2)
// ---------------------------------------------------------------------------

/**
 * Calculates a numeric quality score for an AudioQuality object.
 *
 * Formula: (bitDepth × sampleRate × losslessFactor) + formatBonus
 *
 * Design decision (LOW-2): Bitrate is intentionally excluded from the formula.
 * The score is driven by bit depth, sample rate, lossless flag, and codec type —
 * all of which are stable, source-independent measures of quality resolution.
 * Bitrate varies by encoder settings and codec efficiency (e.g., AAC at 256 kbps
 * can exceed MP3 at 320 kbps in perceived quality), making it an unreliable
 * ranking signal. Format-based bonuses capture codec quality differences instead.
 *
 * Pure function - no side effects, no mutations.
 *
 * @param quality - The audio quality to score
 * @param config - Configuration with weights and bonuses
 * @returns Numeric quality score (higher = better)
 */
export const calculateQualityScore = (
  quality: AudioQuality,
  config: QualityHierarchyConfig = DEFAULT_QUALITY_CONFIG,
): number => {
  const losslessFactor = quality.lossless ? config.losslessFactor : 1;
  const formatBonus = config.formatBonuses[quality.format] ?? 0;
  // When bitDepth is absent (e.g. LMS titles command doesn't provide it),
  // fall back to 1 so sampleRate still contributes to the score.
  // This means 96 kHz FLAC ranks above 44.1 kHz FLAC even without bitDepth.
  const bitDepth = quality.bitDepth ?? 1;
  return bitDepth * quality.sampleRate * losslessFactor + formatBonus;
};

/**
 * Compares two AudioQuality objects by quality score.
 *
 * Returns:
 *   - negative if b is better than a
 *   - positive if a is better than b
 *   - 0 if equal
 *
 * Pure function - no side effects, no mutations.
 */
export const compareQuality = (
  a: AudioQuality,
  b: AudioQuality,
  config: QualityHierarchyConfig = DEFAULT_QUALITY_CONFIG,
): number => {
  return calculateQualityScore(a, config) - calculateQualityScore(b, config);
};

/**
 * Applies source preference tie-breaking when quality scores are equal.
 *
 * Returns:
 *   - negative if a has higher priority than b (a should come first)
 *   - positive if b has higher priority than a
 *   - 0 if same source type
 *
 * Pure function - no side effects, no mutations.
 */
export const applySourceTieBreaker = (
  a: SourceType,
  b: SourceType,
  config: QualityHierarchyConfig = DEFAULT_QUALITY_CONFIG,
): number => {
  const indexA = config.sourcePriority.indexOf(a);
  const indexB = config.sourcePriority.indexOf(b);
  // Lower index = higher priority. Unknown sources get lowest priority.
  const rankA = indexA === -1 ? config.sourcePriority.length : indexA;
  const rankB = indexB === -1 ? config.sourcePriority.length : indexB;
  return rankA - rankB;
};

/**
 * Ranks an array of TrackSources from best to worst quality.
 *
 * Primary sort: Quality score (descending).
 * Secondary sort: Source preference tie-breaker (FR11).
 *
 * Pure function - returns a new sorted array, original is not mutated.
 */
export const rankSources = (
  sources: readonly TrackSource[],
  config: QualityHierarchyConfig = DEFAULT_QUALITY_CONFIG,
): readonly TrackSource[] => {
  return [...sources].sort((a, b) => {
    const qualityDiff = compareQuality(b.quality, a.quality, config); // reversed args → descending sort
    if (qualityDiff !== 0) {
      return qualityDiff;
    }
    return applySourceTieBreaker(a.source, b.source, config);
  });
};

// ---------------------------------------------------------------------------
// Main Selection Function (Task 3)
// ---------------------------------------------------------------------------

/**
 * Selects the best available source from a list of track sources.
 *
 * Validation steps:
 * 1. Validate input (non-empty, quality data present and valid)
 * 2. Filter to available sources
 * 3. Apply quality ranking and tie-breaking
 * 4. Return best source wrapped in Result<T, E>
 *
 * Pure function - no side effects, no mutations, no exceptions thrown.
 *
 * @param sources - Array of track sources to evaluate
 * @param config - Quality hierarchy configuration
 * @returns Result<TrackSource, SelectionError>
 */
export const selectBestSource = (
  sources: readonly TrackSource[],
  config: QualityHierarchyConfig = DEFAULT_QUALITY_CONFIG,
): Result<TrackSource, SelectionError> => {
  // 1. Validate: non-empty input
  if (sources.length === 0) {
    return err({
      type: "NO_SOURCES",
      message: "No sources provided. At least one source is required.",
    });
  }

  // 2. Filter to available sources first — quality validation only applies to
  //    sources that can actually be selected. An unavailable source with bad
  //    quality data must not prevent selection of a valid available source.
  const availableSources = sources.filter((s) => s.available);
  if (availableSources.length === 0) {
    return err({
      type: "NO_SOURCES_AVAILABLE",
      message: "All sources are marked as unavailable.",
      context: { totalSources: sources.length },
    });
  }

  // 3. Validate: available sources have complete quality data
  const sourcesWithMissingData = availableSources.filter(
    (s) => !hasCompleteQualityData(s),
  );
  if (sourcesWithMissingData.length > 0) {
    return err({
      type: "MISSING_QUALITY_DATA",
      message: `${sourcesWithMissingData.length} source(s) have incomplete quality information.`,
      context: {
        affectedSources: sourcesWithMissingData.map((s) => s.source),
      },
    });
  }

  // 4. Validate: available sources have valid quality values
  const sourcesWithInvalidData = availableSources.filter(
    (s) => !isValidAudioQuality(s.quality),
  );
  if (sourcesWithInvalidData.length > 0) {
    return err({
      type: "INVALID_QUALITY_DATA",
      message: `${sourcesWithInvalidData.length} source(s) have invalid quality data (negative or zero values).`,
      context: {
        affectedSources: sourcesWithInvalidData.map((s) => s.source),
      },
    });
  }

  // 5. Rank and return the best source
  // ranked[0]! is safe: availableSources.length > 0 guarantees ranked is non-empty
  const ranked = rankSources(availableSources, config);
  return ok(ranked[0]!);
};

// ---------------------------------------------------------------------------
// Service Factory (Task 4)
// ---------------------------------------------------------------------------

/**
 * Factory function that creates a SourceHierarchyService with given config.
 *
 * Follows factory pattern for dependency injection (no classes).
 * Returns an object with bound selectBestSource and rankSources methods.
 *
 * @param config - Quality hierarchy configuration
 * @returns SourceHierarchyService instance
 */
export const createSourceHierarchyService = (
  config: QualityHierarchyConfig = DEFAULT_QUALITY_CONFIG,
): SourceHierarchyService => ({
  selectBestSource: (sources) => selectBestSource(sources, config),
  rankSources: (sources) => rankSources(sources, config),
});
