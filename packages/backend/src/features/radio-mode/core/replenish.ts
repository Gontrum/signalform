/**
 * Radio Mode — Replenish decisions (functional core): pure batch/dedup/candidate
 * logic shared by all replenish orchestrators.
 *
 * Functional core: pure synchronous functions, no side effects, no I/O.
 */

import type { QueueTrack } from "@signalform/shared";
import type { SearchResult } from "../../../adapters/lms-client/index.js";
import {
  getQueueTrackRepeatKey,
  getSearchResultRepeatKey,
  getTrackUrlKey,
} from "./identity.js";
import { artistMatches } from "./track-selection.js";
import type { CandidateTrack, RadioAcc, ReplenishTrigger } from "./types.js";
import { RADIO_BATCH_SIZE, RADIO_REMOVAL_REPLENISH_SIZE } from "./types.js";

/**
 * How many tracks a replenish run should add: removals top up a single track,
 * queue-end refills a full batch.
 */
export const computeTargetBatchSize = (trigger: ReplenishTrigger): number =>
  trigger === "queue-remove" ? RADIO_REMOVAL_REPLENISH_SIZE : RADIO_BATCH_SIZE;

/**
 * Build the repeat-protection key sets from a queue snapshot:
 * artist/title repeat keys for every track, plus URL keys for tracks that have one.
 */
export const buildQueueKeySets = (
  tracks: readonly QueueTrack[],
): {
  readonly repeatKeys: readonly string[];
  readonly urlKeys: readonly string[];
} => ({
  repeatKeys: tracks.map(getQueueTrackRepeatKey),
  urlKeys: tracks.flatMap((track) => {
    const urlKey = getTrackUrlKey(track);
    return urlKey === undefined ? [] : [urlKey];
  }),
});

/**
 * Repeat key for the track about to be queued: prefer the LMS search result
 * matching the selected URL; fall back to the last.fm candidate's artist/title.
 */
export const computeRepeatKey = (
  queryResults: readonly SearchResult[],
  bestUrl: string,
  candidate: { readonly artist: string; readonly name: string },
): string => {
  const bestResult =
    queryResults.find((result) => result.url === bestUrl) ?? null;
  return bestResult !== null
    ? getSearchResultRepeatKey(bestResult)
    : getQueueTrackRepeatKey({
        artist: candidate.artist,
        title: candidate.name,
      });
};

export type BatchCandidateVerdict =
  | "accept"
  | "batch-artist-duplicate"
  | "recent-duplicate"
  | "batch-url-duplicate";

/**
 * Decide whether a resolved candidate may join the current batch.
 * Verdict priority mirrors the shell's generic replenish path:
 * intra-batch artist diversity, then recent/queued repeat protection,
 * then intra-batch URL deduplication.
 */
export const evaluateCandidateForBatch = (input: {
  readonly acc: RadioAcc;
  readonly queuedRepeatKeys: readonly string[];
  readonly queuedUrlKeys: readonly string[];
  readonly candidateArtist: string;
  readonly repeatKey: string;
  readonly urlKey: string;
}): BatchCandidateVerdict => {
  const { acc, queuedRepeatKeys, queuedUrlKeys, candidateArtist } = input;
  const { repeatKey, urlKey } = input;

  if (acc.artists.some((added) => artistMatches(added, candidateArtist))) {
    return "batch-artist-duplicate";
  }
  if (
    acc.trackKeys.includes(repeatKey) ||
    queuedRepeatKeys.includes(repeatKey) ||
    queuedUrlKeys.includes(urlKey)
  ) {
    return "recent-duplicate";
  }
  if (acc.urls.includes(urlKey)) {
    return "batch-url-duplicate";
  }
  return "accept";
};

/** Record an accepted track in the batch accumulator (all three dedup axes). */
export const acceptIntoBatch = (
  acc: RadioAcc,
  artist: string,
  urlKey: string,
  repeatKey: string,
): RadioAcc => ({
  artists: [...acc.artists, artist],
  urls: [...acc.urls, urlKey],
  trackKeys: [...acc.trackKeys, repeatKey],
});

/**
 * Fisher-Yates shuffle via reduce, with the random source injected
 * (`random` must return a number in [0, 1) — e.g. Math.random in the shell).
 */
export const shuffleWithRandom = <T>(
  items: readonly T[],
  random: () => number,
): readonly T[] =>
  Array.from({ length: items.length }, (_, i) => i).reduce<readonly T[]>(
    (acc, _, i) => {
      const remaining = items.length - i;
      const j = Math.floor(random() * remaining);
      const item = acc[j]!;
      const last = acc[remaining - 1]!;
      return acc.map((el, idx) =>
        idx === j ? last : idx === remaining - 1 ? item : el,
      );
    },
    [...items],
  );

/**
 * Exclusion key for recently played tracks.
 * Deliberately distinct from identity.ts repeat keys ("|||" vs "::").
 */
export const buildRecentTrackKey = (artist: string, name: string): string =>
  `${artist.toLowerCase()}|||${name.toLowerCase()}`;

/** Drop candidates whose artist/name key appears in the recently-played set. */
export const filterRecentCandidates = <
  T extends { readonly artist: string; readonly name: string },
>(
  candidates: readonly T[],
  recentKeys: ReadonlySet<string>,
): readonly T[] =>
  candidates.filter(
    (t) => !recentKeys.has(buildRecentTrackKey(t.artist, t.name)),
  );

/**
 * Pick up to `max` similar artists spread across the list by index
 * (start, one third, two thirds, end), deduplicated.
 */
export const pickSpreadSimilarArtists = (
  names: readonly string[],
  max: number,
): readonly string[] =>
  names.length === 0
    ? []
    : [
        0,
        Math.floor(names.length / 3),
        Math.floor((names.length * 2) / 3),
        names.length - 1,
      ]
        .map((i) => names[i]!)
        .filter((a, i, arr) => arr.indexOf(a) === i) // dedup
        .slice(0, max);

/**
 * Exclude the seed artist from candidates (AC5/AC6 Story 9.17).
 * Radio should recommend OTHER artists — the seed artist is already known to the user.
 * Uses artistMatches() for NFD-normalized bidirectional includes-check.
 */
export const excludeSeedArtist = (
  candidates: readonly CandidateTrack[],
  seedArtist: string,
): readonly CandidateTrack[] =>
  candidates.filter((c) => !artistMatches(c.artist, seedArtist));

/**
 * Prefer similar-track candidates; fall back to similar-artist candidates
 * when the track pool is empty; otherwise empty.
 */
export const chooseEffectiveCandidates = (
  candidates: readonly CandidateTrack[],
  artistFallback: readonly CandidateTrack[],
): readonly CandidateTrack[] =>
  candidates.length > 0
    ? candidates
    : artistFallback.length > 0
      ? artistFallback
      : [];
