import { err, ok, type Result } from "@signalform/shared";

export type SleepDurationError = {
  readonly message: string;
};

export const MAX_SLEEP_DURATION_SECONDS = 86_400;

const describeInput = (input: unknown): string => {
  if (typeof input === "string") {
    return JSON.stringify(input);
  }
  if (typeof input === "bigint") {
    return `${input.toString()}n`;
  }
  return String(input);
};

const invalidDuration = (input: unknown): SleepDurationError => ({
  message: `Not a valid sleep duration: expected an integer between 0 and ${MAX_SLEEP_DURATION_SECONDS} seconds, got ${describeInput(input)}`,
});

/**
 * Parses a sleep-timer duration in seconds. Accepts only finite integers
 * in the range 0–86400, where 0 means "cancel the timer".
 */
export const parseSleepDuration = (
  input: unknown,
): Result<number, SleepDurationError> => {
  if (typeof input !== "number" || !Number.isInteger(input)) {
    return err(invalidDuration(input));
  }
  if (input < 0 || input > MAX_SLEEP_DURATION_SECONDS) {
    return err(invalidDuration(input));
  }
  return ok(input);
};
