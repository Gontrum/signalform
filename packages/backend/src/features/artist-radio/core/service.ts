/**
 * Artist Radio — Seed Builder Service
 *
 * Functional core: Pure functions with NO side effects, NO IO.
 * No let declarations, no mutations, no console.log, no fetch.
 * Interleaving via recursive reduce (functional/no-let).
 */

import type {
  ArtistRadioSeed,
  LastFmArtistTopTrack,
  LastFmSimilarArtist,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a LastFmArtistTopTrack to an ArtistRadioSeed for the seed artist.
 * Pure function — no side effects.
 */
const toSeedArtistSeed = (
  track: LastFmArtistTopTrack,
  seedArtist: string,
): ArtistRadioSeed => ({
  name: track.name,
  artist: seedArtist,
  isFromSeedArtist: true,
});

/**
 * Convert a LastFmArtistTopTrack to an ArtistRadioSeed for a similar artist.
 * Pure function — no side effects.
 */
const toSimilarArtistSeed = (track: LastFmArtistTopTrack): ArtistRadioSeed => ({
  name: track.name,
  artist: track.artist,
  isFromSeedArtist: false,
});

/**
 * Interleave two arrays with the pattern: 1 from A, 2 from B, repeat.
 * When either list is exhausted the remainder of the other is appended.
 *
 * Implemented via tail-recursive inner function — no let, no mutation.
 *
 * @param seedSeeds   - Seeds from the seed artist (take 1 per cycle)
 * @param similarSeeds - Seeds from similar artists (take 2 per cycle)
 */
const interleave = (
  seedSeeds: readonly ArtistRadioSeed[],
  similarSeeds: readonly ArtistRadioSeed[],
): readonly ArtistRadioSeed[] => {
  const step = (
    aRem: readonly ArtistRadioSeed[],
    bRem: readonly ArtistRadioSeed[],
    acc: readonly ArtistRadioSeed[],
  ): readonly ArtistRadioSeed[] => {
    // If either list is fully consumed, append the remainder of the other.
    if (aRem.length === 0) {
      return acc.concat(bRem);
    }
    if (bRem.length === 0) {
      return acc.concat(aRem);
    }

    // Take 1 from A (seed artist), then up to 2 from B (similar artists).
    const aTake = aRem.slice(0, 1);
    const bTake = bRem.slice(0, 2);

    return step(aRem.slice(1), bRem.slice(2), acc.concat(aTake).concat(bTake));
  };

  return step(seedSeeds, similarSeeds, []);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an interleaved list of ArtistRadioSeed candidates for a given artist.
 *
 * Algorithm:
 *  1. Seed artist tracks  — first 4 of seedArtistTopTracks, isFromSeedArtist: true
 *  2. Similar artist seeds — first 8 similar artists × first 2 of their top tracks
 *     (artists missing from the map are skipped)
 *  3. Interleave — pattern: 1 seed-artist, 2 similar-artist, repeat; append
 *     remainder when one list is exhausted.
 *
 * Pure function — no side effects, no IO, no mutations.
 */
export const buildArtistRadioSeeds = (
  seedArtistTopTracks: readonly LastFmArtistTopTrack[],
  seedArtist: string,
  similarArtists: readonly LastFmSimilarArtist[],
  similarArtistTopTracks: ReadonlyMap<string, readonly LastFmArtistTopTrack[]>,
): readonly ArtistRadioSeed[] => {
  // Step 1: take first 4 seed-artist tracks
  const seedSeeds: readonly ArtistRadioSeed[] = seedArtistTopTracks
    .slice(0, 4)
    .map((track) => toSeedArtistSeed(track, seedArtist));

  // Step 2: take first 8 similar artists, flat-map their first 2 tracks
  const similarSeeds: readonly ArtistRadioSeed[] = similarArtists
    .slice(0, 8)
    .flatMap((artist) => {
      const tracks = similarArtistTopTracks.get(artist.name);
      if (tracks === undefined) {
        return [];
      }
      return tracks.slice(0, 2).map(toSimilarArtistSeed);
    });

  // Step 3: interleave (1 seed, 2 similar, repeat)
  return interleave(seedSeeds, similarSeeds);
};
