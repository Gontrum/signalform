// Separates the two failures a failed status poll used to collapse into one:
// LMS itself being unreachable, and LMS answering fine while the player it is
// asked about does not. Measured on LMS 9.1.1: a disconnected player makes
// ["status", …] block until the timeout while the server keeps answering
// ["serverstatus", …] instantly — so a failed status poll alone says nothing
// about the server.

export type LmsConnectivity =
  "healthy" | "player-unreachable" | "lms-unreachable";

export type ConnectivityAnnouncement =
  | "lms-disconnected"
  | "lms-reconnected"
  | "player-status-unavailable"
  | "player-status-restored";

export type ConnectivityObservation =
  | { readonly statusOk: true }
  | {
      readonly statusOk: false;
      // Absent when the server was not probed on this poll — see
      // shouldProbeServer.
      readonly serverReachable?: boolean;
    };

export type ConnectivityTransition = {
  readonly state: LmsConnectivity;
  readonly announcements: readonly ConnectivityAnnouncement[];
};

// The probe costs a request in exactly the situation the backoff exists to calm
// down, so it runs only on the edge into failure — while a failure persists the
// classification made on that edge is carried forward unchanged.
export const shouldProbeServer = (
  previous: LmsConnectivity,
  statusOk: boolean,
): boolean => !statusOk && previous === "healthy";

const ENDED: Readonly<
  Record<LmsConnectivity, ConnectivityAnnouncement | undefined>
> = {
  healthy: undefined,
  "player-unreachable": "player-status-restored",
  "lms-unreachable": "lms-reconnected",
};

const STARTED: Readonly<
  Record<LmsConnectivity, ConnectivityAnnouncement | undefined>
> = {
  healthy: undefined,
  "player-unreachable": "player-status-unavailable",
  "lms-unreachable": "lms-disconnected",
};

const isAnnouncement = (
  candidate: ConnectivityAnnouncement | undefined,
): candidate is ConnectivityAnnouncement => candidate !== undefined;

// Every change closes the condition it leaves before opening the one it enters:
// going straight from "player gone" to "server gone" must still retract the
// player message, or a listener that only tracks the pairs stays stuck on it.
const announcementsFor = (
  previous: LmsConnectivity,
  next: LmsConnectivity,
): readonly ConnectivityAnnouncement[] =>
  previous === next
    ? []
    : [ENDED[previous], STARTED[next]].filter(isAnnouncement);

const failureState = (
  previous: LmsConnectivity,
  serverReachable: boolean | undefined,
): LmsConnectivity => {
  if (serverReachable === undefined) {
    // Unprobed failure: keep a failure already classified, and fall back to the
    // pessimistic reading when there is none to keep.
    return previous === "healthy" ? "lms-unreachable" : previous;
  }
  return serverReachable ? "player-unreachable" : "lms-unreachable";
};

/**
 * Folds one poll observation into the connectivity state and says which
 * transitions have to be announced — none when nothing changed.
 */
export const assessConnectivity = (
  previous: LmsConnectivity,
  observation: ConnectivityObservation,
): ConnectivityTransition => {
  const state = observation.statusOk
    ? "healthy"
    : failureState(previous, observation.serverReachable);

  return { state, announcements: announcementsFor(previous, state) };
};
