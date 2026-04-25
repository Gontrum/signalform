/**
 * Playback Feature - Public API
 *
 * Exports public-facing functions and types for playback feature.
 */

// Route registration
export { createPlaybackRoute } from "./shell/route.js";

// Business logic (pure functions)
export { initiatePlayback } from "./core/service.js";

// Types
export type { PlaybackCommand, PlaybackError } from "./core/types.js";
