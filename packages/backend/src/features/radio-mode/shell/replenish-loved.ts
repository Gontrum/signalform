/**
 * Radio Mode — Loved-tracks radio candidate sourcing (imperative shell)
 *
 * Sources candidates for loved radio from the user's last.fm loved tracks
 * (user.getLovedTracks) and hands the final candidate list to the shared
 * replenish pipeline. The loved list is stable, so there is no paging: the
 * shared pipeline's recent/diversity filtering keeps refills fresh.
 *
 * Imperative shell: has IO, state, and side effects. All pure decisions
 * live in the core/ modules.
 */

import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { ReplenishOutcome, ReplenishTrigger } from "../core/types.js";
import type { LovedRadioContext } from "./radio-state.js";
import {
  runReplenishPipeline,
  shuffleAndFilterByDiversity,
} from "./replenish-pipeline.js";
import type { ReplenishPipelineDeps } from "./replenish-pipeline.js";
import { skippedUnavailableOutcome } from "./emit-helpers.js";

const LOVED_TRACKS_LIMIT = 200;

export type ReplenishLovedDeps = ReplenishPipelineDeps & {
  readonly lastFmClient: LastFmClient;
};

export const replenishLovedRadioQueue = async (
  deps: ReplenishLovedDeps,
  lovedContext: LovedRadioContext,
  trigger: ReplenishTrigger,
): Promise<ReplenishOutcome> => {
  const { lastFmClient, logger, io, playerId } = deps;
  const { username } = lovedContext;

  const lovedTracksResult = await lastFmClient.getUserLovedTracks(
    username,
    LOVED_TRACKS_LIMIT,
  );
  if (!lovedTracksResult.ok) {
    if (lovedTracksResult.error.type === "CircuitOpenError") {
      return skippedUnavailableOutcome(io, playerId);
    }
    logger.warn("Loved Radio: user.getLovedTracks failed", {
      event: "radio.loved_lastfm_failed",
      trigger,
      username,
      error: lovedTracksResult.error,
    });
    return { status: "skipped", reason: "lastfm-unavailable" };
  }

  if (lovedTracksResult.value.length === 0) {
    logger.info("Loved Radio: no loved tracks from Last.fm for this user", {
      event: "radio.loved_no_more_tracks",
      trigger,
      username,
    });
    return { status: "skipped", reason: "no-candidates" };
  }

  const diversityFiltered = shuffleAndFilterByDiversity(
    lovedTracksResult.value,
  );

  if (diversityFiltered.length === 0) {
    return { status: "skipped", reason: "no-candidates" };
  }

  return runReplenishPipeline(deps, {
    candidates: diversityFiltered,
    trigger,
    logContext: { username },
    refreshFailureError: "Queue refresh failed after loved radio add",
  });
};
