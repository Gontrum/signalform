// Measures the reported symptom: a track that stops mid-playback while the next
// one starts. Says nothing about the cause — Signalform, LMS and the UPnPBridge
// all produce the same observation from the poller's seat.

// A track that ends normally is last seen one or two polls short of its
// duration, and the poller runs once a second — so anything up to a few seconds
// of remaining time is a regular end. 10s sits far above that spread and far
// below any cut-off a listener would complain about.
const EARLY_END_REMAINING_SECONDS = 10;

export type TrackEndSample = {
  readonly mode: "play" | "pause" | "stop";
  readonly time: number;
  readonly duration?: number;
  readonly trackId?: string;
};

export type EarlyTrackEnd = {
  readonly previousTrackId: string;
  readonly time: number;
  readonly duration: number;
  readonly remainingSeconds: number;
  readonly nextTrackId: string;
};

const identifiesTrack = (trackId: string | undefined): trackId is string =>
  trackId !== undefined && trackId !== "";

// Without a length there is no "too early" to decide, so a stream that reports
// no duration must never produce a warning.
const knownDuration = (duration: number | undefined): duration is number =>
  duration !== undefined && duration > 0;

/**
 * The incident described as "the track breaks off and the next one starts too
 * early", or undefined if this poll pair does not show it.
 *
 * A user pressing skip mid-track looks exactly the same from here and cannot be
 * told apart with what the poller sees — this is a symptom counter, not proof
 * of a fault.
 */
export const detectEarlyTrackEnd = (
  previous: TrackEndSample | undefined,
  current: TrackEndSample,
): EarlyTrackEnd | undefined => {
  // A track change out of pause or stop is a user action, not a cut-off.
  if (previous === undefined || previous.mode !== "play") {
    return undefined;
  }
  const previousTrackId = previous.trackId;
  const nextTrackId = current.trackId;
  if (
    !identifiesTrack(previousTrackId) ||
    !identifiesTrack(nextTrackId) ||
    previousTrackId === nextTrackId ||
    !knownDuration(previous.duration)
  ) {
    return undefined;
  }
  const remainingSeconds = previous.duration - previous.time;
  return remainingSeconds > EARLY_END_REMAINING_SECONDS
    ? {
        previousTrackId,
        time: previous.time,
        duration: previous.duration,
        remainingSeconds,
        nextTrackId,
      }
    : undefined;
};
