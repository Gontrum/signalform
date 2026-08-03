import { describe, expect, test } from "vitest";
import { detectEarlyTrackEnd, type TrackEndSample } from "./early-track-end.js";

const DURATION = 240;

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

describe("detectEarlyTrackEnd", () => {
  test("reports the abandoned track with its position and remaining time", () => {
    expect(detectEarlyTrackEnd(playing(120), nextTrack())).toEqual({
      previousTrackId: "track-a",
      time: 120,
      duration: DURATION,
      remainingSeconds: 120,
      nextTrackId: "track-b",
    });
  });

  test("computes the remaining time from the abandoned track, not the new one", () => {
    const incident = detectEarlyTrackEnd(
      playing(30, { duration: 190 }),
      nextTrack({ time: 5, duration: 1000 }),
    );

    expect(incident?.remainingSeconds).toBe(160);
    expect(incident?.duration).toBe(190);
    expect(incident?.time).toBe(30);
  });

  test("stays silent at a regular track end a poll or two short of the duration", () => {
    expect(
      detectEarlyTrackEnd(playing(DURATION - 1), nextTrack()),
    ).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(DURATION - 2), nextTrack()),
    ).toBeUndefined();
    expect(detectEarlyTrackEnd(playing(DURATION), nextTrack())).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(DURATION + 0.5), nextTrack()),
    ).toBeUndefined();
  });

  test("needs more than ten seconds left, so exactly ten is still a regular end", () => {
    expect(
      detectEarlyTrackEnd(playing(DURATION - 10), nextTrack()),
    ).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(DURATION - 10.5), nextTrack())
        ?.remainingSeconds,
    ).toBe(10.5);
  });

  test("stays silent for a track change out of pause or stop", () => {
    expect(
      detectEarlyTrackEnd(playing(12, { mode: "pause" }), nextTrack()),
    ).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(12, { mode: "stop" }), nextTrack()),
    ).toBeUndefined();
  });

  test("stays silent when the abandoned track reports no length", () => {
    expect(
      detectEarlyTrackEnd(playing(3600, { duration: 0 }), nextTrack()),
    ).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(3600, { duration: undefined }), nextTrack()),
    ).toBeUndefined();
  });

  test("stays silent while the same track keeps playing", () => {
    expect(detectEarlyTrackEnd(playing(10), playing(11))).toBeUndefined();
  });

  test("stays silent on the very first poll", () => {
    expect(detectEarlyTrackEnd(undefined, nextTrack())).toBeUndefined();
  });

  test("stays silent when either poll reports no track at all", () => {
    expect(
      detectEarlyTrackEnd(playing(12, { trackId: undefined }), nextTrack()),
    ).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(12), nextTrack({ trackId: undefined })),
    ).toBeUndefined();
    expect(
      detectEarlyTrackEnd(playing(12), nextTrack({ trackId: "" })),
    ).toBeUndefined();
  });
});
