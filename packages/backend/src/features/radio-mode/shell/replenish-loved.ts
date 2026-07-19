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
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_RADIO_UNAVAILABLE,
} from "../../../infrastructure/websocket/index.js";
import type {
  CandidateTrack,
  ReplenishOutcome,
  ReplenishTrigger,
} from "../core/types.js";
import { DEFAULT_DIVERSITY_CONFIG } from "../core/types.js";
import { filterByDiversity } from "../core/diversity-service.js";
import { shuffleWithRandom } from "../core/replenish.js";
import type { RadioUnavailablePayload } from "@signalform/shared";
import { getRadioQueueState } from "./radio-state.js";
import type { LovedRadioContext } from "./radio-state.js";
import { runReplenishPipeline } from "./replenish-pipeline.js";
import type { ReplenishPipelineDeps } from "./replenish-pipeline.js";

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

  const shuffled = shuffleWithRandom(lovedTracksResult.value, Math.random);

  const candidates: readonly CandidateTrack[] = shuffled.map((t) => ({
    name: t.name,
    artist: t.artist,
    match: 1,
    url: t.url,
  }));

  const diversityFiltered = filterByDiversity(
    candidates,
    getRadioQueueState().recentArtists,
    DEFAULT_DIVERSITY_CONFIG,
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
