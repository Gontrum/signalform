/**
 * Time Formatting Utilities
 *
 * Pure functions for formatting time values (seconds) to human-readable strings.
 * Used for progress bar and playback time display.
 */

/**
 * Format seconds to "M:SS" or "MM:SS" format.
 *
 * Examples:
 * - 5 seconds → "0:05"
 * - 45 seconds → "0:45"
 * - 165 seconds (2:45) → "2:45"
 * - 2732 seconds (45:32) → "45:32"
 *
 * @param seconds - Time in seconds (non-negative integer)
 * @returns Formatted time string "M:SS" or "MM:SS"
 */
export const formatSeconds = (seconds: number): string => {
  // Issue #15: Guard against negative values
  if (seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Format progress as "current / total" (e.g., "2:45 / 4:32").
 *
 * @param current - Current time in seconds
 * @param total - Total duration in seconds
 * @returns Formatted progress string "M:SS / M:SS"
 */
export const formatProgress = (current: number, total: number): string =>
  `${formatSeconds(current)} / ${formatSeconds(total)}`;
