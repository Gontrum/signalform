/**
 * Radio Mode — Personal radio candidate sourcing (imperative shell)
 *
 * Sources candidates for personal radio: the discovery channel (a neighbour's
 * top tracks) and the comfort channel (similar artists to the rotating seed).
 * Hands the final candidate list to the shared replenish pipeline.
 *
 * Imperative shell: has IO, state, and side effects. All pure decisions
 * live in the core/ modules.
 */

import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type {
  CandidateTrack,
  ReplenishOutcome,
  ReplenishTrigger,
} from "../core/types.js";
import { DEFAULT_DIVERSITY_CONFIG } from "../core/types.js";
import { filterByDiversity } from "../core/diversity-service.js";
import {
  buildRecentTrackKey,
  filterRecentCandidates,
  pickSpreadSimilarArtists,
  shuffleWithRandom,
} from "../core/replenish.js";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { pickChannel } from "../../personal-radio/core/seed-merger.js";
import {
  getRadioQueueState,
  incrementPersonalRadioCycle,
} from "./radio-state.js";
import type { PersonalRadioContext } from "./radio-state.js";
import { runReplenishPipeline } from "./replenish-pipeline.js";
import type { ReplenishPipelineDeps } from "./replenish-pipeline.js";

export type ReplenishPersonalDeps = ReplenishPipelineDeps & {
  readonly lastFmClient: LastFmClient;
};

export const replenishPersonalRadioQueue = async (
  deps: ReplenishPersonalDeps,
  context: PersonalRadioContext,
  trigger: ReplenishTrigger,
): Promise<ReplenishOutcome> => {
  const { lastFmClient } = deps;
  const { username, seedArtists, neighbours, cycle } = context;

  if (seedArtists.length === 0) {
    return { status: "skipped", reason: "no-candidates" };
  }

  // Load config for discovery ratio
  const configResult = loadConfig();
  const discoveryRatio = configResult.ok
    ? configResult.value.personalRadioDiscovery
    : 0;

  const channel = pickChannel(cycle, discoveryRatio);

  // Discovery channel: fetch a neighbour's top tracks
  if (channel === "discovery" && neighbours.length > 0) {
    const neighbourUsername = neighbours[cycle % neighbours.length]!;
    const tracksResult = await lastFmClient.getUserTopTracks(
      neighbourUsername,
      "overall",
      15,
    );

    const discoveryOutcome =
      tracksResult.ok && tracksResult.value.length > 0
        ? await (async (): Promise<ReplenishOutcome | null> => {
            const recentResult = await lastFmClient.getUserRecentTracks(
              username,
              30,
            );
            const recentKeys = new Set(
              recentResult.ok
                ? recentResult.value.map((t) =>
                    buildRecentTrackKey(t.artist, t.name),
                  )
                : [],
            );

            const candidates: readonly CandidateTrack[] =
              filterRecentCandidates(tracksResult.value, recentKeys).map(
                (t) => ({
                  name: t.name,
                  artist: t.artist,
                  match: 1,
                  url: t.url,
                }),
              );

            if (candidates.length === 0) {
              return null;
            }

            const shuffled = shuffleWithRandom(candidates, Math.random);

            const diversityFiltered = filterByDiversity(
              shuffled,
              getRadioQueueState().recentArtists,
              DEFAULT_DIVERSITY_CONFIG,
            );

            if (diversityFiltered.length === 0) {
              return null;
            }

            const outcome = await runReplenishPipeline(deps, {
              candidates: diversityFiltered,
              trigger,
              logContext: { username, neighbourUsername, cycle },
              onCommit: incrementPersonalRadioCycle,
              refreshFailureError:
                "Queue refresh failed after personal radio discovery add",
            });

            // Empty batch falls through to the comfort channel (current behaviour)
            return outcome.status === "skipped" &&
              outcome.reason === "batch-empty"
              ? null
              : outcome;
          })()
        : null;

    if (discoveryOutcome !== null) {
      return discoveryOutcome;
    }
    // Fall through to comfort channel
  }

  // Rotate through seed artists by cycle
  const seedArtist = seedArtists[cycle % seedArtists.length]!;

  // Get similar artists for this seed
  const similarResult = await lastFmClient.getSimilarArtists(seedArtist, 20);
  if (!similarResult.ok) {
    return {
      status: "failed",
      reason: "queue-fetch-failed",
      error: similarResult.error.message,
    };
  }

  // Pick up to 4 similar artists (spread across the similar list by index)
  const pickedSimilar = pickSpreadSimilarArtists(
    similarResult.value.map((a) => a.name),
    4,
  );

  // Fetch top tracks for each picked artist
  const trackResults = await Promise.all(
    pickedSimilar.map((name) => lastFmClient.getArtistTopTracks(name, 8)),
  );

  const allTracks = trackResults.flatMap((r) => (r.ok ? r.value : []));

  if (allTracks.length === 0) {
    return { status: "skipped", reason: "no-candidates" };
  }

  // Exclude recently played (get recent tracks, build exclusion set)
  const recentResult = await lastFmClient.getUserRecentTracks(username, 30);
  const recentKeys = new Set(
    recentResult.ok
      ? recentResult.value.map((t) => buildRecentTrackKey(t.artist, t.name))
      : [],
  );

  const candidates: readonly CandidateTrack[] = filterRecentCandidates(
    allTracks,
    recentKeys,
  ).map((t) => ({ name: t.name, artist: t.artist, match: 1, url: t.url }));

  if (candidates.length === 0) {
    return { status: "skipped", reason: "no-candidates" };
  }

  const shuffled = shuffleWithRandom(candidates, Math.random);

  const diversityFiltered = filterByDiversity(
    shuffled,
    getRadioQueueState().recentArtists,
    DEFAULT_DIVERSITY_CONFIG,
  );

  if (diversityFiltered.length === 0) {
    return { status: "skipped", reason: "no-candidates" };
  }

  return runReplenishPipeline(deps, {
    candidates: diversityFiltered,
    trigger,
    logContext: { username, seedArtist, cycle },
    onCommit: incrementPersonalRadioCycle,
    refreshFailureError: "Queue refresh failed after personal radio add",
  });
};
