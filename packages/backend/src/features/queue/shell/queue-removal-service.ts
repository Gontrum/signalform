/**
 * Queue Removal Service (Shell)
 *
 * Orchestrates the remove-from-queue flow including optional radio-mode
 * replenishment.  Extracted from route.ts so that the route handler stays
 * thin (validate → call service → respond).
 *
 * This is Shell code: it performs I/O (LMS calls, WebSocket emit) and
 * coordinates async side effects.  No business logic lives here — decisions
 * about when to replenish live in the injected RadioRemovalPolicy.
 */

import type { FastifyBaseLogger } from "fastify";
import type {
  LmsClient,
  LmsError,
} from "../../../adapters/lms-client/index.js";
import type { QueueTrack } from "@signalform/shared";
import { fromThrowable } from "@signalform/shared";
import {
  getRadioQueueState,
  setRadioBoundaryIndex,
} from "../../radio-mode/shell/radio-state.js";
import {
  PLAYER_QUEUE_UPDATED,
  PLAYER_UPDATES_ROOM,
  type TypedSocketIOServer,
} from "../../../infrastructure/websocket/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RadioRemovalContext = {
  readonly removedTrack: {
    readonly artist: string;
    readonly title: string;
  };
  readonly preservedRadioBoundaryIndex?: number;
};

export type RadioRemovalOutcome =
  | {
      readonly status: "success";
      readonly postQueueTracks?: readonly QueueTrack[];
      readonly tracks?: readonly QueueTrack[];
      readonly preRadioQueueLength?: number;
      readonly radioBoundaryIndex?: number;
      readonly tracksAdded: number;
    }
  | { readonly status: "skipped"; readonly reason: string }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly error: string;
    };

export type RadioRemovalPolicy = {
  readonly handleRemoval: (
    context: RadioRemovalContext,
  ) => Promise<RadioRemovalOutcome>;
};

export type QueueRemovalDeps = {
  readonly lmsClient: LmsClient;
  readonly io: TypedSocketIOServer;
  readonly playerId: string;
  readonly log: FastifyBaseLogger;
  readonly emitQueueUpdate: (mutation: string) => Promise<void>;
  readonly radioRemovalPolicy?: RadioRemovalPolicy;
};

export type QueueRemovalResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: LmsError };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Remove a track from the queue and handle optional radio replenishment.
 *
 * Returns a discriminated union so the route handler can produce the
 * appropriate HTTP response without containing orchestration logic.
 */
export const handleQueueRemoval = async (
  trackIndex: number,
  deps: QueueRemovalDeps,
): Promise<QueueRemovalResult> => {
  const { lmsClient, io, playerId, log, emitQueueUpdate, radioRemovalPolicy } =
    deps;

  // 1. Capture pre-removal queue state for radio context (before mutation)
  const preRemovalQueueResult = radioRemovalPolicy
    ? await lmsClient.getQueue()
    : undefined;

  const canAttemptRadioRemoval =
    radioRemovalPolicy !== undefined &&
    preRemovalQueueResult?.ok === true &&
    preRemovalQueueResult.value !== undefined;

  if (
    radioRemovalPolicy !== undefined &&
    (!preRemovalQueueResult?.ok || preRemovalQueueResult.value === undefined)
  ) {
    const radioContextError =
      preRemovalQueueResult === undefined || preRemovalQueueResult.ok
        ? "Unknown queue context failure"
        : preRemovalQueueResult.error;
    log.warn(
      {
        event: "queue_remove_radio_context_failed",
        trackIndex,
        error: radioContextError,
      },
      "Queue remove could not capture radio context before mutation",
    );
  }

  // 2. Perform the LMS mutation
  const mutationResult = await lmsClient.removeFromQueue(trackIndex);
  if (!mutationResult.ok) {
    log.error(
      { event: "queue_remove_failed", error: mutationResult.error },
      "Queue remove LMS mutation failed",
    );
    return { ok: false, error: mutationResult.error };
  }

  // 3. Attempt radio replenishment if applicable
  const removedTrack = canAttemptRadioRemoval
    ? preRemovalQueueResult.value?.[trackIndex]
    : undefined;

  const preservedRadioBoundaryIndex =
    canAttemptRadioRemoval && preRemovalQueueResult?.value !== undefined
      ? getRadioQueueState().radioBoundaryIndex
      : null;

  if (
    radioRemovalPolicy !== undefined &&
    removedTrack !== undefined &&
    (removedTrack.source === "tidal" || removedTrack.source === "qobuz")
  ) {
    const replenishResult = await radioRemovalPolicy.handleRemoval({
      removedTrack: {
        artist: removedTrack.artist,
        title: removedTrack.title,
      },
      preservedRadioBoundaryIndex:
        preservedRadioBoundaryIndex !== null
          ? preservedRadioBoundaryIndex
          : undefined,
    });

    if (replenishResult.status === "success") {
      const radioBoundaryIndex =
        preservedRadioBoundaryIndex ??
        replenishResult.radioBoundaryIndex ??
        replenishResult.preRadioQueueLength;
      const replenishedTracks =
        replenishResult.tracks ?? replenishResult.postQueueTracks;

      if (radioBoundaryIndex !== undefined && replenishedTracks !== undefined) {
        setRadioBoundaryIndex(radioBoundaryIndex);
        const emitResult = fromThrowable(
          () =>
            io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
              playerId,
              tracks: replenishedTracks,
              radioBoundaryIndex,
              timestamp: Date.now(),
            }),
          (error: unknown) => error,
        );

        if (!emitResult.ok) {
          log.warn(
            {
              event: "queue_emit_failed",
              mutation: "remove-radio-replenished",
              error: emitResult.error,
            },
            "Could not emit queue update after radio-backed remove — status poller will sync within 1s",
          );
        }
      } else {
        await emitQueueUpdate("remove-radio-replenished-missing-boundary");
      }

      log.info(
        {
          event: "queue_remove_radio_replenished",
          trackIndex,
          seedArtist: removedTrack.artist,
          seedTitle: removedTrack.title,
          tracksAdded: replenishResult.tracksAdded,
          radioBoundaryIndex,
        },
        "Queue remove triggered radio replenish",
      );
      return { ok: true };
    }

    if (replenishResult.status === "failed") {
      log.warn(
        {
          event: "queue_remove_radio_replenish_failed",
          trackIndex,
          seedArtist: removedTrack.artist,
          seedTitle: removedTrack.title,
          reason: replenishResult.reason,
          error: replenishResult.error,
        },
        "Queue remove succeeded but radio replenish failed",
      );
      await emitQueueUpdate("remove-radio-replenish-failed");
      return { ok: true };
    }

    // status === "skipped"
    log.info(
      {
        event: "queue_remove_radio_replenish_skipped",
        trackIndex,
        seedArtist: removedTrack.artist,
        seedTitle: removedTrack.title,
        reason: replenishResult.reason,
      },
      "Queue remove skipped radio replenish",
    );
  }

  // 4. Standard queue update (no radio involved)
  await emitQueueUpdate("remove");
  return { ok: true };
};
