export const WAKE_THROTTLE_MS = 60_000

export const shouldTriggerWake = (lastWakeAt: number, now: number): boolean =>
  now - lastWakeAt >= WAKE_THROTTLE_MS

const LMS_DOWN_BANNER_THRESHOLD = 2

/**
 * Shows the "LMS down" banner only after two consecutive failed probes,
 * so a single failure (e.g. one timeout during app start) does not
 * trigger the banner. Non-finite or negative values never show it.
 */
export const shouldShowLmsDownBanner = (consecutiveFailures: number): boolean =>
  Number.isFinite(consecutiveFailures) && consecutiveFailures >= LMS_DOWN_BANNER_THRESHOLD
