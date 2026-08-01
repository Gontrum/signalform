// LMS sometimes freezes at the very end of a track when the next one fails to
// buffer (e.g. Tidal format mismatch mp4 <> flc). The state below tracks how
// many consecutive polls reported the exact same position inside the end window.

const TRACK_END_WINDOW_SECONDS = 0.5;

const STALL_COUNT_THRESHOLD = 5;

// A count of 1 disappears again in the last seconds of nearly every track, so
// only counts that came close to intervening are worth reporting.
const ABANDONED_STALL_MIN_COUNT = 2;

export type TrackStallState = {
  readonly trackId: string;
  readonly stallCount: number;
  readonly lastTime: number;
};

export type StallPollSample = {
  readonly mode: "play" | "pause" | "stop";
  readonly time: number;
  readonly duration: number;
  readonly trackId?: string;
};

// A duration of 0 means LMS reported no length (e.g. a stream), so there is no
// end window to be stuck in and the detection must never arm.
const isInsideTrackEndWindow = (sample: StallPollSample): boolean =>
  sample.mode === "play" &&
  sample.duration > 0 &&
  sample.time >= sample.duration - TRACK_END_WINDOW_SECONDS;

const identifiesTrack = (trackId: string | undefined): trackId is string =>
  trackId !== undefined && trackId !== "";

// Exact equality on purpose: a frozen renderer repeats the identical value,
// while a slow drift (200 → 200.05 → 200.1) is progress and must reset the
// count. A tolerance measured against the previous poll would call that drift a
// standstill on every single poll and cut into audible music.
const isFrozenAt = (
  previous: TrackStallState,
  sample: StallPollSample,
): boolean => sample.time === previous.lastTime;

const continuesStall = (
  previous: TrackStallState | undefined,
  sample: StallPollSample,
  trackId: string,
): previous is TrackStallState =>
  previous !== undefined &&
  previous.trackId === trackId &&
  isFrozenAt(previous, sample);

export const advanceStallState = (
  previous: TrackStallState | undefined,
  sample: StallPollSample,
): TrackStallState | undefined => {
  const trackId = sample.trackId;
  if (!identifiesTrack(trackId) || !isInsideTrackEndWindow(sample)) {
    return undefined;
  }
  return {
    trackId,
    stallCount: continuesStall(previous, sample, trackId)
      ? previous.stallCount + 1
      : 1,
    lastTime: sample.time,
  };
};

export const shouldForceTrackAdvance = (
  state: TrackStallState | undefined,
): state is TrackStallState =>
  state !== undefined && state.stallCount >= STALL_COUNT_THRESHOLD;

const continuesCount = (
  previous: TrackStallState,
  next: TrackStallState | undefined,
): boolean =>
  next !== undefined &&
  next.trackId === previous.trackId &&
  next.stallCount > previous.stallCount;

/**
 * The state of a count that was running and ended without ever intervening —
 * the near miss that is otherwise invisible in the log.
 */
export const abandonedStall = (
  previous: TrackStallState | undefined,
  next: TrackStallState | undefined,
): TrackStallState | undefined =>
  previous !== undefined &&
  previous.stallCount >= ABANDONED_STALL_MIN_COUNT &&
  !shouldForceTrackAdvance(previous) &&
  !continuesCount(previous, next)
    ? previous
    : undefined;
