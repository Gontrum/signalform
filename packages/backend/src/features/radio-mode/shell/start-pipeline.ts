/**
 * Radio Mode — Shared start pipeline (imperative shell)
 *
 * The candidate→playable-URL resolution and play/queue tail shared by every
 * "Start" flow (genre, loved, personal radio): search LMS for each last.fm
 * candidate, keep the quality-aware best match per candidate up to a cap,
 * then play the first URL and enqueue the rest.
 *
 * Imperative shell: has IO. All pure decisions (artist matching, quality-aware
 * URL selection) live in ../core/track-selection.ts.
 */

import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { artistMatches, selectBestTrackUrl } from "../core/track-selection.js";

export type StartPipelineDeps = {
  readonly lmsClient: LmsClient;
};

/** Minimal candidate shape needed to search LMS and match results. */
type StartPipelineCandidate = {
  readonly artist: string;
  readonly name: string;
};

/**
 * Resolves up to `maxTracks` LMS-playable URLs from a candidate list.
 * Sequential — searches LMS one candidate at a time until the cap is hit.
 * Skips candidates whose LMS search yields no artist-matching results, and
 * skips a resolved URL already present in the accumulated list.
 */
export const resolvePlayableUrls = async (
  deps: StartPipelineDeps,
  candidates: readonly StartPipelineCandidate[],
  maxTracks: number,
): Promise<{ readonly playableUrls: readonly string[] }> => {
  const { lmsClient } = deps;

  const { urls } = await candidates.reduce<
    Promise<{ readonly urls: readonly string[] }>
  >(
    async (accPromise, track) => {
      const acc = await accPromise;
      if (acc.urls.length >= maxTracks) {
        return acc;
      }
      const searchResult = await lmsClient.search(
        `${track.artist} ${track.name}`,
      );
      if (!searchResult.ok || searchResult.value.tracks.length === 0) {
        return acc;
      }
      const matching = searchResult.value.tracks.filter((r) =>
        artistMatches(r.artist, track.artist),
      );
      const best = selectBestTrackUrl(matching).url;
      if (best === undefined || acc.urls.includes(best)) {
        return acc;
      }
      return { urls: [...acc.urls, best] };
    },
    Promise.resolve({ urls: [] }),
  );

  return { playableUrls: urls };
};

/**
 * Plays the first URL, then adds the rest to the queue sequentially.
 */
export const playAndQueue = async (
  deps: StartPipelineDeps,
  playableUrls: readonly string[],
): Promise<void> => {
  const { lmsClient } = deps;
  await lmsClient.play(playableUrls[0]!);
  await playableUrls.slice(1).reduce<Promise<void>>(async (prev, url) => {
    await prev;
    await lmsClient.addToQueue(url);
  }, Promise.resolve());
};
