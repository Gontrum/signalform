/**
 * LMS Status Polling Service
 * Polls LMS for status changes and emits WebSocket events
 * Implements polling fallback pattern (1 second interval)
 */

import type { FastifyInstance } from "fastify";
import { setTimeout as delay } from "node:timers/promises";
import {
  annotateRadioQueueTracks,
  clearSuppressedQueueEnd,
  reconcileSuppressedQueueEnd,
  shouldSuppressQueueEnd,
} from "../../features/radio-mode/shell/radio-state.js";
import type {
  PlayerStatus,
  LmsError,
} from "../../adapters/lms-client/index.js";
import type { AudioQuality } from "@signalform/shared";

// Fallback quality for tracks where quality cannot be inferred from URL (e.g. local files).
// Tidal tracks get audioQuality from getStatus() via parseTidalAudioQuality() in client.ts.
const DEFAULT_QUALITY: AudioQuality = {
  format: "MP3",
  bitrate: 320000,
  sampleRate: 44100,
  lossless: false,
} as const;
import type { TypedSocketIOServer } from "./server.js";
import type { LmsPlayerStatus } from "./handlers.js";
import {
  createPlayerStatusPayload,
  createSystemEventPayload,
  hasQueueContextChanged,
  hasStatusChanged,
  PLAYER_STATUS_CHANGED,
  PLAYER_QUEUE_UPDATED,
  PLAYER_UPDATES_ROOM,
  SYSTEM_LMS_DISCONNECTED,
  SYSTEM_LMS_RECONNECTED,
} from "./index.js";

/**
 * LMS Client interface (subset needed for polling)
 * Uses imported PlayerStatus/LmsError to avoid dual-maintenance with SearchResult fields.
 */
type LmsClient = {
  readonly getStatus: () => Promise<{
    readonly ok: boolean;
    readonly value?: PlayerStatus;
    readonly error?: LmsError;
  }>;
  // Needed for emitting player.queue.updated on track change
  readonly getQueue: () => Promise<{
    readonly ok: boolean;
    readonly value?: ReadonlyArray<{
      readonly id: string;
      readonly position: number;
      readonly title: string;
      readonly artist: string;
      readonly album: string;
      readonly duration: number;
      readonly isCurrent: boolean;
    }>;
    readonly error?: LmsError;
  }>;
};

/**
 * Starts LMS status polling
 * @param io - Socket.IO server instance
 * @param lmsClient - LMS client for fetching status
 * @param app - Fastify instance for logging
 * @param playerId - Player ID from LMS config
 * @param intervalMs - Polling interval in milliseconds (default: 1000ms)
 * @param onQueueEnd - Optional callback invoked on play→stop transition (radio trigger)
 * @returns Cleanup function to stop polling
 */
export const startStatusPolling = (
  io: TypedSocketIOServer,
  lmsClient: LmsClient,
  app: FastifyInstance,
  playerId: string,
  intervalMs: number = 1000,
  onQueueEnd?: (seedArtist: string, seedTitle: string) => Promise<void>,
): (() => void) => {
  const pollingAbortController = new AbortController();

  const scheduleNextPoll = async (
    nextPreviousStatus: LmsPlayerStatus | null,
    lmsWasDisconnected: boolean,
  ): Promise<void> =>
    delay(intervalMs, undefined, {
      signal: pollingAbortController.signal,
    })
      .then(async () => {
        await poll(nextPreviousStatus, lmsWasDisconnected);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        app.log.error(
          {
            event: "status_polling_schedule_error",
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to schedule next status poll",
        );
      });

  /**
   * Polls LMS for status changes and emits WebSocket events
   * Uses recursive setTimeout pattern to maintain immutability
   */
  const isAborted = (): boolean => pollingAbortController.signal.aborted;
  const poll = async (
    previousStatus: LmsPlayerStatus | null,
    lmsWasDisconnected: boolean,
  ): Promise<void> => {
    const statusResult = await lmsClient.getStatus().catch(
      (
        error: unknown,
      ): {
        readonly ok: false;
        readonly error: LmsError;
      } => ({
        ok: false,
        error: {
          type: "NetworkError",
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    );

    // Poller was stopped while getStatus() was in-flight — discard result
    if (isAborted()) {
      return;
    }

    if (!statusResult.ok || !statusResult.value) {
      // LMS unavailable - emit system event if not already disconnected
      if (!lmsWasDisconnected) {
        const systemEventResult = createSystemEventPayload(
          "LMS connection lost",
        );
        if (systemEventResult.ok) {
          io.to(PLAYER_UPDATES_ROOM).emit(
            SYSTEM_LMS_DISCONNECTED,
            systemEventResult.value,
          );
          app.log.warn(
            {
              event: "system_lms_disconnected",
              error: statusResult.error?.message,
            },
            "LMS disconnected - system event emitted",
          );
        }
      } else {
        app.log.warn(
          {
            event: "lms_status_poll_failed",
            error: statusResult.error?.message,
          },
          "LMS status poll failed",
        );
      }
      await scheduleNextPoll(previousStatus, true);
      return;
    }

    // LMS is available - emit reconnected event if was previously disconnected
    if (lmsWasDisconnected) {
      const systemEventResult = createSystemEventPayload(
        "LMS connection restored",
      );
      if (systemEventResult.ok) {
        io.to(PLAYER_UPDATES_ROOM).emit(
          SYSTEM_LMS_RECONNECTED,
          systemEventResult.value,
        );
        app.log.info(
          {
            event: "system_lms_reconnected",
          },
          "LMS reconnected - system event emitted",
        );
      }
    }

    // Convert LMS track to shared Track type
    // Note: LMS returns numeric IDs (e.g. 1234) — convert to string for TrackSchema
    const lmsTrack = statusResult.value.currentTrack;
    const track = lmsTrack
      ? {
          id: String(lmsTrack.id),
          title: lmsTrack.title,
          artist: lmsTrack.artist,
          album: lmsTrack.album,
          duration: statusResult.value.duration,
          coverArtUrl: lmsTrack.coverArtUrl,
          artistId: lmsTrack.artistId,
          albumId: lmsTrack.albumId,
          sources: [
            {
              source:
                lmsTrack.source === "qobuz" || lmsTrack.source === "tidal"
                  ? lmsTrack.source
                  : ("local" as const),
              url: lmsTrack.url,
              // Use audioQuality from getStatus() (inferred from Tidal URL extension);
              // fall back to DEFAULT_QUALITY for local/unknown tracks.
              quality: lmsTrack.audioQuality ?? DEFAULT_QUALITY,
              available: true,
            },
          ],
        }
      : undefined;

    const currentStatus: LmsPlayerStatus = {
      playerId,
      mode: statusResult.value.mode,
      currentTrack: track,
      volume: statusResult.value.volume,
      time: statusResult.value.time,
      queuePreview: statusResult.value.queuePreview,
    };

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    // Only emit if status changed
    const nextStatus = hasStatusChanged(previousStatus, currentStatus)
      ? await (async (): Promise<LmsPlayerStatus | null> => {
          const payloadResult = createPlayerStatusPayload(currentStatus);

          if (payloadResult.ok) {
            io.to(PLAYER_UPDATES_ROOM).emit(
              PLAYER_STATUS_CHANGED,
              payloadResult.value,
            );

            // Log performance metrics including latency
            const broadcastLatency = Date.now() - payloadResult.value.timestamp;
            app.log.info(
              {
                event: "player_status_broadcast",
                playerId: currentStatus.playerId,
                status: currentStatus.mode,
                trackId: currentStatus.currentTrack?.id,
                connectedClients: io.sockets.sockets.size,
                latencyMs: broadcastLatency,
                nfr2Compliant: broadcastLatency < 50,
              },
              "Player status broadcast to clients",
            );

            // Emit player.queue.updated when the queue context changed.
            // This covers normal track changes and duplicate-occurrence advances
            // where LMS may keep the same currentTrack.id while queuePreview shifts.
            // Guard previousStatus !== null to skip the initial poll (first poll has no
            // previous state to compare against; initial queue load happens via fetchQueue()
            // in QueueView.vue onMounted, so the push here would be redundant on startup).
            if (hasQueueContextChanged(previousStatus, currentStatus)) {
              const queueResult = await lmsClient.getQueue();
              // Poller was stopped while getQueue() was in-flight — discard result
              if (isAborted()) {
                return previousStatus;
              }
              if (queueResult.ok && queueResult.value) {
                const queueProjection = annotateRadioQueueTracks(
                  queueResult.value,
                );
                io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
                  playerId,
                  tracks: queueProjection.tracks,
                  radioModeActive: queueProjection.radioModeActive,
                  radioBoundaryIndex:
                    queueProjection.radioBoundaryIndex ?? undefined,
                  timestamp: Date.now(),
                });
                app.log.info(
                  {
                    event: "queue_update_broadcast",
                    trackId: currentStatus.currentTrack?.id,
                    trackCount: queueResult.value.length,
                  },
                  "Queue update broadcast on track change",
                );
              } else if (!queueResult.ok) {
                // TODO(test): this warning branch has no unit test (no status-poller.test.ts yet)
                app.log.warn(
                  {
                    event: "queue_fetch_failed_in_poller",
                    error: queueResult.error,
                  },
                  "Could not fetch queue after track change",
                );
              }
            }

            return currentStatus;
          } else {
            app.log.error(
              {
                event: "player_status_payload_error",
                error: payloadResult.error,
              },
              "Failed to create player status payload",
            );
            return previousStatus;
          }
        })()
      : previousStatus;

    // Proactive trigger: queue just became empty while still playing last track.
    // Fires when queuePreview transitions non-empty → empty during playback.
    // Seed = currently-playing track (not yet ended).
    // Double-fire analysis:
    //   - Success → adds tracks → LMS continues playing → never reaches stop → stop trigger skips ✓
    //   - Failure → queue stays empty → player stops → stop trigger fires as recovery ✓
    //   - Single-track (queuePreview always []): prev.queuePreview.length = 0 (not > 0) → skips ✓
    //   - Initial poll: previousStatus = null → skips ✓
    // Fire-and-forget (void) — radio runs async, does not block polling
    if (
      onQueueEnd !== undefined &&
      previousStatus !== null &&
      currentStatus.mode === "play" &&
      currentStatus.currentTrack !== undefined &&
      (previousStatus.queuePreview?.length ?? 0) > 0 &&
      (currentStatus.queuePreview?.length ?? 0) === 0
    ) {
      const seedTrack = currentStatus.currentTrack;
      if (
        shouldSuppressQueueEnd({
          trackId: seedTrack.id,
          artist: seedTrack.artist,
          title: seedTrack.title,
        })
      ) {
        app.log.info(
          {
            event: "radio.queue_end_trigger_suppressed_proactive",
            playerId,
            seedArtist: seedTrack.artist,
            seedTitle: seedTrack.title,
          },
          "Radio queue-end proactive trigger suppressed after user queue clear",
        );
        await scheduleNextPoll(nextStatus, false);
        return;
      }
      app.log.info(
        {
          event: "radio.queue_end_triggered_proactive",
          playerId,
          seedArtist: seedTrack.artist,
          seedTitle: seedTrack.title,
          previousMode: previousStatus.mode,
          currentMode: currentStatus.mode,
          previousTime: previousStatus.time,
          currentTime: currentStatus.time,
          previousQueuePreviewLength: previousStatus.queuePreview?.length ?? 0,
          currentQueuePreviewLength: currentStatus.queuePreview?.length ?? 0,
        },
        "Radio queue-end proactive trigger fired",
      );
      void onQueueEnd(seedTrack.artist, seedTrack.title);
    }

    // Fallback trigger: play → stop transition with a known seed track.
    // Handles single-track case and proactive error recovery.
    // Note: fires on ANY play→stop transition — including user-initiated stops.
    // If proactive trigger succeeded, player never reaches stop → this never fires.
    // If proactive trigger failed (last.fm/LMS error), queue stays empty → stop fires as recovery.
    // Fire-and-forget (void) — radio runs async, does not block polling
    if (
      onQueueEnd !== undefined &&
      previousStatus !== null &&
      previousStatus.mode === "play" &&
      currentStatus.mode === "stop" &&
      previousStatus.currentTrack !== undefined
    ) {
      const seedTrack = previousStatus.currentTrack;
      if (
        shouldSuppressQueueEnd({
          trackId: seedTrack.id,
          artist: seedTrack.artist,
          title: seedTrack.title,
        })
      ) {
        clearSuppressedQueueEnd();
        app.log.info(
          {
            event: "radio.queue_end_trigger_suppressed_stop",
            playerId,
            seedArtist: seedTrack.artist,
            seedTitle: seedTrack.title,
          },
          "Radio queue-end stop trigger suppressed after user queue clear",
        );
        await scheduleNextPoll(nextStatus, false);
        return;
      }
      app.log.info(
        {
          event: "radio.queue_end_triggered_stop",
          playerId,
          seedArtist: seedTrack.artist,
          seedTitle: seedTrack.title,
          previousMode: previousStatus.mode,
          currentMode: currentStatus.mode,
          previousTime: previousStatus.time,
          currentTime: currentStatus.time,
          previousQueuePreviewLength: previousStatus.queuePreview?.length ?? 0,
          currentQueuePreviewLength: currentStatus.queuePreview?.length ?? 0,
        },
        "Radio queue-end stop trigger fired",
      );
      void onQueueEnd(seedTrack.artist, seedTrack.title);
    }

    await scheduleNextPoll(nextStatus, false);
  };

  // Start polling loop
  void poll(null, false);

  // Return cleanup function
  return () => {
    pollingAbortController.abort();
    app.log.info({ event: "status_polling_stopped" }, "Status polling stopped");
  };
};
