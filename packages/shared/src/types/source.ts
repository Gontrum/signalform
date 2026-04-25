export type SourceType = "local" | "qobuz" | "tidal";

export type SourceHierarchy = ReadonlyArray<SourceType>;

// Default hierarchy: Local → Qobuz → Tidal
export const DEFAULT_SOURCE_HIERARCHY: SourceHierarchy = [
  "local",
  "qobuz",
  "tidal",
];

/**
 * Valid track URL protocol prefixes accepted by LMS.
 *
 * Single source of truth — import from @signalform/shared wherever
 * protocol validation is needed (core, shell, or adapter layer).
 */
export const VALID_TRACK_PROTOCOLS = [
  "file:///",
  "http://",
  "https://",
  "qobuz://",
  "tidal://",
  "spotify://",
] as const;

export type ValidTrackProtocol = (typeof VALID_TRACK_PROTOCOLS)[number];
