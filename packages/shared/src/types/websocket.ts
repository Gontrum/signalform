/**
 * WebSocket Event Payloads
 * All payloads must include playerId and timestamp for latency tracking (NFR2)
 */

import type { Track } from "./track.js";
import type { QueueTrack } from "./queue.js";

/**
 * Player status values
 */
export type PlayerStatus = "playing" | "paused" | "stopped";

/**
 * Queue preview item (upcoming track)
 */
export type QueuePreviewItem = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
};

/**
 * Payload for player.statusChanged event
 */
export type PlayerStatusPayload = {
  readonly playerId: string;
  readonly status: PlayerStatus;
  readonly currentTrack?: Track;
  readonly currentTime: number; // Current playback position in seconds
  readonly timestamp: number; // Milliseconds since epoch for latency measurement
  readonly queuePreview?: readonly QueuePreviewItem[];
};

/**
 * Payload for player.trackChanged event
 */
export type PlayerTrackChangedPayload = {
  readonly playerId: string;
  readonly track: Track;
  readonly timestamp: number;
};

/**
 * Payload for player.volumeChanged event
 */
export type PlayerVolumeChangedPayload = {
  readonly playerId: string;
  readonly volume: number; // 0-100
  readonly timestamp: number;
};

/**
 * System event payloads
 */
export type SystemEventPayload = {
  readonly message: string;
  readonly timestamp: number;
};

/**
 * Payload for player.queue.updated event
 */
export type QueueUpdatedPayload = {
  readonly playerId: string;
  readonly tracks: readonly QueueTrack[];
  readonly radioModeActive: boolean;
  readonly radioBoundaryIndex?: number; // 0-based index of first radio track; absent if not radio-triggered
  readonly timestamp: number;
};

/**
 * Payload for player.radio.started event
 */
export type RadioStartedPayload = {
  readonly playerId: string;
  readonly seedTrack: {
    readonly artist: string;
    readonly title: string;
  };
  readonly tracksAdded: number;
  readonly timestamp: number;
};

/**
 * Payload for player.radio.unavailable event
 * Emitted when the circuit breaker is open and radio cannot fetch suggestions
 */
export type RadioUnavailablePayload = {
  readonly playerId: string;
  readonly message: string;
  readonly timestamp: number;
};

/**
 * Server to Client Events Interface
 * Used for type-safe Socket.IO server
 */
export interface ServerToClientEvents {
  readonly "player.statusChanged": (payload: PlayerStatusPayload) => void;
  readonly "player.trackChanged": (payload: PlayerTrackChangedPayload) => void;
  readonly "player.volumeChanged": (
    payload: PlayerVolumeChangedPayload,
  ) => void;
  readonly "player.queue.updated": (payload: QueueUpdatedPayload) => void;
  readonly "system.lmsDisconnected": (payload: SystemEventPayload) => void;
  readonly "system.lmsReconnected": (payload: SystemEventPayload) => void;
  readonly "player.radio.started": (payload: RadioStartedPayload) => void;
  readonly "player.radio.unavailable": (
    payload: RadioUnavailablePayload,
  ) => void;
}

/**
 * Client to Server Events Interface
 * Used for type-safe Socket.IO client
 */
export interface ClientToServerEvents {
  readonly "player.subscribe": () => void;
  readonly "player.unsubscribe": () => void;
}

/**
 * Error codes for WebSocket operations
 */
export const WebSocketErrorCode = {
  INVALID_EVENT: "INVALID_EVENT",
  PLAYER_NOT_FOUND: "PLAYER_NOT_FOUND",
  LMS_CONNECTION_ERROR: "LMS_CONNECTION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
} as const;

export type WebSocketErrorCode =
  (typeof WebSocketErrorCode)[keyof typeof WebSocketErrorCode];

/**
 * WebSocket error response format
 */
export type WebSocketError = {
  readonly message: string; // Human readable
  readonly code: WebSocketErrorCode; // Machine parseable
};
