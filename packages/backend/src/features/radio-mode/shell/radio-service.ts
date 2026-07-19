/**
 * Radio Mode — Imperative Shell
 *
 * Orchestrates radio mode: detects queue-end trigger, fetches similar tracks from last.fm,
 * applies functional filters (Stories 6.2 + 6.3), searches LMS, adds to queue.
 *
 * Imperative shell: has IO, state, and side effects.
 * Per-mode candidate sourcing lives in replenish-personal.ts and
 * replenish-genre.ts; the shared queue-facing pipeline lives in
 * replenish-pipeline.ts; all pure logic lives in the core/ modules.
 */

import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import { filterByContext } from "../core/service.js";
import { filterByDiversity } from "../core/diversity-service.js";
import { DEFAULT_DIVERSITY_CONFIG } from "../core/types.js";
import type {
  CandidateTrack,
  ReplenishOutcome,
  ReplenishTrigger,
} from "../core/types.js";
import {
  chooseEffectiveCandidates,
  excludeSeedArtist,
} from "../core/replenish.js";
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_RADIO_STARTED,
  PLAYER_QUEUE_UPDATED,
  PLAYER_RADIO_UNAVAILABLE,
} from "../../../infrastructure/websocket/index.js";
import type { RadioUnavailablePayload } from "@signalform/shared";
import {
  annotateRadioQueueTracks,
  clearRadioQueueRuntimeState,
  getRadioQueueState,
  isRadioModeEnabledForReplenishment,
  resetRadioRuntimeState,
  setRadioModeEnabledState,
  setRadioProcessing,
  setRequestedRadioModeEnabledState,
} from "./radio-state.js";
import { getUpcomingRadioRemovalIndexes } from "../core/lifecycle.js";
import { runReplenishPipeline } from "./replenish-pipeline.js";
import type { Logger } from "./replenish-pipeline.js";
import { replenishPersonalRadioQueue } from "./replenish-personal.js";
import { replenishGenreQueue } from "./replenish-genre.js";
import { replenishLovedRadioQueue } from "./replenish-loved.js";

// Number of similar tracks to fetch from last.fm (larger pool = better filtering results)
const LASTFM_SIMILAR_LIMIT = 50;

export type RadioEngine = {
  readonly handleQueueEnd: (
    seedArtist: string,
    seedTitle: string,
  ) => Promise<void>;
  readonly replenishAfterRemoval: (
    seedArtist: string,
    seedTitle: string,
  ) => Promise<ReplenishOutcome>;
  readonly setModeEnabled: (enabled: boolean) => Promise<
    | {
        readonly status: "success";
        readonly queueProjection: ReturnType<typeof annotateRadioQueueTracks>;
      }
    | {
        readonly status: "failed";
        readonly reason: "busy" | "queue-fetch-failed" | "queue-update-failed";
        readonly error: string;
      }
  >;
};

export const createRadioEngine = (
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
  io: TypedSocketIOServer,
  playerId: string,
  logger: Logger,
): RadioEngine => {
  resetRadioRuntimeState();

  const pipelineDeps = { lmsClient, logger, io, playerId } as const;
  const modeDeps = { ...pipelineDeps, lastFmClient } as const;

  const getDisabledReplenishOutcome = (
    trigger: ReplenishTrigger,
    seedArtist: string,
    seedTitle: string,
  ): ReplenishOutcome | undefined => {
    if (isRadioModeEnabledForReplenishment()) {
      return undefined;
    }

    logger.info("Radio: replenish aborted because radio mode was disabled", {
      event: "radio.replenish_aborted_disabled",
      trigger,
      seedArtist,
      seedTitle,
    });
    return { status: "skipped", reason: "disabled" };
  };

  const replenishRadioQueue = async (
    seedArtist: string,
    seedTitle: string,
    trigger: ReplenishTrigger,
  ): Promise<ReplenishOutcome> => {
    // Concurrency guard: proactive + stop triggers can both fire in edge cases.
    // Drop the second call while first is in progress to avoid duplicate queue adds
    // and recentArtists race conditions (Node.js is single-threaded but async yields allow re-entry).
    if (getRadioQueueState().isProcessing) {
      logger.info(
        "Radio: replenish skipped — radio operation already in progress",
        {
          event: "radio.replenish_skipped_busy",
          trigger,
          seedArtist,
          seedTitle,
        },
      );
      return { status: "skipped", reason: "already-processing" };
    }
    setRadioProcessing(true);
    // Top-level try/catch: guards against unexpected JS errors (TypeErrors, etc.).
    // AC6: radio must not crash the server. handleQueueEnd is called with void() from
    // status-poller — unhandled promise rejections are fatal in Node.js 15+.
    // Result-type errors (last.fm / LMS failures) are handled inline below.
    return Promise.resolve()
      .then(async (): Promise<ReplenishOutcome> => {
        // Dispatch to genre-specific replenish when genre radio mode is active
        const genreContext = getRadioQueueState().genreRadioContext;
        if (genreContext !== undefined) {
          return replenishGenreQueue(modeDeps, genreContext, trigger);
        }

        // Dispatch to personal radio replenish when personal radio mode is active
        const personalContext = getRadioQueueState().personalRadioContext;
        if (personalContext !== undefined) {
          return replenishPersonalRadioQueue(
            modeDeps,
            personalContext,
            trigger,
          );
        }

        // Dispatch to loved radio replenish when loved radio mode is active
        const lovedContext = getRadioQueueState().lovedRadioContext;
        if (lovedContext !== undefined) {
          return replenishLovedRadioQueue(modeDeps, lovedContext, trigger);
        }

        logger.info("Radio replenish triggered", {
          event: "radio.replenish_started",
          trigger,
          seedArtist,
          seedTitle,
        });

        // Step 1: Fetch similar tracks from last.fm
        const similarResult = await lastFmClient.getSimilarTracks(
          seedArtist,
          seedTitle,
          LASTFM_SIMILAR_LIMIT,
        );
        const disabledAfterSimilarFetch = getDisabledReplenishOutcome(
          trigger,
          seedArtist,
          seedTitle,
        );
        if (disabledAfterSimilarFetch !== undefined) {
          return disabledAfterSimilarFetch;
        }
        if (!similarResult.ok) {
          if (similarResult.error.type === "CircuitOpenError") {
            logger.warn(
              "Radio: last.fm circuit open — radio temporarily unavailable",
              { event: "radio.circuit_open", trigger },
            );
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
          }
          logger.warn("Radio: last.fm fetch failed — radio aborted", {
            event: "radio.lastfm_fetch_failed",
            trigger,
            error: similarResult.error,
            seedArtist,
            seedTitle,
          });
          return { status: "skipped", reason: "lastfm-unavailable" };
        }

        // Step 2: Map SimilarTrack → CandidateTrack
        // CandidateTrack.year + .genres enrichment was not implemented in Story 6.4 —
        // filterByContext with {} provides graceful degradation (passes all candidates)
        // when seedYear and seedGenres are absent (AC5 of Story 6.2).
        const candidates: readonly CandidateTrack[] = similarResult.value.map(
          (t) => ({
            name: t.name,
            artist: t.artist,
            mbid: t.mbid !== "" ? t.mbid : undefined,
            match: t.match,
            duration:
              t.duration !== undefined && t.duration > 0
                ? t.duration
                : undefined,
            // last.fm page URL — stored per CandidateTrack type contract;
            // LMS playback URL is determined separately by lmsClient.search()
            url: t.url,
          }),
        );

        // Step 2.5: Fallback to artist.getSimilar when track.getSimilar yields nothing.
        // Happens for new releases or tracks with insufficient scrobble history on last.fm.
        // buildRadioSearchQueries("Artist", "") → ["Artist"] so LMS finds any track by that artist.
        if (candidates.length === 0) {
          logger.info(
            "Radio: track.getSimilar returned no results — falling back to artist.getSimilar",
            {
              event: "radio.fallback_to_similar_artists",
              trigger,
              seedArtist,
              seedTitle,
            },
          );
        }
        const artistFallbackResult =
          candidates.length === 0
            ? await lastFmClient.getSimilarArtists(
                seedArtist,
                LASTFM_SIMILAR_LIMIT,
              )
            : null;

        if (artistFallbackResult !== null) {
          const disabledAfterArtistFetch = getDisabledReplenishOutcome(
            trigger,
            seedArtist,
            seedTitle,
          );
          if (disabledAfterArtistFetch !== undefined) {
            return disabledAfterArtistFetch;
          }
          if (
            !artistFallbackResult.ok ||
            artistFallbackResult.value.length === 0
          ) {
            logger.warn("Radio: artist.getSimilar also returned no results", {
              event: "radio.fallback_to_similar_artists_failed",
              trigger,
              seedArtist,
              seedTitle,
            });
          }
        }

        const artistFallbackCandidates: readonly CandidateTrack[] =
          artistFallbackResult?.ok === true
            ? artistFallbackResult.value.map((a) => ({
                name: "",
                artist: a.name,
                match: a.match,
                mbid: a.mbid,
                url: a.url,
              }))
            : [];
        const effectiveCandidates = chooseEffectiveCandidates(
          candidates,
          artistFallbackCandidates,
        );

        // Step 3: Apply functional core filters
        // filterByContext gracefully passes all when no seedYear/seedGenres given
        const contextFiltered = filterByContext(effectiveCandidates, {});
        const diversityFiltered = filterByDiversity(
          contextFiltered,
          getRadioQueueState().recentArtists,
          DEFAULT_DIVERSITY_CONFIG,
        );

        // Step 3.5: Exclude seed artist from candidates (AC5/AC6 Story 9.17).
        // Radio should recommend OTHER artists — the seed artist is already known to the user.
        // Uses existing artistMatches() for NFD-normalized bidirectional includes-check.
        const seedArtistFiltered = excludeSeedArtist(
          diversityFiltered,
          seedArtist,
        );
        if (seedArtistFiltered.length < diversityFiltered.length) {
          logger.info("Radio: seed artist excluded from candidates", {
            event: "radio.seed_artist_excluded",
            trigger,
            seedArtist,
            excluded: diversityFiltered.length - seedArtistFiltered.length,
          });
        }

        // Step 4: Guard empty candidate list
        if (seedArtistFiltered.length === 0) {
          logger.warn("Radio: no candidates after filtering — radio aborted", {
            event: "radio.no_candidates",
            trigger,
            seedArtist,
            seedTitle,
            totalCandidates: effectiveCandidates.length,
            afterContext: contextFiltered.length,
            afterDiversity: diversityFiltered.length,
            afterSeedExclusion: seedArtistFiltered.length,
          });
          return { status: "skipped", reason: "no-candidates" };
        }

        // Steps 4.5–7: shared replenish pipeline (queue snapshot, batch add,
        // status advance, sliding window, queue refresh + emit)
        return runReplenishPipeline(pipelineDeps, {
          candidates: seedArtistFiltered,
          trigger,
          logContext: { seedArtist, seedTitle },
          checkDisabled: () =>
            getDisabledReplenishOutcome(trigger, seedArtist, seedTitle) ?? null,
          recheckQueueFreshness: true,
        });
      })
      .catch((error: unknown): ReplenishOutcome => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          "Radio: unexpected error in replenish flow — radio aborted",
          {
            event: "radio.unexpected_error",
            trigger,
            error: message,
            seedArtist,
            seedTitle,
          },
        );
        return {
          status: "failed",
          reason: "unexpected-error",
          error: message,
        };
      })
      .finally(() => {
        setRadioProcessing(false);
      });
  };

  const handleQueueEnd = async (
    seedArtist: string,
    seedTitle: string,
  ): Promise<void> => {
    if (!isRadioModeEnabledForReplenishment()) {
      logger.info(
        "Radio: queue-end trigger ignored because radio mode is disabled",
        {
          event: "radio.queue_end_skipped_disabled",
          seedArtist,
          seedTitle,
        },
      );
      return;
    }

    const replenishResult = await replenishRadioQueue(
      seedArtist,
      seedTitle,
      "queue-end",
    );

    if (replenishResult.status !== "success") {
      return;
    }

    // Step 8: Emit player.radio.started
    io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_RADIO_STARTED, {
      playerId,
      seedTrack: { artist: seedArtist, title: seedTitle },
      tracksAdded: replenishResult.tracksAdded,
      timestamp: Date.now(),
    });

    logger.info("Radio mode started successfully", {
      event: "radio.started",
      seedArtist,
      seedTitle,
      tracksAdded: replenishResult.tracksAdded,
    });
  };

  const replenishAfterRemoval = async (
    seedArtist: string,
    seedTitle: string,
  ): Promise<ReplenishOutcome> => {
    if (!isRadioModeEnabledForReplenishment()) {
      logger.info(
        "Radio: removal replenish ignored because radio mode is disabled",
        {
          event: "radio.remove_skipped_disabled",
          seedArtist,
          seedTitle,
        },
      );
      return { status: "skipped", reason: "batch-empty" };
    }

    return replenishRadioQueue(seedArtist, seedTitle, "queue-remove");
  };

  const setModeEnabled: RadioEngine["setModeEnabled"] = async (enabled) => {
    if (getRadioQueueState().isProcessing && enabled) {
      return {
        status: "failed",
        reason: "busy",
        error: "Radio mode is currently updating the queue. Please try again.",
      };
    }

    const previousEnabledState = getRadioQueueState().isEnabled;
    const radioQueueEntriesBeforeToggle =
      getRadioQueueState().radioQueueEntries;

    if (!enabled) {
      setRequestedRadioModeEnabledState(false);
    }

    const queueResult = await lmsClient.getQueue();
    if (!queueResult.ok || queueResult.value === undefined) {
      if (!enabled) {
        setRequestedRadioModeEnabledState(undefined);
      }
      return {
        status: "failed",
        reason: "queue-fetch-failed",
        error: queueResult.ok
          ? "Unknown queue fetch failure"
          : (queueResult.error.message ?? "Unknown queue fetch failure"),
      };
    }

    const removalIndexes = !enabled
      ? getUpcomingRadioRemovalIndexes(
          queueResult.value,
          radioQueueEntriesBeforeToggle,
        )
      : [];

    const removalFailure = await removalIndexes.reduce<
      Promise<
        | undefined
        | {
            readonly status: "failed";
            readonly reason: "queue-update-failed";
            readonly error: string;
          }
      >
    >(async (failurePromise, trackIndex) => {
      const existingFailure = await failurePromise;
      if (existingFailure !== undefined) {
        return existingFailure;
      }

      const removeResult = await lmsClient.removeFromQueue(trackIndex);
      if (removeResult.ok) {
        return undefined;
      }

      return {
        status: "failed",
        reason: "queue-update-failed",
        error:
          removeResult.error.message ??
          "Could not remove radio tracks while disabling radio mode",
      };
    }, Promise.resolve(undefined));

    if (removalFailure !== undefined) {
      if (!enabled) {
        setRequestedRadioModeEnabledState(undefined);
      }
      return removalFailure;
    }

    const refreshedQueueResult = await lmsClient.getQueue();
    if (!refreshedQueueResult.ok || refreshedQueueResult.value === undefined) {
      if (!enabled) {
        setRequestedRadioModeEnabledState(undefined);
      }
      setRadioModeEnabledState(previousEnabledState);
      return {
        status: "failed",
        reason: "queue-fetch-failed",
        error: refreshedQueueResult.ok
          ? "Unknown queue refresh failure"
          : (refreshedQueueResult.error.message ??
            "Unknown queue refresh failure"),
      };
    }

    if (enabled) {
      setRequestedRadioModeEnabledState(undefined);
      setRadioModeEnabledState(true);
    } else {
      setRadioModeEnabledState(false);
      clearRadioQueueRuntimeState();
    }

    const queueProjection = annotateRadioQueueTracks(
      refreshedQueueResult.value,
    );
    io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
      playerId,
      tracks: queueProjection.tracks,
      radioModeActive: queueProjection.radioModeActive,
      radioBoundaryIndex: queueProjection.radioBoundaryIndex ?? undefined,
      timestamp: Date.now(),
    });

    logger.info("Radio mode toggled", {
      event:
        !enabled && getRadioQueueState().isProcessing
          ? "radio.disabled_during_replenish"
          : enabled
            ? "radio.enabled"
            : "radio.disabled",
      enabled,
      removedRadioTracks: removalIndexes.length,
    });

    return { status: "success", queueProjection };
  };

  return { handleQueueEnd, replenishAfterRemoval, setModeEnabled };
};
