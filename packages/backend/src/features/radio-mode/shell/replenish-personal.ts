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
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_RADIO_UNAVAILABLE,
} from "../../../infrastructure/websocket/index.js";
import type { RadioUnavailablePayload } from "@signalform/shared";
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

/** Reason discovery yielded nothing and the comfort channel runs instead. */
type DiscoveryFallThrough = {
  readonly fellBack: "no-candidates" | "batch-empty" | "lastfm-error";
};

export const replenishPersonalRadioQueue = async (
  deps: ReplenishPersonalDeps,
  context: PersonalRadioContext,
  trigger: ReplenishTrigger,
): Promise<ReplenishOutcome> => {
  const { lastFmClient, logger, io, playerId } = deps;
  const { username, seedArtists, neighbours, cycle } = context;

  // Mirrors the genre path: circuit open → tell the frontend radio is down.
  const emitRadioUnavailable = (): ReplenishOutcome => {
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
  };

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

    const discoveryOutcome: ReplenishOutcome | DiscoveryFallThrough =
      !tracksResult.ok
        ? // A last.fm failure (incl. circuit open) degrades to the comfort
          // channel; the comfort flow owns the terminal last.fm error handling.
          { fellBack: "lastfm-error" }
        : tracksResult.value.length === 0
          ? { fellBack: "no-candidates" }
          : await (async (): Promise<
              ReplenishOutcome | DiscoveryFallThrough
            > => {
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
                return { fellBack: "no-candidates" };
              }

              const shuffled = shuffleWithRandom(candidates, Math.random);

              const diversityFiltered = filterByDiversity(
                shuffled,
                getRadioQueueState().recentArtists,
                DEFAULT_DIVERSITY_CONFIG,
              );

              if (diversityFiltered.length === 0) {
                return { fellBack: "no-candidates" };
              }

              const outcome = await runReplenishPipeline(deps, {
                candidates: diversityFiltered,
                trigger,
                logContext: { username, neighbourUsername, cycle },
                onCommit: incrementPersonalRadioCycle,
                refreshFailureError:
                  "Queue refresh failed after personal radio discovery add",
              });

              // Empty batch falls through to the comfort channel
              return outcome.status === "skipped" &&
                outcome.reason === "batch-empty"
                ? { fellBack: "batch-empty" }
                : outcome;
            })();

    if (!("fellBack" in discoveryOutcome)) {
      return discoveryOutcome;
    }

    // Graceful degradation: discovery yielded nothing → comfort channel runs
    // in the same call. Logged so the fallback is visible in operations.
    logger.info("Personal Radio: discovery fell back to comfort", {
      event: "radio.discovery_fell_back_to_comfort",
      channel: "discovery",
      reason: discoveryOutcome.fellBack,
      trigger,
      username,
      neighbourUsername,
      cycle,
    });
    // Fall through to comfort channel
  }

  // Rotate through seed artists by cycle
  const seedArtist = seedArtists[cycle % seedArtists.length]!;

  // Get similar artists for this seed
  const similarResult = await lastFmClient.getSimilarArtists(seedArtist, 20);
  if (!similarResult.ok) {
    if (similarResult.error.type === "CircuitOpenError") {
      return emitRadioUnavailable();
    }
    logger.warn("Personal Radio: artist.getSimilar failed", {
      event: "radio.personal_lastfm_failed",
      trigger,
      username,
      seedArtist,
      cycle,
      error: similarResult.error,
    });
    return { status: "skipped", reason: "lastfm-unavailable" };
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

  // Partial fetch failures are tolerated — but when every fetch failed with
  // the circuit open, last.fm is down and the circuit branch applies.
  if (
    trackResults.length > 0 &&
    trackResults.every((r) => !r.ok && r.error.type === "CircuitOpenError")
  ) {
    return emitRadioUnavailable();
  }

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
