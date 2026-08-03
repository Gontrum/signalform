/**
 * LMS Status Polling Service
 * Polls LMS for status changes and emits WebSocket events
 * Implements polling fallback pattern (1 second interval, backing off while LMS is unreachable)
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
} from "./handlers.js";
import {
  assessTrackEnd,
  type TrackEndSample,
  type TrackEndVerdict,
} from "./early-track-end.js";
import { lastUserTransportCommandAt } from "../transport-commands.js";
import { nextPollDelayMs } from "./poll-backoff.js";
import {
  abandonedStall,
  advanceStallState,
  shouldForceTrackAdvance,
  type TrackStallState,
} from "./stall-detection.js";
import {
  PLAYER_STATUS_CHANGED,
  PLAYER_QUEUE_UPDATED,
  PLAYER_UPDATES_ROOM,
  SYSTEM_LMS_DISCONNECTED,
  SYSTEM_LMS_RECONNECTED,
  SYSTEM_PLAYER_DISCONNECTED,
  SYSTEM_PLAYER_RECONNECTED,
  SYSTEM_PLAYER_STATUS_RESTORED,
  SYSTEM_PLAYER_STATUS_UNAVAILABLE,
} from "./events.js";
import {
  assessConnectivity,
  shouldProbeServer,
  type ConnectivityAnnouncement,
  type LmsConnectivity,
} from "./lms-connectivity.js";

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
  // PlayerStatus (imported above) already carries `playerConnected`, so no
  // separate inline field is needed here.
  // Server-level probe: answers even when the player does not, which is what
  // tells "LMS is down" apart from "LMS is up, the player is not answering".
  readonly pingServer: () => Promise<{ readonly ok: boolean }>;
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
  readonly nextTrack: () => Promise<{
    readonly ok: boolean;
    readonly error?: unknown;
  }>;
  readonly resume: () => Promise<{
    readonly ok: boolean;
    readonly error?: unknown;
  }>;
};

/**
 * Logs the "radio queue-end trigger fired" event shared by the proactive
 * (queue-emptied-during-playback) and stop (play→stop transition) triggers —
 * only the event name/message and trigger kind differ between the two.
 */
const logQueueEndTriggerFired = (
  app: FastifyInstance,
  playerId: string,
  trigger: "proactive" | "stop",
  seedTrack: { readonly artist: string; readonly title: string },
  previousStatus: LmsPlayerStatus,
  currentStatus: LmsPlayerStatus,
): void => {
  app.log.info(
    {
      event: `radio.queue_end_triggered_${trigger}`,
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
    trigger === "proactive"
      ? "Radio queue-end proactive trigger fired"
      : "Radio queue-end stop trigger fired",
  );
};

type AnnouncementSpec = {
  readonly event:
    | typeof SYSTEM_LMS_DISCONNECTED
    | typeof SYSTEM_LMS_RECONNECTED
    | typeof SYSTEM_PLAYER_STATUS_UNAVAILABLE
    | typeof SYSTEM_PLAYER_STATUS_RESTORED;
  readonly message: string;
  readonly severity: "warn" | "info";
  readonly logEvent: string;
  readonly logMessage: string;
};

const ANNOUNCEMENT_SPECS: Readonly<
  Record<ConnectivityAnnouncement, AnnouncementSpec>
> = {
  "lms-disconnected": {
    event: SYSTEM_LMS_DISCONNECTED,
    message: "LMS connection lost",
    severity: "warn",
    logEvent: "system_lms_disconnected",
    logMessage: "LMS disconnected - system event emitted",
  },
  "lms-reconnected": {
    event: SYSTEM_LMS_RECONNECTED,
    message: "LMS connection restored",
    severity: "info",
    logEvent: "system_lms_reconnected",
    logMessage: "LMS reconnected - system event emitted",
  },
  "player-status-unavailable": {
    event: SYSTEM_PLAYER_STATUS_UNAVAILABLE,
    message: "Player is not answering",
    severity: "warn",
    logEvent: "system_player_status_unavailable",
    logMessage: "Player status unavailable while LMS itself answers",
  },
  "player-status-restored": {
    event: SYSTEM_PLAYER_STATUS_RESTORED,
    message: "Player is answering again",
    severity: "info",
    logEvent: "system_player_status_restored",
    logMessage: "Player status available again",
  },
};

const announceConnectivity = (
  io: TypedSocketIOServer,
  app: FastifyInstance,
  playerId: string,
  announcements: readonly ConnectivityAnnouncement[],
  statusError: string | undefined,
): void => {
  announcements.forEach((announcement) => {
    const spec = ANNOUNCEMENT_SPECS[announcement];
    const payloadResult = createSystemEventPayload(spec.message);
    if (!payloadResult.ok) {
      return;
    }
    io.to(PLAYER_UPDATES_ROOM).emit(spec.event, payloadResult.value);
    const fields = {
      event: spec.logEvent,
      playerId,
      error: statusError,
    };
    if (spec.severity === "warn") {
      app.log.warn(fields, spec.logMessage);
    } else {
      app.log.info(fields, spec.logMessage);
    }
  });
};

// The recurring line of a standing failure names whoever is actually silent —
// 102k lines blaming LMS for a switched-off speaker sent months of debugging at
// the wrong component.
const logPollFailure = (
  app: FastifyInstance,
  playerId: string,
  state: LmsConnectivity,
  statusError: string | undefined,
): void => {
  if (state === "player-unreachable") {
    app.log.warn(
      { event: "player_status_poll_failed", playerId, error: statusError },
      "Player status poll failed while LMS stays reachable",
    );
    return;
  }
  app.log.warn(
    { event: "lms_status_poll_failed", error: statusError },
    "LMS status poll failed",
  );
};

const trackEndSample = (status: LmsPlayerStatus): TrackEndSample => ({
  mode: status.mode,
  time: status.time,
  duration: status.currentTrack?.duration,
  trackId: status.currentTrack?.id,
});

/**
 * Both verdicts carry the same fields on purpose: a run of `info` lines proves
 * the counter is alive and merely explaining what it sees, which a missing
 * `warn` line alone never could.
 */
const logTrackEndVerdict = (
  app: FastifyInstance,
  playerId: string,
  verdict: TrackEndVerdict,
): void => {
  if (verdict.kind === "no-incident") {
    return;
  }
  const fields = {
    event:
      verdict.kind === "incident"
        ? "track_ended_early"
        : "track_ended_early_after_user_command",
    playerId,
    trackId: verdict.incident.previousTrackId,
    time: verdict.incident.time,
    duration: verdict.incident.duration,
    remainingSeconds: verdict.incident.remainingSeconds,
    nextTrackId: verdict.incident.nextTrackId,
  };
  if (verdict.kind === "incident") {
    app.log.warn(fields, "Track changed with playback time left");
  } else {
    app.log.info(
      fields,
      "Track changed with playback time left, explained by a user transport command",
    );
  }
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
  onStatusUpdate?: (
    previousStatus: LmsPlayerStatus | null,
    currentStatus: LmsPlayerStatus,
  ) => Promise<void>,
): (() => void) => {
  const pollingAbortController = new AbortController();

  const scheduleNextPoll = async (
    nextPreviousStatus: LmsPlayerStatus | null,
    consecutiveFailures: number,
    nextConnectivity: LmsConnectivity,
    nextStallState?: TrackStallState,
    nextPreviousSample?: TrackEndSample,
  ): Promise<void> =>
    delay(nextPollDelayMs(intervalMs, consecutiveFailures), undefined, {
      signal: pollingAbortController.signal,
    })
      .then(async () => {
        await poll(
          nextPreviousStatus,
          consecutiveFailures,
          nextConnectivity,
          nextStallState,
          nextPreviousSample,
        );
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
    consecutiveFailures: number,
    connectivity: LmsConnectivity,
    stallState?: TrackStallState,
    // The previous poll, not the previous *emitted* status: previousStatus only
    // moves when something changed, so its `time` freezes at the start of a
    // track and would make every track change look early.
    previousSample?: TrackEndSample,
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
      // Probing on the edge into failure only: asking on every failed poll would
      // double the request rate of exactly the situation the backoff calms down.
      const serverReachable = shouldProbeServer(connectivity, false)
        ? await lmsClient
            .pingServer()
            .then((probe) => probe.ok)
            .catch(() => false)
        : undefined;

      // Poller was stopped while pingServer() was in-flight — discard result
      if (isAborted()) {
        return;
      }

      const transition = assessConnectivity(connectivity, {
        statusOk: false,
        serverReachable,
      });
      if (transition.announcements.length > 0) {
        announceConnectivity(
          io,
          app,
          playerId,
          transition.announcements,
          statusResult.error?.message,
        );
      } else {
        logPollFailure(
          app,
          playerId,
          transition.state,
          statusResult.error?.message,
        );
      }
      // No sample is carried across a failed poll: the backoff makes the last
      // one minutes old, and a regular track end would look like a cut-off.
      await scheduleNextPoll(
        previousStatus,
        consecutiveFailures + 1,
        transition.state,
      );
      return;
    }

    announceConnectivity(
      io,
      app,
      playerId,
      assessConnectivity(connectivity, { statusOk: true }).announcements,
      undefined,
    );

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
      playerConnected: statusResult.value.playerConnected,
      currentTrack: track,
      volume: statusResult.value.volume,
      time: statusResult.value.time,
      queuePreview: statusResult.value.queuePreview,
      shuffle: statusResult.value.shuffle,
      repeat: statusResult.value.repeat,
    };

    // Player-connectivity transition detection: orthogonal to the LMS-reachable
    // check above. LMS itself answered fine (statusResult.ok) — this looks at
    // whether *this specific player* (e.g. a UPnPBridge speaker) is still
    // connected to LMS. previousStatus is null on the very first poll; treat
    // that as "was connected" so we never fire a disconnect on startup, only on
    // an actual true → false transition.
    const wasPlayerConnected = previousStatus?.playerConnected ?? true;
    if (wasPlayerConnected && !currentStatus.playerConnected) {
      const systemEventResult = createSystemEventPayload(
        "Player disconnected from LMS",
      );
      if (systemEventResult.ok) {
        io.to(PLAYER_UPDATES_ROOM).emit(
          SYSTEM_PLAYER_DISCONNECTED,
          systemEventResult.value,
        );
        // Playback position is read from previousStatus on purpose: currentStatus
        // is the poll *after* the drop and no longer says what was playing when
        // the player vanished. Switching this to currentStatus silently guts the
        // "did LMS resume or skip ahead?" diagnosis this pair of lines exists for.
        app.log.warn(
          {
            event: "system_player_disconnected",
            playerId,
            trackId: previousStatus?.currentTrack?.id,
            time: previousStatus?.time,
            duration: previousStatus?.currentTrack?.duration,
          },
          "Player disconnected from LMS - system event emitted",
        );
      }
    } else if (!wasPlayerConnected && currentStatus.playerConnected) {
      const systemEventResult = createSystemEventPayload(
        "Player reconnected to LMS",
      );
      if (systemEventResult.ok) {
        io.to(PLAYER_UPDATES_ROOM).emit(
          SYSTEM_PLAYER_RECONNECTED,
          systemEventResult.value,
        );
        app.log.info(
          {
            event: "system_player_reconnected",
            playerId,
            trackId: currentStatus.currentTrack?.id,
            time: currentStatus.time,
          },
          "Player reconnected to LMS - system event emitted",
        );
      }
    }

    const currentSample = trackEndSample(currentStatus);

    // Runs on every poll pair, not just the ones that emit: a track breaking off
    // into a standstill leaves mode and preview looking unchanged enough that
    // the emit path below would never ask.
    logTrackEndVerdict(
      app,
      playerId,
      assessTrackEnd(previousSample, currentSample, {
        nowMs: Date.now(),
        lastCommandAtMs: lastUserTransportCommandAt(),
      }),
    );

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    if (onStatusUpdate !== undefined) {
      void onStatusUpdate(previousStatus, currentStatus).catch(() => undefined);
    }

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

    const duration = statusResult.value.duration;
    const nextStallState: TrackStallState | undefined = advanceStallState(
      stallState,
      {
        mode: currentStatus.mode,
        time: currentStatus.time,
        duration,
        trackId: currentStatus.currentTrack?.id,
      },
    );

    // A near miss is invisible otherwise: without this line a false trigger and
    // a real freeze look identical in hindsight.
    const abandoned = abandonedStall(stallState, nextStallState);
    if (abandoned !== undefined) {
      app.log.info(
        {
          event: "stall_count_abandoned",
          playerId,
          trackId: abandoned.trackId,
          stallCount: abandoned.stallCount,
          time: currentStatus.time,
          duration,
        },
        "Track-end stall count ended without intervention",
      );
    }

    if (shouldForceTrackAdvance(nextStallState)) {
      app.log.warn(
        {
          event: "stall_detected_at_track_end",
          playerId,
          trackId: nextStallState.trackId,
          time: currentStatus.time,
          duration,
          stallCount: nextStallState.stallCount,
        },
        "Track stalled at end — forcing nextTrack + resume",
      );
      const nextResult = await lmsClient.nextTrack();
      if (nextResult.ok) {
        const statusAfterAdvance = await lmsClient.getStatus();
        if (
          statusAfterAdvance.ok &&
          statusAfterAdvance.value?.mode !== "play"
        ) {
          await lmsClient.resume();
          app.log.info(
            { event: "stall_resume_forced", playerId },
            "Stall recovery: resume sent after nextTrack",
          );
        }
      } else {
        app.log.warn(
          {
            event: "stall_next_track_failed",
            playerId,
            error: nextResult.error,
          },
          "Stall recovery: nextTrack failed",
        );
      }
      // Reset stall counter and reschedule — don't run radio triggers on stale state
      await scheduleNextPoll(
        nextStatus ?? previousStatus,
        0,
        "healthy",
        undefined,
        currentSample,
      );
      return;
    }

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
        await scheduleNextPoll(
          nextStatus,
          0,
          "healthy",
          nextStallState,
          currentSample,
        );
        return;
      }
      logQueueEndTriggerFired(
        app,
        playerId,
        "proactive",
        seedTrack,
        previousStatus,
        currentStatus,
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
        await scheduleNextPoll(
          nextStatus,
          0,
          "healthy",
          nextStallState,
          currentSample,
        );
        return;
      }
      logQueueEndTriggerFired(
        app,
        playerId,
        "stop",
        seedTrack,
        previousStatus,
        currentStatus,
      );
      void onQueueEnd(seedTrack.artist, seedTrack.title);
    }

    await scheduleNextPoll(
      nextStatus,
      0,
      "healthy",
      nextStallState,
      currentSample,
    );
  };

  // Start polling loop
  void poll(null, 0, "healthy", undefined);

  // Return cleanup function
  return () => {
    pollingAbortController.abort();
    app.log.info({ event: "status_polling_stopped" }, "Status polling stopped");
  };
};
