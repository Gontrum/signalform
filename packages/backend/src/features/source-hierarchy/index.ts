/**
 * Source Hierarchy Feature - Public API
 *
 * Exports the service factory, pure functions, types, and error codes.
 */

// Service factory and pure functions
export {
  createSourceHierarchyService,
  selectBestSource,
  rankSources,
  calculateQualityScore,
  compareQuality,
  applySourceTieBreaker,
  DEFAULT_QUALITY_CONFIG,
} from "./core/service.js";

// Types
export type {
  SelectionError,
  SelectionErrorCode,
  QualityHierarchyConfig,
  SourceHierarchyService,
} from "./core/types.js";
