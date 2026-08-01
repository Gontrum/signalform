import { describe, expect, it } from "vitest";
import { nextRepeatMode, nextShuffleMode } from "./playbackModes.js";
import type { RepeatMode, ShuffleMode } from "./types/playback.js";

type ShuffleStep = readonly [ShuffleMode, ShuffleMode];
type RepeatStep = readonly [RepeatMode, RepeatMode];

// Record keys are type-enforced: a new union member breaks compilation here
// before it can slip past the tables below untested.
const EVERY_SHUFFLE_MODE: Readonly<Record<ShuffleMode, true>> = {
  albums: true,
  off: true,
  songs: true,
};

const EVERY_REPEAT_MODE: Readonly<Record<RepeatMode, true>> = {
  playlist: true,
  off: true,
  track: true,
};

// Written out, deliberately not in cycle order, so a broken cycle cannot pass
// by coincidence of the fixture order.
const SHUFFLE_STEPS: readonly ShuffleStep[] = [
  ["albums", "off"],
  ["off", "songs"],
  ["songs", "albums"],
];

const REPEAT_STEPS: readonly RepeatStep[] = [
  ["track", "off"],
  ["playlist", "track"],
  ["off", "playlist"],
];

const sorted = (values: readonly string[]): readonly string[] =>
  [...values].sort();

describe("nextShuffleMode", () => {
  it.each(SHUFFLE_STEPS)("advances %s to %s", (current, expected) => {
    expect(nextShuffleMode(current)).toBe(expected);
  });

  it("walks off, songs, albums and back to off", () => {
    const afterFirst = nextShuffleMode("off");
    const afterSecond = nextShuffleMode(afterFirst);
    const afterThird = nextShuffleMode(afterSecond);

    expect(afterFirst).toBe("songs");
    expect(afterSecond).toBe("albums");
    expect(afterThird).toBe("off");
  });

  it.each(SHUFFLE_STEPS)(
    "returns to %s after three presses",
    (current: ShuffleMode) => {
      expect(nextShuffleMode(nextShuffleMode(nextShuffleMode(current)))).toBe(
        current,
      );
    },
  );

  it("gives every mode of the union a successor inside the union", () => {
    const covered = SHUFFLE_STEPS.map(([current]) => current);
    expect(sorted(covered)).toEqual(sorted(Object.keys(EVERY_SHUFFLE_MODE)));

    const successors = covered.map(nextShuffleMode);
    expect(successors.filter((mode) => mode === undefined)).toEqual([]);
    expect(sorted(successors)).toEqual(sorted(Object.keys(EVERY_SHUFFLE_MODE)));
  });

  it("advances a mode the buttons never produced themselves", () => {
    // Another LMS client can leave the player on album shuffle without our UI
    // ever having stepped through it.
    expect(nextShuffleMode("albums")).toBe("off");
  });
});

describe("nextRepeatMode", () => {
  it.each(REPEAT_STEPS)("advances %s to %s", (current, expected) => {
    expect(nextRepeatMode(current)).toBe(expected);
  });

  it("walks off, playlist, track and back to off", () => {
    const afterFirst = nextRepeatMode("off");
    const afterSecond = nextRepeatMode(afterFirst);
    const afterThird = nextRepeatMode(afterSecond);

    expect(afterFirst).toBe("playlist");
    expect(afterSecond).toBe("track");
    expect(afterThird).toBe("off");
  });

  it("repeats the whole playlist before a single track", () => {
    expect(nextRepeatMode("off")).toBe("playlist");
    expect(nextRepeatMode("off")).not.toBe("track");
  });

  it.each(REPEAT_STEPS)(
    "returns to %s after three presses",
    (current: RepeatMode) => {
      expect(nextRepeatMode(nextRepeatMode(nextRepeatMode(current)))).toBe(
        current,
      );
    },
  );

  it("gives every mode of the union a successor inside the union", () => {
    const covered = REPEAT_STEPS.map(([current]) => current);
    expect(sorted(covered)).toEqual(sorted(Object.keys(EVERY_REPEAT_MODE)));

    const successors = covered.map(nextRepeatMode);
    expect(successors.filter((mode) => mode === undefined)).toEqual([]);
    expect(sorted(successors)).toEqual(sorted(Object.keys(EVERY_REPEAT_MODE)));
  });

  it("advances a mode the buttons never produced themselves", () => {
    expect(nextRepeatMode("track")).toBe("off");
  });
});
