/**
 * Artist Radio — Domain Types
 *
 * Functional core: Pure domain types with NO side effects.
 * All types are readonly (immutability enforced).
 */

// Last.fm types (imported, not re-defined)
import type {
  ArtistTopTrack as LastFmArtistTopTrack,
  SimilarArtist as LastFmSimilarArtist,
} from "../../../adapters/lastfm-client/index.js";

/** A candidate track to search for in LMS */
export type ArtistRadioSeed = {
  readonly name: string; // track title from last.fm
  readonly artist: string; // artist name
  readonly isFromSeedArtist: boolean;
};

export type { LastFmArtistTopTrack, LastFmSimilarArtist };
