import { describe, expect, test } from "vitest";
import type { LmsPlayerStatus } from "./handlers.js";
import {
  getRadioQueueState,
  reconcileSuppressedQueueEnd,
  resetRadioRuntimeState,
  setSuppressedQueueEnd,
} from "../../features/radio-mode/shell/radio-state.js";

const makeStatus = (
  overrides: Partial<LmsPlayerStatus> = {},
): LmsPlayerStatus => ({
  playerId: "player-1",
  mode: "play",
  volume: 50,
  time: 0,
  ...overrides,
});

describe("reconcileSuppressedQueueEnd", () => {
  test("clears suppression when the queue grows again after being drained", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
    const previousStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [
        { id: "2", title: "Freddie Freeloader", artist: "Miles Davis" },
      ],
    });
    const currentStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toEqual({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
  });

  test("keeps suppression through the initial non-empty to empty drain transition", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
    const previousStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });
    const currentStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [
        { id: "3", title: "Blue in Green", artist: "Miles Davis" },
      ],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toBeUndefined();
  });

  test("clears suppression when a new playback session starts later", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "99",
      artist: "Bill Evans",
      title: "Autumn Leaves",
    });
    const previousStatus = makeStatus({
      mode: "stop",
      currentTrack: undefined,
      queuePreview: [],
    });
    const currentStatus = makeStatus({
      mode: "play",
      currentTrack: {
        id: "99",
        title: "Autumn Leaves",
        artist: "Bill Evans",
        album: "Portrait in Jazz",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toBeUndefined();
  });

  test("clears suppression once playback context has moved to a different track", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
    const previousStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });
    const currentStatus = makeStatus({
      currentTrack: {
        id: "2",
        title: "Freddie Freeloader",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 250,
        sources: [],
      },
      queuePreview: [],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toBeUndefined();
  });
});
