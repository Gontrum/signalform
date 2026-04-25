/**
 * Unit Tests for WebSocket Handler Functions
 * Target: 90%+ coverage (pure functions)
 */

import { describe, test, expect } from "vitest";
import {
  createPlayerStatusPayload,
  createPlayerTrackChangedPayload,
  createPlayerVolumeChangedPayload,
  createSystemEventPayload,
  hasStatusChanged,
  type LmsPlayerStatus,
} from "./handlers.js";
import type { Track } from "@signalform/shared";

describe("createPlayerStatusPayload", () => {
  test("creates valid payload from LMS status (playing)", () => {
    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 0,
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.playerId).toBe("player-1");
      expect(result.value.status).toBe("playing");
      expect(result.value.currentTrack).toBeUndefined();
      expect(result.value.currentTime).toBe(0);
      expect(result.value.timestamp).toBeGreaterThan(0);
    }
  });

  test("creates valid payload with track", () => {
    const track: Track = {
      id: "track-123",
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      duration: 180,
      sources: [],
    };

    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      currentTrack: track,
      volume: 75,
      time: 42,
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.currentTrack).toEqual(track);
      expect(result.value.currentTime).toBe(42);
    }
  });

  test("maps pause mode to paused status", () => {
    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "pause",
      volume: 50,
      time: 0,
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("paused");
    }
  });

  test("maps stop mode to stopped status", () => {
    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "stop",
      volume: 50,
      time: 0,
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("stopped");
    }
  });

  test("includes currentTime in payload from lmsStatus.time", () => {
    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 123.5,
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.currentTime).toBe(123.5);
    }
  });

  test("returns error for missing playerId", () => {
    const lmsStatus = {
      playerId: "",
      mode: "play" as const,
      volume: 50,
      time: 0,
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("MISSING_DATA");
      expect(result.error.message).toBe("Player ID is required");
    }
  });

  test("passes through queuePreview in payload when provided", () => {
    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 0,
      queuePreview: [{ id: "2", title: "Next Song", artist: "Artist" }],
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.queuePreview).toEqual([
        { id: "2", title: "Next Song", artist: "Artist" },
      ]);
    }
  });

  test("payload is valid when queuePreview is omitted (backward compat)", () => {
    const lmsStatus: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 0,
      // queuePreview intentionally omitted
    };

    const result = createPlayerStatusPayload(lmsStatus);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.queuePreview).toBeUndefined();
    }
  });
});

describe("createPlayerTrackChangedPayload", () => {
  const testTrack: Track = {
    id: "track-123",
    title: "Test Song",
    artist: "Test Artist",
    album: "Test Album",
    duration: 180,
    sources: [],
  };

  test("creates valid payload", () => {
    const result = createPlayerTrackChangedPayload("player-1", testTrack);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.playerId).toBe("player-1");
      expect(result.value.track).toEqual(testTrack);
      expect(result.value.timestamp).toBeGreaterThan(0);
    }
  });

  test("returns error for missing playerId", () => {
    const result = createPlayerTrackChangedPayload("", testTrack);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("MISSING_DATA");
      expect(result.error.message).toBe("Player ID is required");
    }
  });

  test("returns validation error for invalid track payload", () => {
    const result = createPlayerTrackChangedPayload("player-1", {
      id: "",
      title: "",
      artist: "",
      album: "",
      duration: -1,
      sources: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("VALIDATION_ERROR");
    }
  });
});

describe("createPlayerVolumeChangedPayload", () => {
  test("creates valid payload with volume 0", () => {
    const result = createPlayerVolumeChangedPayload("player-1", 0);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.playerId).toBe("player-1");
      expect(result.value.volume).toBe(0);
      expect(result.value.timestamp).toBeGreaterThan(0);
    }
  });

  test("creates valid payload with volume 100", () => {
    const result = createPlayerVolumeChangedPayload("player-1", 100);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.volume).toBe(100);
    }
  });

  test("creates valid payload with volume 50", () => {
    const result = createPlayerVolumeChangedPayload("player-1", 50);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.volume).toBe(50);
    }
  });

  test("returns error for volume < 0", () => {
    const result = createPlayerVolumeChangedPayload("player-1", -1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_STATUS");
      expect(result.error.message).toBe("Volume must be between 0 and 100");
    }
  });

  test("returns error for volume > 100", () => {
    const result = createPlayerVolumeChangedPayload("player-1", 101);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_STATUS");
      expect(result.error.message).toBe("Volume must be between 0 and 100");
    }
  });

  test("returns error for missing playerId", () => {
    const result = createPlayerVolumeChangedPayload("", 50);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("MISSING_DATA");
      expect(result.error.message).toBe("Player ID is required");
    }
  });
});

describe("createSystemEventPayload", () => {
  test("creates valid payload", () => {
    const result = createSystemEventPayload("LMS connection lost");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe("LMS connection lost");
      expect(result.value.timestamp).toBeGreaterThan(0);
    }
  });

  test("returns error for empty message", () => {
    const result = createSystemEventPayload("");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("MISSING_DATA");
      expect(result.error.message).toBe("Message is required");
    }
  });

  test("returns error for whitespace-only message", () => {
    const result = createSystemEventPayload("   ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("MISSING_DATA");
    }
  });
});

describe("hasStatusChanged", () => {
  test("returns true when prev is null", () => {
    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 0,
    };

    const result = hasStatusChanged(null, current);

    expect(result).toBe(true);
  });

  test("returns true when mode changed", () => {
    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 10,
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "pause",
      volume: 50,
      time: 10,
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(true);
  });

  test("returns true when track changed", () => {
    const track1: Track = {
      id: "track-1",
      title: "Song 1",
      artist: "Artist 1",
      album: "Album 1",
      duration: 180,
      sources: [],
    };

    const track2: Track = {
      id: "track-2",
      title: "Song 2",
      artist: "Artist 2",
      album: "Album 2",
      duration: 200,
      sources: [],
    };

    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      currentTrack: track1,
      volume: 50,
      time: 0,
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      currentTrack: track2,
      volume: 50,
      time: 0,
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(true);
  });

  test("returns true when volume changed", () => {
    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 10,
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 75,
      time: 10,
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(true);
  });

  test("returns true when time changed (playback advancing)", () => {
    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 10,
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 11,
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(true);
  });

  test("returns true when time changed after seek", () => {
    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 30,
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "play",
      volume: 50,
      time: 120,
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(true);
  });

  test("returns true when queuePreview changes (e.g. track added while paused)", () => {
    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "pause",
      volume: 50,
      time: 45,
      queuePreview: [{ id: "2", title: "Song A", artist: "Artist" }],
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "pause",
      volume: 50,
      time: 45,
      queuePreview: [
        { id: "2", title: "Song A", artist: "Artist" },
        { id: "3", title: "Song B", artist: "Artist" },
      ],
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(true);
  });

  test("returns false when nothing changed (paused at same position)", () => {
    const track: Track = {
      id: "track-1",
      title: "Song 1",
      artist: "Artist 1",
      album: "Album 1",
      duration: 180,
      sources: [],
    };

    const prev: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "pause",
      currentTrack: track,
      volume: 50,
      time: 45,
    };

    const current: LmsPlayerStatus = {
      playerId: "player-1",
      mode: "pause",
      currentTrack: track,
      volume: 50,
      time: 45,
    };

    const result = hasStatusChanged(prev, current);

    expect(result).toBe(false);
  });
});
