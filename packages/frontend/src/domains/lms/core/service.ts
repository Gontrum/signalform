export const WAKE_THROTTLE_MS = 60_000

export const shouldTriggerWake = (lastWakeAt: number, now: number): boolean =>
  now - lastWakeAt >= WAKE_THROTTLE_MS
