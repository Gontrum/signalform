import { describe, expect, test } from "vitest";
import {
  advanceStallState,
  shouldForceTrackAdvance,
  type StallPollSample,
  type TrackStallState,
} from "./stall-detection.js";

const DURATION = 200;

const playing = (
  time: number,
  overrides: Partial<StallPollSample> = {},
): StallPollSample => ({
  mode: "play",
  time,
  duration: DURATION,
  trackId: "track-a",
  ...overrides,
});

/** Replays a poll sequence and keeps every intermediate state for assertion. */
const replay = (
  samples: readonly StallPollSample[],
): ReadonlyArray<TrackStallState | undefined> =>
  samples.reduce<ReadonlyArray<TrackStallState | undefined>>(
    (states, sample) => [...states, advanceStallState(states.at(-1), sample)],
    [],
  );

const stallCounts = (
  states: ReadonlyArray<TrackStallState | undefined>,
): ReadonlyArray<number | undefined> =>
  states.map((state) => state?.stallCount);

const interventions = (
  states: ReadonlyArray<TrackStallState | undefined>,
): readonly boolean[] => states.map(shouldForceTrackAdvance);

describe("advanceStallState", () => {
  test("restarts the count on every poll that made progress at the track end", () => {
    const states = replay([
      playing(199.5),
      playing(199.75),
      playing(200),
      playing(200.25),
      playing(200.5),
      playing(200.75),
    ]);

    expect(stallCounts(states)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(interventions(states)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(states.at(-1)?.lastTime).toBe(200.75);
  });

  test("counts frozen polls up and only intervenes on the third", () => {
    const states = replay([playing(200), playing(200), playing(200)]);

    expect(stallCounts(states)).toEqual([1, 2, 3]);
    expect(interventions(states)).toEqual([false, false, true]);
  });

  test("keeps counting past the threshold while the freeze persists", () => {
    const states = replay([
      playing(200),
      playing(200),
      playing(200),
      playing(200),
    ]);

    expect(stallCounts(states)).toEqual([1, 2, 3, 4]);
    expect(interventions(states)).toEqual([false, false, true, true]);
  });

  test("restarts the count when a different track reaches its end mid-count", () => {
    const states = replay([
      playing(200),
      playing(200),
      playing(200, { trackId: "track-b" }),
      playing(200, { trackId: "track-b" }),
    ]);

    expect(stallCounts(states)).toEqual([1, 2, 1, 2]);
    expect(states[2]?.trackId).toBe("track-b");
    expect(interventions(states)).toEqual([false, false, false, false]);
  });

  test("discards the state when a seek leaves the end window", () => {
    const states = replay([
      playing(200),
      playing(200),
      playing(60),
      playing(200),
    ]);

    expect(stallCounts(states)).toEqual([1, 2, undefined, 1]);
    expect(states[2]).toBeUndefined();
    expect(interventions(states)).toEqual([false, false, false, false]);
  });

  test("treats the last half second as the end window and anything before it as not", () => {
    expect(advanceStallState(undefined, playing(199.49))).toBeUndefined();
    expect(advanceStallState(undefined, playing(199.5))?.stallCount).toBe(1);
  });

  test("discards the state while the player is paused or stopped", () => {
    const pausedRun = replay([
      playing(200),
      playing(200),
      playing(200, { mode: "pause" }),
    ]);
    const stoppedRun = replay([
      playing(200),
      playing(200),
      playing(200, { mode: "stop" }),
    ]);

    expect(stallCounts(pausedRun)).toEqual([1, 2, undefined]);
    expect(stallCounts(stoppedRun)).toEqual([1, 2, undefined]);
  });

  test("never arms for a stream whose duration is unknown", () => {
    const states = replay(
      Array.from({ length: 10 }, () => playing(3600, { duration: 0 })),
    );

    expect(states.every((state) => state === undefined)).toBe(true);
    expect(interventions(states).some(Boolean)).toBe(false);
  });

  test("never arms while no track is reported", () => {
    const states = replay([
      playing(200, { trackId: undefined }),
      playing(200, { trackId: undefined }),
      playing(200, { trackId: undefined }),
    ]);

    expect(states.every((state) => state === undefined)).toBe(true);
  });

  test("drops a count that was running when the track disappears", () => {
    const states = replay([
      playing(200),
      playing(200),
      playing(200, { trackId: undefined }),
      playing(200),
    ]);

    expect(stallCounts(states)).toEqual([1, 2, undefined, 1]);
  });

  // Pins today's tolerance: the hardening step is expected to rewrite this test.
  test("counts a 0.05s move as standing still and a 0.2s move as progress", () => {
    const barelyMoved = replay([playing(200), playing(200.05)]);
    const clearlyMoved = replay([playing(200), playing(200.2)]);

    expect(stallCounts(barelyMoved)).toEqual([1, 2]);
    expect(stallCounts(clearlyMoved)).toEqual([1, 1]);
    expect(clearlyMoved.at(-1)?.lastTime).toBe(200.2);
  });

  // Also pinned deliberately: the tolerance compares against the previous poll
  // only, so a steady sub-tolerance drift still triggers an intervention.
  test("intervenes on a drift that stays below the tolerance every single poll", () => {
    const states = replay([playing(200), playing(200.05), playing(200.1)]);

    expect(stallCounts(states)).toEqual([1, 2, 3]);
    expect(interventions(states)).toEqual([false, false, true]);
  });

  test("measures the tolerance against the previous poll, not the first", () => {
    const states = replay([playing(200), playing(200.3), playing(200.32)]);

    expect(stallCounts(states)).toEqual([1, 1, 2]);
    expect(states[1]?.lastTime).toBe(200.3);
  });
});

describe("shouldForceTrackAdvance", () => {
  test("stays quiet without state and below three consecutive stalls", () => {
    expect(shouldForceTrackAdvance(undefined)).toBe(false);
    expect(
      shouldForceTrackAdvance({ trackId: "a", stallCount: 1, lastTime: 200 }),
    ).toBe(false);
    expect(
      shouldForceTrackAdvance({ trackId: "a", stallCount: 2, lastTime: 200 }),
    ).toBe(false);
  });

  test("fires from the third consecutive stall onwards", () => {
    expect(
      shouldForceTrackAdvance({ trackId: "a", stallCount: 3, lastTime: 200 }),
    ).toBe(true);
    expect(
      shouldForceTrackAdvance({ trackId: "a", stallCount: 9, lastTime: 200 }),
    ).toBe(true);
  });
});
