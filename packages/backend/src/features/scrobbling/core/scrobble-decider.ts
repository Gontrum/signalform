/**
 * Determines whether a track should be scrobbled based on Last.fm rules:
 * - Track must have played for at least 240 seconds, OR
 * - Track must have played for at least half its duration
 * - Minimum: 30 seconds must have elapsed
 */
export const shouldScrobble = ({
  elapsedSeconds,
  durationSeconds,
}: {
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
}): boolean => {
  if (elapsedSeconds < 30) {
    return false;
  }
  if (durationSeconds <= 0) {
    return elapsedSeconds >= 240;
  }
  return elapsedSeconds >= 240 || elapsedSeconds >= durationSeconds / 2;
};
