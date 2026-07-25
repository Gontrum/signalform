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
import { err, ok, type QueueTrack, type Result } from "@signalform/shared";
import {
  recordQueueRemoval,
  setSuppressedQueueEnd,
} from "../../radio-mode/shell/radio-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RadioRemovalContext = {
  readonly removedTrack: {
    readonly artist: string;
    readonly title: string;
  };
};

type RadioRemovalOutcome =
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

/** Result of snapshotting the queue before the removal mutation runs. */
type PreRemovalRadioContext = {
  readonly preRemovalQueueResult:
    Result<readonly QueueTrack[], LmsError> | undefined;
  readonly canAttemptRadioRemoval: boolean;
};

// ---------------------------------------------------------------------------
// Step helpers
//
// Each helper below corresponds to one ordered step of handleQueueRemoval.
// They exist so the main function reads as a sequence of named steps rather
// than one 150-line block — see the numbered comments in
// handleQueueRemoval itself.
// ---------------------------------------------------------------------------

/**
 * Step 1 — Capture the pre-removal queue as radio-replenishment context.
 *
 * Radio replenishment needs to know which track is about to be removed, so
 * we snapshot the queue *before* the LMS mutation runs. If the snapshot
 * fails (or radio removal isn't configured), we log a warning and continue —
 * this is best-effort context, not a hard dependency for the removal itself.
 */
const capturePreRemovalRadioContext = async (
  trackIndex: number,
  lmsClient: LmsClient,
  log: FastifyBaseLogger,
  radioRemovalPolicy: RadioRemovalPolicy | undefined,
): Promise<PreRemovalRadioContext> => {
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

  return { preRemovalQueueResult, canAttemptRadioRemoval };
};

/**
 * Step 2 — Perform the actual LMS removal mutation.
 *
 * Returns a `Result` so the caller can early-return on failure; nothing
 * downstream (queue projection, radio replenish) should run if this fails.
 */
const performLmsRemoval = async (
  trackIndex: number,
  lmsClient: LmsClient,
  log: FastifyBaseLogger,
): Promise<Result<void, LmsError>> => {
  const mutationResult = await lmsClient.removeFromQueue(trackIndex);
  if (!mutationResult.ok) {
    log.error(
      { event: "queue_remove_failed", error: mutationResult.error },
      "Queue remove LMS mutation failed",
    );
    return err(mutationResult.error);
  }
  return ok(undefined);
};

/**
 * Step 3 — Project and emit the post-delete queue.
 *
 * This is what the HTTP response is built from; it must complete before
 * handleQueueRemoval returns so the caller gets a responsive update. Radio
 * replenishment (step 4) happens after this and does not block it.
 */
const emitPostRemovalQueue = (
  trackIndex: number,
  emitQueueUpdate: QueueRemovalDeps["emitQueueUpdate"],
): Promise<QueueProjection | null> =>
  emitQueueUpdate("remove", (tracks) =>
    recordQueueRemoval(tracks, trackIndex + 1),
  );

type TriggerRadioReplenishmentParams = {
  readonly trackIndex: number;
  readonly queueProjection: QueueProjection | null;
  readonly radioContext: PreRemovalRadioContext;
  readonly radioRemovalPolicy: RadioRemovalPolicy | undefined;
  readonly log: FastifyBaseLogger;
};

/**
 * Step 4 — Trigger radio replenishment asynchronously.
 *
 * IMPORTANT — two things that are easy to miss from the call site:
 *
 * 1. Fire-and-forget: this function does not await the replenish policy
 *    call. It runs synchronously up through kicking off
 *    `radioRemovalPolicy.handleRemoval(...)`, then returns immediately.
 *    handleQueueRemoval's `return ok(...)` happens right after this call —
 *    the replenish outcome (success/skip/failure) is only ever logged, on
 *    a microtask that resolves *after* the surrounding function has already
 *    returned to its caller.
 * 2. Cross-feature coupling: `setSuppressedQueueEnd` below mutates global
 *    state owned by the *radio-mode* feature (imported from
 *    `../../radio-mode/shell/radio-state.js`), not the queue feature. It
 *    tells radio-mode "don't treat this as an organic queue-end event"
 *    when the removal empties the queue or removes the current track.
 */
const triggerRadioReplenishment = (
  params: TriggerRadioReplenishmentParams,
): void => {
  const { trackIndex, queueProjection, radioContext, radioRemovalPolicy, log } =
    params;
  const { preRemovalQueueResult, canAttemptRadioRemoval } = radioContext;

  const removedTrack =
    canAttemptRadioRemoval && preRemovalQueueResult?.ok === true
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

  // Cross-feature coupling: see the function-level comment above.
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
    // Not awaited by design — see "Fire-and-forget" above.
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
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Remove a track from the queue and handle optional radio replenishment.
 *
 * Returns a discriminated union so the route handler can produce the
 * appropriate HTTP response without containing orchestration logic.
 *
 * Reads as four ordered steps — see the helpers above for what each one
 * does. Step 4 is fire-and-forget: it is *triggered* before this function
 * returns, but its own async work (and the radio-mode state it touches)
 * keeps running after `handleQueueRemoval` has already resolved.
 */
export const handleQueueRemoval = async (
  trackIndex: number,
  deps: QueueRemovalDeps,
): Promise<Result<QueueProjection | undefined, LmsError>> => {
  const { lmsClient, log, emitQueueUpdate, radioRemovalPolicy } = deps;

  // 1. Capture pre-removal queue state for radio context (before mutation).
  const radioContext = await capturePreRemovalRadioContext(
    trackIndex,
    lmsClient,
    log,
    radioRemovalPolicy,
  );

  // 2. Perform the LMS mutation.
  const mutationResult = await performLmsRemoval(trackIndex, lmsClient, log);
  if (!mutationResult.ok) {
    return err(mutationResult.error);
  }

  // 3. Return the post-delete queue immediately for a responsive client update.
  const queueProjection = await emitPostRemovalQueue(
    trackIndex,
    emitQueueUpdate,
  );

  // 4. Trigger radio replenishment asynchronously if applicable. This call
  //    returns synchronously; its own promise chain (and its cross-feature
  //    write into radio-mode state) is not awaited — see the helper's
  //    doc comment for details.
  triggerRadioReplenishment({
    trackIndex,
    queueProjection,
    radioContext,
    radioRemovalPolicy,
    log,
  });

  return ok(queueProjection ?? undefined);
};
