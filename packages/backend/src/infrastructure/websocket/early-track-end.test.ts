import { describe, expect, test } from "vitest";
import {
  assessTrackEnd,
  type EarlyTrackEnd,
  type TrackEndSample,
  type TrackEndVerdict,
} from "./early-track-end.js";

const DURATION = 240;

// Pins the window the implementation promises: a command 5s before the poll
// still explains the change, 5.001s before it no longer does.
const WINDOW_MS = 5000;
const NOW_MS = 1_700_000_000_000;

const playing = (
  time: number,
  overrides: Partial<TrackEndSample> = {},
): TrackEndSample => ({
  mode: "play",
  time,
  duration: DURATION,
  trackId: "track-a",
  ...overrides,
});

const nextTrack = (overrides: Partial<TrackEndSample> = {}): TrackEndSample =>
  playing(0, { trackId: "track-b", ...overrides });

const stopped = (overrides: Partial<TrackEndSample> = {}): TrackEndSample =>
  playing(0, { mode: "stop", ...overrides });

/** Assessment with no user command on record. */
const assess = (
  previous: TrackEndSample | undefined,
  current: TrackEndSample,
): TrackEndVerdict => assessTrackEnd(previous, current, { nowMs: NOW_MS });

/** Assessment with a user command issued `agoMs` before this poll. */
const assessAfterCommand = (
  previous: TrackEndSample | undefined,
  current: TrackEndSample,
  agoMs: number,
): TrackEndVerdict =>
  assessTrackEnd(previous, current, {
    nowMs: NOW_MS,
    lastCommandAtMs: NOW_MS - agoMs,
  });

const incidentOf = (verdict: TrackEndVerdict): EarlyTrackEnd | undefined =>
  verdict.kind === "no-incident" ? undefined : verdict.incident;

describe("assessTrackEnd — the incident itself", () => {
  test("reports the abandoned track with its position and remaining time", () => {
    expect(assess(playing(120), nextTrack())).toEqual({
      kind: "incident",
      incident: {
        previousTrackId: "track-a",
        time: 120,
        duration: DURATION,
        remainingSeconds: 120,
        nextTrackId: "track-b",
      },
    });
  });

  test("computes the remaining time from the abandoned track, not the new one", () => {
    const incident = incidentOf(
      assess(
        playing(30, { duration: 190 }),
        nextTrack({ time: 5, duration: 1000 }),
      ),
    );

    expect(incident?.remainingSeconds).toBe(160);
    expect(incident?.duration).toBe(190);
    expect(incident?.time).toBe(30);
  });

  test("stays silent at a regular track end a poll or two short of the duration", () => {
    expect(assess(playing(DURATION - 1), nextTrack()).kind).toBe("no-incident");
    expect(assess(playing(DURATION - 2), nextTrack()).kind).toBe("no-incident");
    expect(assess(playing(DURATION), nextTrack()).kind).toBe("no-incident");
    expect(assess(playing(DURATION + 0.5), nextTrack()).kind).toBe(
      "no-incident",
    );
  });

  test("needs more than ten seconds left, so exactly ten is still a regular end", () => {
    expect(assess(playing(DURATION - 10), nextTrack()).kind).toBe(
      "no-incident",
    );
    expect(
      incidentOf(assess(playing(DURATION - 10.5), nextTrack()))
        ?.remainingSeconds,
    ).toBe(10.5);
  });

  test("stays silent for a track change out of pause or stop", () => {
    expect(assess(playing(12, { mode: "pause" }), nextTrack()).kind).toBe(
      "no-incident",
    );
    expect(assess(playing(12, { mode: "stop" }), nextTrack()).kind).toBe(
      "no-incident",
    );
  });

  test("stays silent when the abandoned track reports no length", () => {
    expect(assess(playing(3600, { duration: 0 }), nextTrack()).kind).toBe(
      "no-incident",
    );
    expect(
      assess(playing(3600, { duration: undefined }), nextTrack()).kind,
    ).toBe("no-incident");
  });

  test("stays silent while the same track keeps playing", () => {
    expect(assess(playing(10), playing(11)).kind).toBe("no-incident");
  });

  test("stays silent on the very first poll", () => {
    expect(assess(undefined, nextTrack()).kind).toBe("no-incident");
  });

  test("stays silent when either poll reports no track at all", () => {
    expect(assess(playing(12, { trackId: undefined }), nextTrack()).kind).toBe(
      "no-incident",
    );
    expect(assess(playing(12), nextTrack({ trackId: undefined })).kind).toBe(
      "no-incident",
    );
    expect(assess(playing(12), nextTrack({ trackId: "" })).kind).toBe(
      "no-incident",
    );
  });
});

describe("assessTrackEnd — a user command explains the same observation", () => {
  test("keeps the incident but marks it explained when a command came just before", () => {
    const verdict = assessAfterCommand(playing(120), nextTrack(), 1200);

    expect(verdict).toEqual({
      kind: "user-command",
      incident: {
        previousTrackId: "track-a",
        time: 120,
        duration: DURATION,
        remainingSeconds: 120,
        nextTrackId: "track-b",
      },
    });
  });

  test("tells all three outcomes apart for the very same poll pair", () => {
    const kinds = [
      assess(playing(120), nextTrack()).kind,
      assessAfterCommand(playing(120), nextTrack(), 1200).kind,
      assess(playing(DURATION - 1), nextTrack()).kind,
    ];

    expect(kinds).toEqual(["incident", "user-command", "no-incident"]);
  });

  test("counts as an incident again once the command is older than the window", () => {
    expect(assessAfterCommand(playing(120), nextTrack(), 30_000).kind).toBe(
      "incident",
    );
  });

  test("still explains a command exactly on the window edge, but not a millisecond past it", () => {
    expect(assessAfterCommand(playing(120), nextTrack(), WINDOW_MS).kind).toBe(
      "user-command",
    );
    expect(
      assessAfterCommand(playing(120), nextTrack(), WINDOW_MS + 1).kind,
    ).toBe("incident");
  });

  test("does not invent an incident out of a user command alone", () => {
    expect(
      assessAfterCommand(playing(DURATION - 1), nextTrack(), 1200).kind,
    ).toBe("no-incident");
  });
});

describe("assessTrackEnd — breaking off into a standstill", () => {
  test("counts a stop with time left, and reports no successor", () => {
    expect(assess(playing(60), stopped())).toEqual({
      kind: "incident",
      incident: {
        previousTrackId: "track-a",
        time: 60,
        duration: DURATION,
        remainingSeconds: 180,
        nextTrackId: undefined,
      },
    });
  });

  test("names the successor when playback stops on a different track", () => {
    expect(
      incidentOf(assess(playing(60), stopped({ trackId: "track-b" })))
        ?.nextTrackId,
    ).toBe("track-b");
  });

  test("stays silent when the queue simply runs out at the end of a track", () => {
    expect(assess(playing(DURATION - 2), stopped()).kind).toBe("no-incident");
  });

  test("treats a pressed stop as explained, like any other user command", () => {
    expect(assessAfterCommand(playing(60), stopped(), 900).kind).toBe(
      "user-command",
    );
  });
});
