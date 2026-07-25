/**
 * Radio Mode — Shared WebSocket emit helpers (imperative shell)
 *
 * Small IO helpers shared by radio-service.ts, replenish-pipeline.ts,
 * replenish-genre.ts, and replenish-loved.ts to avoid repeating the same
 * Socket.IO emit payloads across those files.
 *
 * Imperative shell: has IO (socket emits). No business logic — callers
 * decide when to call these, all pure decisions stay in ../core/.
 */

import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_QUEUE_UPDATED,
  PLAYER_RADIO_UNAVAILABLE,
} from "../../../infrastructure/websocket/index.js";
import type { QueueTrack, RadioUnavailablePayload } from "@signalform/shared";
import type { ReplenishOutcome } from "../core/types.js";

/** Shape produced by radio-state.ts's queue projection helpers. */
export type QueueUpdatedProjection = {
  readonly tracks: readonly QueueTrack[];
  readonly radioModeActive: boolean;
  readonly radioBoundaryIndex: number | null;
};

/**
 * Emits `player.radio.unavailable` and returns the matching skipped outcome
 * — the shared reaction to a last.fm CircuitOpenError across all replenish
 * sources (generic, genre, loved).
 */
export const skippedUnavailableOutcome = (
  io: TypedSocketIOServer,
  playerId: string,
): ReplenishOutcome => {
  io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_RADIO_UNAVAILABLE, {
    playerId,
    message: "Radio mode temporarily unavailable",
    timestamp: Date.now(),
  } satisfies RadioUnavailablePayload);

  return {
    status: "skipped",
    reason: "lastfm-unavailable",
    unavailableEmitted: true,
  };
};

/**
 * Emits `player.queue.updated` from a radio queue projection — shared by
 * radio-service.ts (mode toggle) and replenish-pipeline.ts (after a
 * successful add batch).
 */
export const emitQueueUpdated = (
  io: TypedSocketIOServer,
  playerId: string,
  queueProjection: QueueUpdatedProjection,
): void => {
  io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
    playerId,
    tracks: queueProjection.tracks,
    radioModeActive: queueProjection.radioModeActive,
    radioBoundaryIndex: queueProjection.radioBoundaryIndex ?? undefined,
    timestamp: Date.now(),
  });
};
