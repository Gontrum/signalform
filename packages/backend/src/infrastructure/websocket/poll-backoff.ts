const FIRST_FAILURE_DELAY_MS = 5_000;

// A sleeping LMS woken by magic packet (POST /api/lms/wake) takes considerably
// longer than 30s to boot, so capping here costs no perceived reconnect delay —
// the detection lag stays inside the boot time.
const SUSTAINED_FAILURE_DELAY_MS = 30_000;

const SUSTAINED_FAILURE_THRESHOLD = 3;

export const nextPollDelayMs = (
  intervalMs: number,
  consecutiveFailures: number,
): number =>
  consecutiveFailures <= 0
    ? intervalMs
    : consecutiveFailures < SUSTAINED_FAILURE_THRESHOLD
      ? FIRST_FAILURE_DELAY_MS
      : SUSTAINED_FAILURE_DELAY_MS;
