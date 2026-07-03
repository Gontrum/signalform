/**
 * Radio Mode — Genre radio candidate sourcing (imperative shell)
 *
 * Sources candidates for genre radio from last.fm tag.getTopTracks (paged)
 * and hands the final candidate list to the shared replenish pipeline.
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
import { getRadioQueueState, incrementGenreRadioPage } from "./radio-state.js";
import { runReplenishPipeline } from "./replenish-pipeline.js";
import type { ReplenishPipelineDeps } from "./replenish-pipeline.js";

export type ReplenishGenreDeps = ReplenishPipelineDeps & {
  readonly lastFmClient: LastFmClient;
};

export const replenishGenreQueue = async (
  deps: ReplenishGenreDeps,
  genreContext: { readonly genreName: string; readonly page: number },
  trigger: ReplenishTrigger,
): Promise<ReplenishOutcome> => {
  const { lastFmClient, logger, io, playerId } = deps;
  const { genreName, page } = genreContext;

  const tagTracksResult = await lastFmClient.getTagTopTracks(
    genreName,
    page,
    50,
  );
  if (!tagTracksResult.ok) {
    if (tagTracksResult.error.type === "CircuitOpenError") {
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
    logger.warn("Genre Radio: tag.getTopTracks failed", {
      event: "radio.genre_lastfm_failed",
      trigger,
      genreName,
      page,
      error: tagTracksResult.error,
    });
    return { status: "skipped", reason: "lastfm-unavailable" };
  }

  if (tagTracksResult.value.length === 0) {
    logger.info("Genre Radio: no more tracks from Last.fm for this genre", {
      event: "radio.genre_no_more_tracks",
      trigger,
      genreName,
      page,
    });
    return { status: "skipped", reason: "no-candidates" };
  }

  const shuffled = shuffleWithRandom(tagTracksResult.value, Math.random);

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
    logContext: { genreName, page },
    onCommit: incrementGenreRadioPage,
    refreshFailureError: "Queue refresh failed after genre radio add",
  });
};
