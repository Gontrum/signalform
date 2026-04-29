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
import {
  recordQueueRemoval,
  setSuppressedQueueEnd,
} from "../../radio-mode/shell/radio-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RadioRemovalContext = {
  readonly removedTrack: {
    readonly artist: string;
    readonly title: string;
  };
};

export type RadioRemovalOutcome =
  | {
      readonly status: "success";
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
  readonly log: FastifyBaseLogger;
  readonly emitQueueUpdate: (
    mutation: string,
    projectQueue?: (tracks: readonly QueueTrack[]) => QueueProjection,
  ) => Promise<QueueProjection | null>;
  readonly radioRemovalPolicy?: RadioRemovalPolicy;
};

export type QueueProjection = {
  readonly tracks: readonly QueueTrack[];
  readonly radioModeActive: boolean;
  readonly radioBoundaryIndex: number | null;
};

export type QueueRemovalResult =
  | { readonly ok: true; readonly queueProjection?: QueueProjection }
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
  const { lmsClient, log, emitQueueUpdate, radioRemovalPolicy } = deps;

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

  // 3. Return the post-delete queue immediately for a responsive client update.
  const queueProjection = await emitQueueUpdate("remove", (tracks) =>
    recordQueueRemoval(tracks, trackIndex + 1),
  );

  // 4. Trigger radio replenishment asynchronously if applicable.
  const removedTrack = canAttemptRadioRemoval
    ? preRemovalQueueResult.value?.[trackIndex]
    : undefined;

  const currentTrackAfterRemoval =
    queueProjection?.tracks.find((track) => track.isCurrent) ?? undefined;
  const shouldSuppressQueueEndForCurrentTrack =
    currentTrackAfterRemoval !== undefined &&
    queueProjection?.tracks.length === 1;
  const shouldSuppressQueueEndForRemovedTrack =
    removedTrack?.isCurrent === true &&
    (queueProjection?.tracks.length ?? 0) === 0;

  if (shouldSuppressQueueEndForCurrentTrack) {
    setSuppressedQueueEnd({
      trackId: currentTrackAfterRemoval.id,
      artist: currentTrackAfterRemoval.artist,
      title: currentTrackAfterRemoval.title,
    });
  } else if (shouldSuppressQueueEndForRemovedTrack) {
    setSuppressedQueueEnd({
      trackId: removedTrack.id,
      artist: removedTrack.artist,
      title: removedTrack.title,
    });
  }

  if (
    radioRemovalPolicy !== undefined &&
    removedTrack !== undefined &&
    (removedTrack.source === "tidal" || removedTrack.source === "qobuz")
  ) {
    void radioRemovalPolicy
      .handleRemoval({
        removedTrack: {
          artist: removedTrack.artist,
          title: removedTrack.title,
        },
      })
      .then((replenishResult) => {
        if (replenishResult.status === "success") {
          log.info(
            {
              event: "queue_remove_radio_replenished",
              trackIndex,
              seedArtist: removedTrack.artist,
              seedTitle: removedTrack.title,
              tracksAdded: replenishResult.tracksAdded,
            },
            "Queue remove triggered radio replenish",
          );
          return;
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
          return;
        }

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
      })
      .catch((error: unknown) => {
        log.error(
          {
            event: "queue_remove_radio_replenish_unexpected_error",
            trackIndex,
            seedArtist: removedTrack.artist,
            seedTitle: removedTrack.title,
            error,
          },
          "Queue remove radio replenish crashed unexpectedly",
        );
      });
  }

  return queueProjection === null
    ? { ok: true }
    : { ok: true, queueProjection };
};
