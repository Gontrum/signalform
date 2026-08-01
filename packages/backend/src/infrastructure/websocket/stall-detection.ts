// LMS sometimes freezes at the very end of a track when the next one fails to
// buffer (e.g. Tidal format mismatch mp4 <> flc). The state below tracks how
// many consecutive polls reported the same position inside the end window.

const TRACK_END_WINDOW_SECONDS = 0.5;

const PROGRESS_TOLERANCE_SECONDS = 0.1;

const STALL_COUNT_THRESHOLD = 3;

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

const madeNoProgress = (
  previous: TrackStallState,
  sample: StallPollSample,
): boolean =>
  Math.abs(sample.time - previous.lastTime) < PROGRESS_TOLERANCE_SECONDS;

const continuesStall = (
  previous: TrackStallState | undefined,
  sample: StallPollSample,
  trackId: string,
): previous is TrackStallState =>
  previous !== undefined &&
  previous.trackId === trackId &&
  madeNoProgress(previous, sample);

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
