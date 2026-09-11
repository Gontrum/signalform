/**
 * Playlist Import — LMS resolution with missing-track tracking (imperative shell)
 *
 * `resolvePlayableUrls` in radio-mode/shell/start-pipeline.ts only reports the
 * resolved URLs, not which candidates failed — the import route needs the
 * failures to show the user a "missing" list, so this is its own small
 * resolver built from the same core building blocks.
 */

import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { artistMatches, selectBestTrackUrl } from "../../radio-mode/index.js";
import type { ParsedTrack } from "@signalform/shared";

export type ResolveOutcome = {
  readonly playableUrls: readonly string[];
  readonly missing: readonly string[];
};

const candidateLabel = (candidate: ParsedTrack): string =>
  `${candidate.artist} – ${candidate.name}`;

// ponytail: sequential, ~300ms per track; background job if imports over 100
// tracks become common
export const resolveWithMissing = async (
  lmsClient: LmsClient,
  candidates: readonly ParsedTrack[],
): Promise<ResolveOutcome> =>
  candidates.reduce<Promise<ResolveOutcome>>(
    async (accPromise, candidate) => {
      const acc = await accPromise;
      const searchResult = await lmsClient.search(
        `${candidate.artist} ${candidate.name}`,
      );
      if (!searchResult.ok || searchResult.value.tracks.length === 0) {
        return { ...acc, missing: [...acc.missing, candidateLabel(candidate)] };
      }

      const matching = searchResult.value.tracks.filter((track) =>
        artistMatches(track.artist, candidate.artist),
      );
      const best = selectBestTrackUrl(matching).url;
      if (best === undefined || acc.playableUrls.includes(best)) {
        return { ...acc, missing: [...acc.missing, candidateLabel(candidate)] };
      }

      return { ...acc, playableUrls: [...acc.playableUrls, best] };
    },
    Promise.resolve({ playableUrls: [], missing: [] }),
  );
