import { beforeEach, describe, expect, it } from "vitest";
import type { QueueTrack } from "@signalform/shared";
import {
  annotateRadioQueueTracks,
  resetRadioRuntimeState,
  setRadioTrackSignatures,
} from "./radio-state.js";
import { getQueueTrackSignature } from "../core/identity.js";

const makeQueueTrack = (overrides: Partial<QueueTrack>): QueueTrack => ({
  id: "track-1",
  position: 1,
  title: "Two of Hearts",
  artist: "Stacey Q",
  album: "Better Than Heaven",
  duration: 240,
  isCurrent: false,
  addedBy: "user",
  source: "tidal",
  ...overrides,
});

describe("radio-state", () => {
  beforeEach(() => {
    resetRadioRuntimeState();
  });

  it("prefers the latest matching queue occurrence when radio tracks duplicate earlier songs", () => {
    const manualDuplicate = makeQueueTrack({
      id: "manual-duplicate",
      position: 5,
    });
    const radioDuplicate = makeQueueTrack({
      id: "radio-duplicate",
      position: 6,
      addedBy: "radio",
    });
    const laterRadioTrack = makeQueueTrack({
      id: "radio-later",
      position: 7,
      title: "Vogue",
      artist: "Madonna",
      album: "The Immaculate Collection",
      addedBy: "radio",
      source: "local",
    });

    setRadioTrackSignatures([
      getQueueTrackSignature(radioDuplicate),
      getQueueTrackSignature(laterRadioTrack),
    ]);

    const projection = annotateRadioQueueTracks([
      manualDuplicate,
      radioDuplicate,
      laterRadioTrack,
    ]);

    expect(projection.tracks.map((track) => track.addedBy)).toEqual([
      "user",
      "radio",
      "radio",
    ]);
    expect(projection.radioBoundaryIndex).toBe(1);
  });
});
