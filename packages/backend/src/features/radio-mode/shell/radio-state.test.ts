import { beforeEach, describe, expect, it } from "vitest";
import type { QueueTrack } from "@signalform/shared";
import {
  annotateRadioQueueTracks,
  recordExplicitRadioTracks,
  resetRadioRuntimeState,
  setRadioQueueEntries,
} from "./radio-state.js";
import {
  getQueueTrackRepeatKey,
  getQueueTrackSignature,
} from "../core/identity.js";

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

    setRadioQueueEntries([
      {
        position: radioDuplicate.position,
        repeatKey: getQueueTrackRepeatKey(radioDuplicate),
        signature: getQueueTrackSignature(radioDuplicate),
      },
      {
        position: laterRadioTrack.position,
        repeatKey: getQueueTrackRepeatKey(laterRadioTrack),
        signature: getQueueTrackSignature(laterRadioTrack),
      },
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

  it("does not double-count surviving radio tracks when queue-remove replenishment appends explicit radio tracks", () => {
    const manualDuplicate = makeQueueTrack({
      id: "duplicate-track",
      position: 1,
    });
    const survivingRadioDuplicate = makeQueueTrack({
      id: "duplicate-track",
      position: 2,
      addedBy: "radio",
    });
    const appendedRadioTrack = makeQueueTrack({
      id: "appended-radio-track",
      position: 3,
      title: "Vogue",
      artist: "Madonna",
      album: "The Immaculate Collection",
      addedBy: "radio",
      source: "local",
    });

    setRadioQueueEntries([
      {
        position: 2,
        repeatKey: getQueueTrackRepeatKey(survivingRadioDuplicate),
        signature: getQueueTrackSignature(survivingRadioDuplicate),
      },
    ]);

    const projection = recordExplicitRadioTracks(
      [manualDuplicate, survivingRadioDuplicate, appendedRadioTrack],
      [getQueueTrackRepeatKey(appendedRadioTrack)],
    );

    expect(projection.tracks.map((track) => track.addedBy)).toEqual([
      "user",
      "radio",
      "radio",
    ]);
    expect(projection.radioBoundaryIndex).toBe(1);
  });

  it("keeps radio provenance when LMS metadata drifts between snapshots", () => {
    const originalRadioTrack = makeQueueTrack({
      id: "radio-track",
      position: 2,
      addedBy: "radio",
      source: "tidal",
      album: "Better Than Heaven",
    });

    setRadioQueueEntries([
      {
        position: originalRadioTrack.position,
        repeatKey: getQueueTrackRepeatKey(originalRadioTrack),
        signature: getQueueTrackSignature(originalRadioTrack),
      },
    ]);

    const projection = annotateRadioQueueTracks([
      makeQueueTrack({
        id: "manual-track",
        position: 1,
      }),
      makeQueueTrack({
        id: "lms-drifted-track",
        position: 2,
        album: "Better Than Heaven (Deluxe)",
        source: "local",
      }),
    ]);

    expect(projection.tracks.map((track) => track.addedBy)).toEqual([
      "user",
      "radio",
    ]);
    expect(projection.radioBoundaryIndex).toBe(1);
  });

  it("marks only explicit radio additions when manual tracks are appended concurrently", () => {
    const firstUserTrack = makeQueueTrack({
      id: "user-track-1",
      position: 1,
      title: "Drowned World",
      artist: "Madonna",
      album: "Ray of Light",
    });
    const secondUserTrack = makeQueueTrack({
      id: "user-track-2",
      position: 2,
      title: "Ray of Light",
      artist: "Madonna",
      album: "Ray of Light",
    });
    const concurrentManualTrack = makeQueueTrack({
      id: "manual-track-3",
      position: 3,
      title: "Skin",
      artist: "Madonna",
      album: "Veronica Electronica",
      source: "local",
    });
    const radioTrack = makeQueueTrack({
      id: "radio-track-4",
      position: 4,
      title: "Message in a Bottle",
      artist: "The Police",
      album: "Reggatta de Blanc",
      addedBy: "radio",
      source: "tidal",
    });

    const projection = recordExplicitRadioTracks(
      [firstUserTrack, secondUserTrack, concurrentManualTrack, radioTrack],
      [getQueueTrackRepeatKey(radioTrack)],
    );

    expect(projection.tracks.map((track) => track.addedBy)).toEqual([
      "user",
      "user",
      "user",
      "radio",
    ]);
    expect(projection.radioBoundaryIndex).toBe(3);
  });
});
