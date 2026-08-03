import { describe, expect, test } from "vitest";
import {
  assessConnectivity,
  shouldProbeServer,
  type ConnectivityAnnouncement,
  type ConnectivityObservation,
  type LmsConnectivity,
} from "./lms-connectivity.js";

const STATUS_OK: ConnectivityObservation = { statusOk: true };
const SERVER_UP: ConnectivityObservation = {
  statusOk: false,
  serverReachable: true,
};
const SERVER_DOWN: ConnectivityObservation = {
  statusOk: false,
  serverReachable: false,
};
const UNPROBED: ConnectivityObservation = { statusOk: false };

describe("assessConnectivity - entering a failure", () => {
  test("classifies a failed status poll with a reachable server as the player being unreachable", () => {
    expect(assessConnectivity("healthy", SERVER_UP)).toEqual({
      state: "player-unreachable",
      announcements: ["player-status-unavailable"],
    });
  });

  test("classifies a failed status poll with an unreachable server as LMS being down", () => {
    expect(assessConnectivity("healthy", SERVER_DOWN)).toEqual({
      state: "lms-unreachable",
      announcements: ["lms-disconnected"],
    });
  });

  test("falls back to LMS being down when a first failure arrives without a probe result", () => {
    expect(assessConnectivity("healthy", UNPROBED)).toEqual({
      state: "lms-unreachable",
      announcements: ["lms-disconnected"],
    });
  });
});

describe("assessConnectivity - staying put", () => {
  test("announces nothing while everything keeps working", () => {
    expect(assessConnectivity("healthy", STATUS_OK)).toEqual({
      state: "healthy",
      announcements: [],
    });
  });

  test("keeps an unprobed player failure classified as a player failure, silently", () => {
    expect(assessConnectivity("player-unreachable", UNPROBED)).toEqual({
      state: "player-unreachable",
      announcements: [],
    });
  });

  test("keeps an unprobed LMS failure classified as an LMS failure, silently", () => {
    expect(assessConnectivity("lms-unreachable", UNPROBED)).toEqual({
      state: "lms-unreachable",
      announcements: [],
    });
  });

  test("repeats no announcement when a probed failure confirms the state already held", () => {
    expect(assessConnectivity("player-unreachable", SERVER_UP)).toEqual({
      state: "player-unreachable",
      announcements: [],
    });
    expect(assessConnectivity("lms-unreachable", SERVER_DOWN)).toEqual({
      state: "lms-unreachable",
      announcements: [],
    });
  });
});

describe("assessConnectivity - coming back", () => {
  test("retracts the player message when the status poll succeeds again", () => {
    expect(assessConnectivity("player-unreachable", STATUS_OK)).toEqual({
      state: "healthy",
      announcements: ["player-status-restored"],
    });
  });

  test("retracts the LMS message when the status poll succeeds again", () => {
    expect(assessConnectivity("lms-unreachable", STATUS_OK)).toEqual({
      state: "healthy",
      announcements: ["lms-reconnected"],
    });
  });
});

describe("assessConnectivity - swapping one failure for the other", () => {
  test("retracts the player message before announcing the LMS one when the server dies too", () => {
    expect(assessConnectivity("player-unreachable", SERVER_DOWN)).toEqual({
      state: "lms-unreachable",
      announcements: ["player-status-restored", "lms-disconnected"],
    });
  });

  test("retracts the LMS message before announcing the player one when only the player stays away", () => {
    expect(assessConnectivity("lms-unreachable", SERVER_UP)).toEqual({
      state: "player-unreachable",
      announcements: ["lms-reconnected", "player-status-unavailable"],
    });
  });
});

const foldObservations = (
  observations: readonly ConnectivityObservation[],
): {
  readonly state: LmsConnectivity;
  readonly announcements: readonly ConnectivityAnnouncement[];
} =>
  observations.reduce<{
    readonly state: LmsConnectivity;
    readonly announcements: readonly ConnectivityAnnouncement[];
  }>(
    (carried, observation) => {
      const transition = assessConnectivity(carried.state, observation);
      return {
        state: transition.state,
        announcements: [...carried.announcements, ...transition.announcements],
      };
    },
    { state: "healthy", announcements: [] },
  );

describe("assessConnectivity - full round trip", () => {
  test("announces every condition it opens and closes exactly once across player → LMS → player → healthy", () => {
    const result = foldObservations([
      STATUS_OK,
      SERVER_UP,
      UNPROBED,
      SERVER_DOWN,
      UNPROBED,
      SERVER_UP,
      STATUS_OK,
      STATUS_OK,
    ]);

    expect(result.state).toBe("healthy");
    expect(result.announcements).toEqual([
      "player-status-unavailable",
      "player-status-restored",
      "lms-disconnected",
      "lms-reconnected",
      "player-status-unavailable",
      "player-status-restored",
    ]);
  });

  test("leaves no message standing when a player failure ends as an LMS failure that later recovers", () => {
    const result = foldObservations([SERVER_UP, SERVER_DOWN, STATUS_OK]);

    expect(result.state).toBe("healthy");
    expect(result.announcements).toEqual([
      "player-status-unavailable",
      "player-status-restored",
      "lms-disconnected",
      "lms-reconnected",
    ]);
  });
});

describe("shouldProbeServer", () => {
  test("probes on the edge from working into failing", () => {
    expect(shouldProbeServer("healthy", false)).toBe(true);
  });

  test("does not probe while a failure is already classified", () => {
    expect(shouldProbeServer("player-unreachable", false)).toBe(false);
    expect(shouldProbeServer("lms-unreachable", false)).toBe(false);
  });

  test("never probes on a successful status poll", () => {
    expect(shouldProbeServer("healthy", true)).toBe(false);
    expect(shouldProbeServer("player-unreachable", true)).toBe(false);
    expect(shouldProbeServer("lms-unreachable", true)).toBe(false);
  });
});
