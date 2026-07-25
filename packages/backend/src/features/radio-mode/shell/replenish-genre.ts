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
import type { ReplenishOutcome, ReplenishTrigger } from "../core/types.js";
import { incrementGenreRadioPage } from "./radio-state.js";
import {
  runReplenishPipeline,
  shuffleAndFilterByDiversity,
} from "./replenish-pipeline.js";
import type { ReplenishPipelineDeps } from "./replenish-pipeline.js";
import { skippedUnavailableOutcome } from "./emit-helpers.js";

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
      return skippedUnavailableOutcome(io, playerId);
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

  const diversityFiltered = shuffleAndFilterByDiversity(tagTracksResult.value);

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
