/**
 * Radio Mode — Track Selection (functional core): pure URL/source selection
 * and search-query building, extracted from the radio-service shell.
 */

import type { SearchResult } from "../../../adapters/lms-client/index.js";
import type { AudioQuality, TrackSource, SourceType } from "@signalform/shared";
import { selectBestSource } from "../../source-hierarchy/index.js";
import type { SelectionError } from "../../source-hierarchy/index.js";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";

/**
 * Result type for selectBestTrackUrl — carries the selected URL and any SelectionError
 * that occurred (so the caller can log it per AC6 while keeping the helper pure).
 */
export type SelectBestTrackResult = {
  readonly url: string | undefined;
  readonly selectionError?: SelectionError;
};

/**
 * Fallback quality selection: simple lossless→bitrate comparison.
 * Used when no source has audioQuality data or when selectBestSource fails.
 * Pure function — no side effects.
 */
export const computeFallbackUrl = (
  results: readonly SearchResult[],
): string | undefined => {
  if (results.length === 0) {
    return undefined;
  }
  return results.reduce((best, current) => {
    const currentLossless = current.audioQuality?.lossless ?? false;
    const bestLossless = best.audioQuality?.lossless ?? false;
    if (currentLossless && !bestLossless) {
      return current;
    }
    if (!currentLossless && bestLossless) {
      return best;
    }
    const currentBitrate = current.audioQuality?.bitrate ?? 0;
    const bestBitrate = best.audioQuality?.bitrate ?? 0;
    return currentBitrate > bestBitrate ? current : best;
  }).url;
};

/**
 * Selects the best track URL from LMS search results using source hierarchy.
 * Falls back to simple lossless→bitrate comparison if no quality data is available.
 * Returns selectionError when selectBestSource fails so caller can log it (AC6).
 * Pure function — no side effects.
 */
export const selectBestTrackUrl = (
  results: readonly SearchResult[],
): SelectBestTrackResult => {
  // Map to TrackSource — filter out unknown source and missing audioQuality.
  // ⚠️ CRITICAL: The type guard must narrow BOTH audioQuality AND source,
  // because SearchResult.source includes "unknown" which is not a valid SourceType.
  const sources: readonly TrackSource[] = results
    .filter(
      (
        r,
      ): r is typeof r & {
        readonly audioQuality: AudioQuality;
        readonly source: SourceType;
      } => r.audioQuality !== undefined && r.source !== "unknown",
    )
    .map((r) => ({
      source: r.source,
      url: r.url,
      quality: r.audioQuality,
      available: true,
    }));

  if (sources.length > 0) {
    const selectionResult = selectBestSource(sources);
    if (selectionResult.ok) {
      return { url: selectionResult.value.url };
    }
    // selectBestSource failed — fall back to simple lossless/bitrate comparison.
    // Return error so caller can log it (AC6: "logs a warn with the SelectionError details").
    return {
      url: computeFallbackUrl(results),
      selectionError: selectionResult.error,
    };
  }

  // No quality sources — use fallback (handles no-audioQuality or unknown-source results)
  return { url: computeFallbackUrl(results) };
};

/**
 * Returns true if LMS result artist plausibly matches the last.fm candidate artist.
 * Bidirectional includes-check handles: "Olivia Rodrigo feat. X" ↔ "Olivia Rodrigo",
 * case differences, and partial name matches.
 * Rejects spurious fuzzy matches (e.g. "Various Artists" for "Lisa").
 * Unicode-normalized via NFD decomposition to handle diacritics: "Björk" matches "bjork".
 */
export const artistMatches = (
  resultArtist: string,
  candidateArtist: string,
): boolean => {
  const r = normalizeArtist(resultArtist);
  const c = normalizeArtist(candidateArtist);
  return r.includes(c) || c.includes(r);
};

export const uniqueQueries = (
  queries: readonly string[],
): readonly string[] => {
  return queries.reduce<readonly string[]>((acc, query) => {
    const trimmed = query.trim();
    if (trimmed === "" || acc.includes(trimmed)) {
      return acc;
    }
    return [...acc, trimmed];
  }, []);
};

export const buildRadioSearchQueries = (
  artist: string,
  title: string,
): readonly string[] => {
  const normalizedTitle = title.replace(/\s*\([^)]*\)/g, " ").trim();
  return uniqueQueries([
    `${artist} ${title}`,
    `${title} ${artist}`,
    title,
    normalizedTitle,
    `${artist} ${normalizedTitle}`,
    `${normalizedTitle} ${artist}`,
  ]);
};
