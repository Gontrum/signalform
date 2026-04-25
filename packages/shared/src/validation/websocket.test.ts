/**
 * Tests for WebSocket Validation Schemas
 * Coverage target: 100% (validation schemas are critical)
 */

import { describe, test, expect } from "vitest";
import {
  PlayerStatusPayloadSchema,
  PlayerTrackChangedPayloadSchema,
  PlayerVolumeChangedPayloadSchema,
  QueueUpdatedPayloadSchema,
  RadioStartedPayloadSchema,
  RadioUnavailablePayloadSchema,
  SystemEventPayloadSchema,
  TrackSchema,
} from "./websocket.js";

describe("TrackSchema", () => {
  test("validates valid local track with source", () => {
    const validTrack = {
      id: "track-123",
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      duration: 180,
      sources: [
        {
          source: "local",
          url: "file:///music/test.flac",
          quality: {
            format: "FLAC" as const,
            bitrate: 1411200,
            sampleRate: 44100,
            bitDepth: 16,
            lossless: true,
          },
          available: true,
        },
      ],
    };

    const result = TrackSchema.safeParse(validTrack);
    expect(result.success).toBe(true);
  });

  test("validates track with optional artistId and albumId", () => {
    const trackWithIds = {
      id: "track-456",
      title: "Another Song",
      artist: "Some Artist",
      album: "Some Album",
      duration: 240,
      artistId: "42",
      albumId: "17",
      sources: [],
    };

    const result = TrackSchema.safeParse(trackWithIds);
    expect(result.success).toBe(true);
  });

  test("rejects track with invalid source type", () => {
    const trackWithBadSource = {
      id: "track-123",
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      duration: 180,
      sources: [
        {
          source: "spotify",
          url: "https://open.spotify.com/track/123",
          quality: {
            format: "AAC" as const,
            bitrate: 256,
            sampleRate: 44100,
            lossless: false,
          },
          available: true,
        },
      ],
    };

    const result = TrackSchema.safeParse(trackWithBadSource);
    expect(result.success).toBe(false);
  });

  test("rejects track with missing id", () => {
    const invalidTrack = {
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      duration: 180,
      sources: [],
    };

    const result = TrackSchema.safeParse(invalidTrack);
    expect(result.success).toBe(false);
  });

  test("rejects track with negative duration", () => {
    const invalidTrack = {
      id: "track-123",
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      duration: -10,
      sources: [],
    };

    const result = TrackSchema.safeParse(invalidTrack);
    expect(result.success).toBe(false);
  });
});

describe("PlayerStatusPayloadSchema", () => {
  test("validates valid payload with track", () => {
    const payload = {
      playerId: "player-1",
      status: "playing" as const,
      currentTrack: {
        id: "track-123",
        title: "Test Song",
        artist: "Test Artist",
        album: "Test Album",
        duration: 180,
        sources: [],
      },
      currentTime: 42,
      timestamp: Date.now(),
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("validates valid payload without track", () => {
    const payload = {
      playerId: "player-1",
      status: "stopped" as const,
      currentTime: 0,
      timestamp: Date.now(),
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects invalid status value", () => {
    const payload = {
      playerId: "player-1",
      status: "invalid-status",
      timestamp: Date.now(),
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("rejects missing playerId", () => {
    const payload = {
      status: "playing" as const,
      timestamp: Date.now(),
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("rejects missing timestamp", () => {
    const payload = {
      playerId: "player-1",
      status: "playing" as const,
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("accepts optional queuePreview field", () => {
    const payload = {
      playerId: "player-1",
      status: "playing" as const,
      currentTime: 0,
      timestamp: Date.now(),
      queuePreview: [
        { id: "2", title: "Next Song", artist: "Artist" },
        { id: "3", title: "Another Song", artist: "Band" },
      ],
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("accepts payload without queuePreview (backward compat)", () => {
    const payload = {
      playerId: "player-1",
      status: "stopped" as const,
      currentTime: 0,
      timestamp: Date.now(),
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects queuePreview item with empty id", () => {
    const payload = {
      playerId: "player-1",
      status: "playing" as const,
      currentTime: 0,
      timestamp: Date.now(),
      queuePreview: [{ id: "", title: "Song", artist: "Artist" }],
    };

    const result = PlayerStatusPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("PlayerTrackChangedPayloadSchema", () => {
  test("validates valid payload", () => {
    const payload = {
      playerId: "player-1",
      track: {
        id: "track-123",
        title: "Test Song",
        artist: "Test Artist",
        album: "Test Album",
        duration: 180,
        sources: [],
      },
      timestamp: Date.now(),
    };

    const result = PlayerTrackChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects payload without track", () => {
    const payload = {
      playerId: "player-1",
      timestamp: Date.now(),
    };

    const result = PlayerTrackChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("PlayerVolumeChangedPayloadSchema", () => {
  test("validates valid volume at minimum (0)", () => {
    const payload = {
      playerId: "player-1",
      volume: 0,
      timestamp: Date.now(),
    };

    const result = PlayerVolumeChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("validates valid volume at maximum (100)", () => {
    const payload = {
      playerId: "player-1",
      volume: 100,
      timestamp: Date.now(),
    };

    const result = PlayerVolumeChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("validates valid volume in middle (50)", () => {
    const payload = {
      playerId: "player-1",
      volume: 50,
      timestamp: Date.now(),
    };

    const result = PlayerVolumeChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects volume below 0", () => {
    const payload = {
      playerId: "player-1",
      volume: -1,
      timestamp: Date.now(),
    };

    const result = PlayerVolumeChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("rejects volume above 100", () => {
    const payload = {
      playerId: "player-1",
      volume: 101,
      timestamp: Date.now(),
    };

    const result = PlayerVolumeChangedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("SystemEventPayloadSchema", () => {
  test("validates valid system event", () => {
    const payload = {
      message: "LMS connection lost",
      timestamp: Date.now(),
    };

    const result = SystemEventPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects empty message", () => {
    const payload = {
      message: "",
      timestamp: Date.now(),
    };

    const result = SystemEventPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("rejects missing timestamp", () => {
    const payload = {
      message: "LMS connection lost",
    };

    const result = SystemEventPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("QueueUpdatedPayloadSchema", () => {
  test("validates valid payload with tracks", () => {
    const payload = {
      playerId: "player-1",
      tracks: [
        {
          id: "q-1",
          position: 1,
          title: "Song A",
          artist: "Artist",
          album: "Album",
          duration: 180,
          isCurrent: true,
        },
        {
          id: "q-2",
          position: 2,
          title: "Song B",
          artist: "Artist",
          album: "Album",
          duration: 240,
          isCurrent: false,
          source: "local" as const,
        },
      ],
      timestamp: Date.now(),
    };

    const result = QueueUpdatedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("validates payload with radioBoundaryIndex", () => {
    const payload = {
      playerId: "player-1",
      tracks: [],
      radioBoundaryIndex: 3,
      timestamp: Date.now(),
    };

    const result = QueueUpdatedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("validates payload without radioBoundaryIndex (absent means no radio boundary)", () => {
    const payload = {
      playerId: "player-1",
      tracks: [],
      timestamp: Date.now(),
    };

    const result = QueueUpdatedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects payload with missing playerId", () => {
    const payload = {
      tracks: [],
      timestamp: Date.now(),
    };

    const result = QueueUpdatedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("rejects track with invalid source type", () => {
    const payload = {
      playerId: "player-1",
      tracks: [
        {
          id: "q-1",
          position: 1,
          title: "Song",
          artist: "Artist",
          album: "Album",
          duration: 180,
          isCurrent: false,
          source: "spotify",
        },
      ],
      timestamp: Date.now(),
    };

    const result = QueueUpdatedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("RadioStartedPayloadSchema", () => {
  test("validates valid radio started payload", () => {
    const payload = {
      playerId: "player-1",
      seedTrack: { artist: "Die Ärzte", title: "Männer sind Schweine" },
      tracksAdded: 5,
      timestamp: Date.now(),
    };

    const result = RadioStartedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("validates payload with zero tracksAdded", () => {
    const payload = {
      playerId: "player-1",
      seedTrack: { artist: "Artist", title: "Song" },
      tracksAdded: 0,
      timestamp: Date.now(),
    };

    const result = RadioStartedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects payload with missing seedTrack", () => {
    const payload = {
      playerId: "player-1",
      tracksAdded: 3,
      timestamp: Date.now(),
    };

    const result = RadioStartedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("RadioUnavailablePayloadSchema", () => {
  test("validates valid radio unavailable payload", () => {
    const payload = {
      playerId: "player-1",
      message: "Circuit breaker open — last.fm unreachable",
      timestamp: Date.now(),
    };

    const result = RadioUnavailablePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test("rejects payload with empty message", () => {
    const payload = {
      playerId: "player-1",
      message: "",
      timestamp: Date.now(),
    };

    const result = RadioUnavailablePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("rejects payload with missing playerId", () => {
    const payload = {
      message: "Radio unavailable",
      timestamp: Date.now(),
    };

    const result = RadioUnavailablePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
