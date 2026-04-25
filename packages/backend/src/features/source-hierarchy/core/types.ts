/**
 * Source Hierarchy Feature - Domain Type Definitions
 *
 * All types are readonly and immutable (functional core).
 */

import type { SourceType, TrackSource, Result } from "@signalform/shared";

/**
 * Error codes for source selection failures.
 */
export type SelectionErrorCode =
  | "NO_SOURCES" // No sources provided (empty array)
  | "NO_SOURCES_AVAILABLE" // All sources have available: false
  | "MISSING_QUALITY_DATA" // Source missing required quality information
  | "INVALID_QUALITY_DATA"; // Quality data is invalid (negative values, zero, etc.)

/**
 * Structured error for source selection failures.
 */
export type SelectionError = {
  readonly type: SelectionErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
};

/**
 * Configuration for the quality hierarchy weights and source priority.
 */
export type QualityHierarchyConfig = {
  readonly sourcePriority: readonly SourceType[];
  readonly losslessFactor: number;
  readonly formatBonuses: Readonly<Record<string, number>>;
};

/**
 * The complete Source Hierarchy Service interface.
 */
export type SourceHierarchyService = {
  readonly selectBestSource: (
    sources: readonly TrackSource[],
  ) => Result<TrackSource, SelectionError>;
  readonly rankSources: (
    sources: readonly TrackSource[],
  ) => readonly TrackSource[];
};
