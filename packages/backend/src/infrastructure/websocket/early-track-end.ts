// Measures the reported symptom: a track that stops mid-playback, whether the
// next one starts or playback simply halts. Says nothing about the cause —
// Signalform, LMS and the UPnPBridge all produce the same observation from the
// poller's seat. The one cause it does separate out is the user: a transport
// command recorded just before the change explains the same observation.

// A track that ends normally is last seen one or two polls short of its
// duration, and the poller runs once a second — so anything up to a few seconds
// of remaining time is a regular end. 10s sits far above that spread and far
// below any cut-off a listener would complain about.
const EARLY_END_REMAINING_SECONDS = 10;

// The command still has to reach LMS, LMS has to act on it, and only the next
// poll one second later can see the result — with a UPnPBridge speaker in
// between, that chain runs into seconds. 5s covers it with headroom while
// staying short enough that a spontaneous cut-off is unlikely to land inside
// it; anything that does is still counted, just on the explained side.
const USER_COMMAND_WINDOW_MS = 5000;

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
  // Absent when playback stopped instead of moving on — same symptom, no successor.
  readonly nextTrackId?: string;
};

export type UserCommandClock = {
  readonly nowMs: number;
  readonly lastCommandAtMs?: number;
};

export type TrackEndVerdict =
  | { readonly kind: "no-incident" }
  | { readonly kind: "incident"; readonly incident: EarlyTrackEnd }
  | { readonly kind: "user-command"; readonly incident: EarlyTrackEnd };

const NO_INCIDENT: TrackEndVerdict = { kind: "no-incident" };

const identifiesTrack = (trackId: string | undefined): trackId is string =>
  trackId !== undefined && trackId !== "";

// Without a length there is no "too early" to decide, so a stream that reports
// no duration must never produce a warning.
const knownDuration = (duration: number | undefined): duration is number =>
  duration !== undefined && duration > 0;

const successorTrackId = (
  previousTrackId: string,
  current: TrackEndSample,
): string | undefined =>
  identifiesTrack(current.trackId) && current.trackId !== previousTrackId
    ? current.trackId
    : undefined;

const leftPlayingTrack = (
  previousTrackId: string,
  current: TrackEndSample,
): boolean =>
  current.mode === "stop" ||
  successorTrackId(previousTrackId, current) !== undefined;

const detectEarlyTrackEnd = (
  previous: TrackEndSample | undefined,
  current: TrackEndSample,
): EarlyTrackEnd | undefined => {
  // A track change out of pause or stop is a user action, not a cut-off.
  if (previous === undefined || previous.mode !== "play") {
    return undefined;
  }
  const previousTrackId = previous.trackId;
  if (
    !identifiesTrack(previousTrackId) ||
    !knownDuration(previous.duration) ||
    !leftPlayingTrack(previousTrackId, current)
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
        nextTrackId: successorTrackId(previousTrackId, current),
      }
    : undefined;
};

const explainedByUserCommand = ({
  nowMs,
  lastCommandAtMs,
}: UserCommandClock): boolean =>
  lastCommandAtMs !== undefined &&
  nowMs - lastCommandAtMs <= USER_COMMAND_WINDOW_MS;

/**
 * Three-way verdict on a pair of consecutive polls: the incident described as
 * "the track breaks off with time left", the same observation explained by a
 * transport command the user issued moments earlier, or neither.
 *
 * The explained case is deliberately still an `EarlyTrackEnd` — it is counted
 * too, otherwise a silent metric cannot be told apart from one that filters
 * everything away.
 */
export const assessTrackEnd = (
  previous: TrackEndSample | undefined,
  current: TrackEndSample,
  userCommand: UserCommandClock,
): TrackEndVerdict => {
  const incident = detectEarlyTrackEnd(previous, current);
  if (incident === undefined) {
    return NO_INCIDENT;
  }
  return explainedByUserCommand(userCommand)
    ? { kind: "user-command", incident }
    : { kind: "incident", incident };
};
