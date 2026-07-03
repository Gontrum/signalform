/**
 * Radio Mode — Shared replenish pipeline (imperative shell)
 *
 * The single queue-facing pipeline behind all replenish modes (generic,
 * genre, personal comfort, personal discovery). Callers do candidate
 * sourcing/filtering per mode and hand the final candidate list to
 * `runReplenishPipeline`, which performs: queue snapshot, dedup key sets,
 * optional queue-freshness re-check, the LMS search + addToQueue batch loop,
 * playback status advance, sliding-window update, queue refresh, and the
 * PLAYER_QUEUE_UPDATED emit.
 *
 * Imperative shell: has IO, state, and side effects. All pure decisions
 * live in ../core/replenish.ts.
 */

import type {
  LmsClient,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_QUEUE_UPDATED,
} from "../../../infrastructure/websocket/index.js";
import type {
  CandidateTrack,
  RadioAcc,
  ReplenishOutcome,
  ReplenishTrigger,
} from "../core/types.js";
import { DEFAULT_DIVERSITY_CONFIG } from "../core/types.js";
import { addToSlidingWindow } from "../core/diversity-service.js";
import {
  acceptIntoBatch,
  buildQueueKeySets,
  computeRepeatKey,
  computeTargetBatchSize,
  evaluateCandidateForBatch,
} from "../core/replenish.js";
import {
  artistMatches,
  buildRadioSearchQueries,
  selectBestTrackUrl,
} from "../core/track-selection.js";
import { getTrackUrlKey } from "../core/identity.js";
import {
  getRadioQueueState,
  recordExplicitRadioTracks,
  setRadioRecentArtists,
} from "./radio-state.js";

export type Logger = {
  readonly info: (
    msg: string,
    meta?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly warn: (
    msg: string,
    meta?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly error: (
    msg: string,
    meta?: Readonly<Record<string, unknown>>,
  ) => void;
};

export type ReplenishPipelineDeps = {
  readonly lmsClient: LmsClient;
  readonly logger: Logger;
  readonly io: TypedSocketIOServer;
  readonly playerId: string;
};

export type ReplenishPipelineInput = {
  /** Final candidate list — already shuffled, filtered, and seed-excluded per mode. */
  readonly candidates: readonly CandidateTrack[];
  readonly trigger: ReplenishTrigger;
  /** Extra fields merged into every pipeline log call (e.g. seedArtist/seedTitle). */
  readonly logContext?: Readonly<Record<string, unknown>>;
  /** Mode commit hook (page/cycle counter) — called with the sliding-window write on success. */
  readonly onCommit?: () => void;
  /**
   * Re-check for radio mode being disabled mid-flight (generic path only).
   * Returns the outcome to surface when disabled, or null to continue.
   */
  readonly checkDisabled?: () => ReplenishOutcome | null;
  /** Queue-end-only freshness re-check → `queue-refilled` skip (generic path only). */
  readonly recheckQueueFreshness?: boolean;
  /** Overrides the outcome error string when the post-add queue refresh fails. */
  readonly refreshFailureError?: string;
};

export const runReplenishPipeline = async (
  deps: ReplenishPipelineDeps,
  input: ReplenishPipelineInput,
): Promise<ReplenishOutcome> => {
  const { lmsClient, logger, io, playerId } = deps;
  const { candidates, trigger } = input;
  const logContext = input.logContext ?? {};

  // Capture pre-radio queue snapshot for repeat protection and an accurate
  // radioBoundaryIndex. LMS keeps previously played tracks in the queue even
  // after mode→stop, so we measure BEFORE adding radio tracks.
  const preRadioQueueResult = await lmsClient.getQueue();
  if (!preRadioQueueResult.ok || preRadioQueueResult.value === undefined) {
    const queueFetchError = preRadioQueueResult.ok
      ? "Unknown queue fetch failure"
      : (preRadioQueueResult.error?.message ?? "Unknown queue fetch failure");
    logger.warn(
      "Radio: could not get pre-radio queue length — replenish aborted",
      {
        event: "radio.queue_length_fetch_failed",
        trigger,
        error: queueFetchError,
        ...logContext,
      },
    );
    return {
      status: "failed",
      reason: "queue-fetch-failed",
      error: queueFetchError,
    };
  }
  const preRadioQueueLength = preRadioQueueResult.value.length;
  const { repeatKeys: queuedTrackRepeatKeys, urlKeys: queuedTrackUrlKeys } =
    buildQueueKeySets(preRadioQueueResult.value);

  const disabledAfterQueueSnapshot = input.checkDisabled?.() ?? null;
  if (disabledAfterQueueSnapshot !== null) {
    return disabledAfterQueueSnapshot;
  }

  if (input.recheckQueueFreshness === true && trigger === "queue-end") {
    const queueFreshnessResult = await lmsClient.getQueue();
    if (
      queueFreshnessResult.ok &&
      queueFreshnessResult.value !== undefined &&
      queueFreshnessResult.value.length > preRadioQueueLength
    ) {
      logger.info(
        "Radio: queue-end replenish skipped because queue was refilled",
        {
          event: "radio.queue_refilled_before_replenish",
          trigger,
          preRadioQueueLength,
          refreshedQueueLength: queueFreshnessResult.value.length,
          ...logContext,
        },
      );
      return { status: "skipped", reason: "queue-refilled" };
    }
  }

  // Search LMS for each candidate and add to queue (sequential — avoids
  // overwhelming LMS). Process ALL candidates until the batch is full.
  const targetBatchSize = computeTargetBatchSize(trigger);

  const { artists: addedArtists, trackKeys: addedTrackKeys } =
    await candidates.reduce(
      async (accPromise: Promise<RadioAcc>, candidate): Promise<RadioAcc> => {
        const acc = await accPromise;
        const disabledDuringBatch = input.checkDisabled?.() ?? null;
        if (disabledDuringBatch !== null) {
          return acc;
        }

        // Batch is full — skip remaining candidates
        if (acc.artists.length >= targetBatchSize) {
          return acc;
        }

        // Skip if artist already added in this batch (NFD-normalized bidirectional
        // match) — checked BEFORE searching LMS so duplicates cost no searches.
        if (
          acc.artists.some((added) => artistMatches(added, candidate.artist))
        ) {
          logger.info(
            "Radio: skipping duplicate artist in batch — artist already queued in this batch",
            {
              event: "radio.duplicate_artist_skipped",
              trigger,
              artist: candidate.artist,
              title: candidate.name,
              ...logContext,
            },
          );
          return acc;
        }

        const queryResults = await buildRadioSearchQueries(
          candidate.artist,
          candidate.name,
        ).reduce<Promise<readonly SearchResult[]>>(
          async (resultPromise, query) => {
            const previousResults = await resultPromise;
            if (previousResults.length > 0) {
              return previousResults;
            }

            const searchResult = await lmsClient.search(query);
            if (!searchResult.ok || searchResult.value.tracks.length === 0) {
              return [];
            }

            return searchResult.value.tracks.filter((r) =>
              artistMatches(r.artist, candidate.artist),
            );
          },
          Promise.resolve([] as readonly SearchResult[]),
        );
        if (queryResults.length === 0) {
          logger.warn("Radio: track not found in LMS — skipped", {
            event: "radio.track_not_found",
            trigger,
            artist: candidate.artist,
            title: candidate.name,
            ...logContext,
          });
          return acc;
        }

        // Select best quality track using source hierarchy scoring + tie-breaking
        const selectResult = selectBestTrackUrl(queryResults);
        if (selectResult.selectionError !== undefined) {
          logger.warn(
            "Radio: source hierarchy selection failed — using fallback lossless/bitrate comparison",
            {
              event: "radio.source_hierarchy_fallback",
              trigger,
              artist: candidate.artist,
              title: candidate.name,
              selectionError: selectResult.selectionError.type,
              selectionMessage: selectResult.selectionError.message,
              ...logContext,
            },
          );
        }
        const bestUrl = selectResult.url;
        const bestUrlKey = getTrackUrlKey({ url: bestUrl });
        if (bestUrl === undefined || bestUrlKey === undefined) {
          logger.warn("Radio: could not determine best track URL — skipped", {
            event: "radio.no_best_url",
            trigger,
            artist: candidate.artist,
            title: candidate.name,
            ...logContext,
          });
          return acc;
        }

        const repeatKey = computeRepeatKey(queryResults, bestUrl, candidate);
        const verdict = evaluateCandidateForBatch({
          acc,
          queuedRepeatKeys: queuedTrackRepeatKeys,
          queuedUrlKeys: queuedTrackUrlKeys,
          candidateArtist: candidate.artist,
          repeatKey,
          urlKey: bestUrlKey,
        });
        // Unreachable: the intra-batch artist check ran before the LMS search
        // against the same accumulator. Kept for verdict exhaustiveness.
        if (verdict === "batch-artist-duplicate") {
          return acc;
        }
        if (verdict === "recent-duplicate") {
          logger.info("Radio: skipping recent duplicate track", {
            event: "radio.recent_duplicate_skipped",
            trigger,
            artist: candidate.artist,
            title: candidate.name,
            ...logContext,
          });
          return acc;
        }
        if (verdict === "batch-url-duplicate") {
          logger.warn(
            "Radio: skipping duplicate URL — track already in queue batch",
            {
              event: "radio.duplicate_url_skipped",
              trigger,
              artist: candidate.artist,
              title: candidate.name,
              url: bestUrl,
              ...logContext,
            },
          );
          return acc;
        }

        const addResult = await lmsClient.addToQueue(bestUrl);
        if (!addResult.ok) {
          logger.warn("Radio: addToQueue failed — skipped", {
            event: "radio.add_to_queue_failed",
            trigger,
            artist: candidate.artist,
            title: candidate.name,
            error: addResult.error,
            ...logContext,
          });
          return acc;
        }

        logger.info("Radio: track added to queue", {
          event: "radio.track_queued",
          trigger,
          artist: candidate.artist,
          title: candidate.name,
          ...logContext,
        });
        return acceptIntoBatch(acc, candidate.artist, bestUrlKey, repeatKey);
      },
      Promise.resolve({
        artists: [] as readonly string[],
        urls: [] as readonly string[],
        trackKeys: [] as readonly string[],
      }),
    );

  if (addedArtists.length === 0) {
    const disabledWithoutAdds = input.checkDisabled?.() ?? null;
    if (disabledWithoutAdds !== null) {
      return disabledWithoutAdds;
    }
    logger.warn("Radio: no tracks could be added to queue", {
      event: "radio.batch_empty",
      trigger,
      ...logContext,
    });
    return { status: "skipped", reason: "batch-empty" };
  }

  // Advance playback if the player stopped while we were adding tracks.
  const disabledBeforeAdvance = input.checkDisabled?.() ?? null;
  if (disabledBeforeAdvance !== null) {
    return disabledBeforeAdvance;
  }

  // On queue-end, LMS can still consider the seed track current after stop; resume()
  // may replay that just-finished track instead of moving into the newly queued radio track.
  // nextTrack() advances onto the first appended radio item. For queue-remove replenishment,
  // we do not force playback movement because playback may still be progressing normally.
  const currentStatusResult = await lmsClient.getStatus();
  if (currentStatusResult.ok && currentStatusResult.value?.mode === "stop") {
    const resumeResult =
      trigger === "queue-end"
        ? await lmsClient.nextTrack()
        : await lmsClient.resume();
    if (resumeResult.ok) {
      logger.info(
        trigger === "queue-end"
          ? "Radio: advanced to first radio track after queue-end stop"
          : "Radio: auto-resumed playback after adding tracks to stopped player",
        {
          event:
            trigger === "queue-end"
              ? "radio.auto_advanced"
              : "radio.auto_resumed",
          trigger,
          ...logContext,
        },
      );
    } else {
      logger.warn(
        trigger === "queue-end"
          ? "Radio: could not advance to first radio track — player remains stopped"
          : "Radio: auto-resume failed — player remains stopped",
        {
          event:
            trigger === "queue-end"
              ? "radio.auto_advance_failed"
              : "radio.auto_resume_failed",
          trigger,
          error: resumeResult.error,
          ...logContext,
        },
      );
    }
  } else if (!currentStatusResult.ok) {
    logger.warn(
      "Radio: could not check player status for auto-resume — skipping",
      {
        event: "radio.status_check_failed",
        trigger,
        error: currentStatusResult.error,
        ...logContext,
      },
    );
  }

  // Update sliding window state + commit mode counters
  const nextRecentArtists = addedArtists.reduce(
    (window, artist) =>
      addToSlidingWindow(window, artist, DEFAULT_DIVERSITY_CONFIG.windowSize),
    getRadioQueueState().recentArtists,
  );
  setRadioRecentArtists(nextRecentArtists);
  input.onCommit?.();
  const disabledBeforeRefresh = input.checkDisabled?.() ?? null;
  if (disabledBeforeRefresh !== null) {
    return disabledBeforeRefresh;
  }

  // Fetch updated queue and emit player.queue.updated
  const queueResult = await lmsClient.getQueue();
  if (!queueResult.ok || queueResult.value === undefined) {
    const queueRefreshError = queueResult.ok
      ? "Unknown queue refresh failure"
      : (queueResult.error?.message ?? "Unknown queue refresh failure");
    logger.warn(
      "Radio: could not fetch updated queue — replenish failed after add",
      {
        event: "radio.queue_fetch_failed",
        trigger,
        error: queueRefreshError,
        ...logContext,
      },
    );
    return {
      status: "failed",
      reason: "queue-fetch-failed",
      error: input.refreshFailureError ?? queueRefreshError,
    };
  }

  const queueProjection = recordExplicitRadioTracks(
    queueResult.value,
    addedTrackKeys,
  );
  io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
    playerId,
    tracks: queueProjection.tracks,
    radioModeActive: queueProjection.radioModeActive,
    radioBoundaryIndex: queueProjection.radioBoundaryIndex ?? undefined,
    timestamp: Date.now(),
  });

  logger.info("Radio replenish succeeded", {
    event: "radio.replenish_succeeded",
    trigger,
    tracksAdded: addedArtists.length,
    radioBoundaryIndex: queueProjection.radioBoundaryIndex,
    ...logContext,
  });

  return {
    status: "success",
    tracksAdded: addedArtists.length,
  };
};
