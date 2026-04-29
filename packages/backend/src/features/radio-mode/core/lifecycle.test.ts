import { describe, expect, it } from "vitest";
import type { QueueTrack } from "@signalform/shared";
import type { RadioQueueEntry } from "./provenance.js";
import { getQueueTrackRepeatKey, getQueueTrackSignature } from "./identity.js";
import { getUpcomingRadioRemovalIndexes } from "./lifecycle.js";

const makeTrack = (overrides: Partial<QueueTrack> = {}): QueueTrack => ({
  id: "track-1",
  position: 1,
  title: "Track",
  artist: "Artist",
  album: "Album",
  duration: 180,
  isCurrent: false,
  addedBy: "user",
  ...overrides,
});

const makeEntry = (track: QueueTrack): RadioQueueEntry => ({
  position: track.position,
  repeatKey: getQueueTrackRepeatKey(track),
  signature: getQueueTrackSignature(track),
});

describe("getUpcomingRadioRemovalIndexes", () => {
  it("returns descending indexes for upcoming radio tracks only", () => {
    const tracks = [
      makeTrack({ id: "history-radio", position: 1 }),
      makeTrack({ id: "current-user", position: 2, isCurrent: true }),
      makeTrack({ id: "radio-1", position: 3 }),
      makeTrack({ id: "user-2", position: 4 }),
      makeTrack({ id: "radio-2", position: 5 }),
    ];

    expect(
      getUpcomingRadioRemovalIndexes(tracks, [
        makeEntry(tracks[0]!),
        makeEntry(tracks[2]!),
        makeEntry(tracks[4]!),
      ]),
    ).toEqual([4, 2]);
  });

  it("keeps the current radio track in place", () => {
    const tracks = [
      makeTrack({ id: "user-1", position: 1 }),
      makeTrack({ id: "radio-current", position: 2, isCurrent: true }),
      makeTrack({ id: "radio-next", position: 3 }),
    ];

    expect(
      getUpcomingRadioRemovalIndexes(tracks, [
        makeEntry(tracks[1]!),
        makeEntry(tracks[2]!),
      ]),
    ).toEqual([2]);
  });

  it("removes all tracked radio entries when there is no current track", () => {
    const tracks = [
      makeTrack({ id: "user-1", position: 1 }),
      makeTrack({ id: "radio-1", position: 2 }),
      makeTrack({ id: "radio-2", position: 3 }),
    ];

    expect(
      getUpcomingRadioRemovalIndexes(tracks, [
        makeEntry(tracks[1]!),
        makeEntry(tracks[2]!),
      ]),
    ).toEqual([2, 1]);
  });
});
