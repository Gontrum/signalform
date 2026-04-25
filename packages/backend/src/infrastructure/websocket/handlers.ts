/**
 * WebSocket Event Handler Functions
 * Pure functions that transform LMS data to WebSocket payloads
 * Following Functional Core pattern - no side effects
 */

import type {
  PlayerStatusPayload,
  PlayerTrackChangedPayload,
  PlayerVolumeChangedPayload,
  SystemEventPayload,
  QueuePreviewItem,
} from "@signalform/shared";
import {
  PlayerStatusPayloadSchema,
  PlayerTrackChangedPayloadSchema,
  PlayerVolumeChangedPayloadSchema,
  SystemEventPayloadSchema,
} from "@signalform/shared";
import type { Track } from "@signalform/shared";
import type { Result } from "@signalform/shared";

/**
 * LMS Player Status Response (from LMS JSON-RPC)
 */
export type LmsPlayerStatus = {
  readonly playerId: string;
  readonly mode: "play" | "pause" | "stop";
  readonly currentTrack?: Track;
  readonly volume: number;
  readonly time: number;
  readonly queuePreview?: readonly QueuePreviewItem[];
};

/**
 * Error type for handler operations
 */
export type HandlerError = {
  readonly type: "INVALID_STATUS" | "MISSING_DATA" | "VALIDATION_ERROR";
  readonly message: string;
};

/**
 * Maps LMS mode to PlayerStatus
 */
const mapLmsMode = (mode: string): "playing" | "paused" | "stopped" => {
  switch (mode) {
    case "play":
      return "playing";
    case "pause":
      return "paused";
    case "stop":
      return "stopped";
    default:
      return "stopped";
  }
};

/**
 * Creates PlayerStatusPayload from LMS status
 * Pure function - no side effects
 */
export const createPlayerStatusPayload = (
  lmsStatus: LmsPlayerStatus,
): Result<PlayerStatusPayload, HandlerError> => {
  if (!lmsStatus.playerId || lmsStatus.playerId.trim() === "") {
    return {
      ok: false,
      error: {
        type: "MISSING_DATA",
        message: "Player ID is required",
      },
    };
  }

  const payload: PlayerStatusPayload = {
    playerId: lmsStatus.playerId,
    status: mapLmsMode(lmsStatus.mode),
    currentTrack: lmsStatus.currentTrack,
    currentTime: lmsStatus.time,
    timestamp: Date.now(),
    queuePreview: lmsStatus.queuePreview,
  };

  // Validate with Zod schema (runtime type safety)
  const validation = PlayerStatusPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return {
      ok: false,
      error: {
        type: "VALIDATION_ERROR",
        message: `Invalid player status payload: ${validation.error.message}`,
      },
    };
  }

  // Return original payload (already typed correctly) after validation
  return {
    ok: true,
    value: payload,
  };
};

/**
 * Creates PlayerTrackChangedPayload from track and playerId
 */
export const createPlayerTrackChangedPayload = (
  playerId: string,
  track: Track,
): Result<PlayerTrackChangedPayload, HandlerError> => {
  if (!playerId || playerId.trim() === "") {
    return {
      ok: false,
      error: {
        type: "MISSING_DATA",
        message: "Player ID is required",
      },
    };
  }

  if (!track) {
    return {
      ok: false,
      error: {
        type: "MISSING_DATA",
        message: "Track is required",
      },
    };
  }

  const payload: PlayerTrackChangedPayload = {
    playerId,
    track,
    timestamp: Date.now(),
  };

  // Validate with Zod schema (runtime type safety)
  const validation = PlayerTrackChangedPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return {
      ok: false,
      error: {
        type: "VALIDATION_ERROR",
        message: `Invalid track changed payload: ${validation.error.message}`,
      },
    };
  }

  // Return original payload (already typed correctly) after validation
  return {
    ok: true,
    value: payload,
  };
};

/**
 * Creates PlayerVolumeChangedPayload from playerId and volume
 */
export const createPlayerVolumeChangedPayload = (
  playerId: string,
  volume: number,
): Result<PlayerVolumeChangedPayload, HandlerError> => {
  if (!playerId || playerId.trim() === "") {
    return {
      ok: false,
      error: {
        type: "MISSING_DATA",
        message: "Player ID is required",
      },
    };
  }

  if (volume < 0 || volume > 100) {
    return {
      ok: false,
      error: {
        type: "INVALID_STATUS",
        message: "Volume must be between 0 and 100",
      },
    };
  }

  const payload: PlayerVolumeChangedPayload = {
    playerId,
    volume,
    timestamp: Date.now(),
  };

  // Validate with Zod schema (runtime type safety)
  const validation = PlayerVolumeChangedPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return {
      ok: false,
      error: {
        type: "VALIDATION_ERROR",
        message: `Invalid volume changed payload: ${validation.error.message}`,
      },
    };
  }

  // Return original payload (already typed correctly) after validation
  return {
    ok: true,
    value: payload,
  };
};

/**
 * Creates SystemEventPayload from message
 */
export const createSystemEventPayload = (
  message: string,
): Result<SystemEventPayload, HandlerError> => {
  if (!message || message.trim() === "") {
    return {
      ok: false,
      error: {
        type: "MISSING_DATA",
        message: "Message is required",
      },
    };
  }

  const payload: SystemEventPayload = {
    message,
    timestamp: Date.now(),
  };

  // Validate with Zod schema (runtime type safety)
  const validation = SystemEventPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return {
      ok: false,
      error: {
        type: "VALIDATION_ERROR",
        message: `Invalid system event payload: ${validation.error.message}`,
      },
    };
  }

  // Return original payload (already typed correctly) after validation
  return {
    ok: true,
    value: payload,
  };
};

/**
 * Checks if player status has changed
 * Used for polling fallback to avoid emitting unchanged status
 */
export const hasStatusChanged = (
  prev: LmsPlayerStatus | null,
  current: LmsPlayerStatus,
): boolean => {
  if (!prev) {
    return true;
  }

  const prevQueueIds = prev.queuePreview?.map((t) => t.id).join(",") ?? "";
  const currentQueueIds =
    current.queuePreview?.map((t) => t.id).join(",") ?? "";

  return (
    prev.mode !== current.mode ||
    prev.currentTrack?.id !== current.currentTrack?.id ||
    prev.volume !== current.volume ||
    prev.time !== current.time ||
    prevQueueIds !== currentQueueIds
  );
};
