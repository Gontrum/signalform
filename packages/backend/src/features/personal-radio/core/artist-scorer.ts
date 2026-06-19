/**
 * Personal Radio — Artist Scorer
 *
 * Functional core: Pure functions with NO side effects, NO IO.
 * No let declarations, no mutations, no console.log, no fetch.
 *
 * Scores artists from Last.fm listening history and returns the top artists
 * sorted by score for use as radio seeds.
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ArtistScoreEntry = {
  readonly key: string;
  readonly name: string;
  readonly score: number;
};

// ---------------------------------------------------------------------------
// mergeScore (private helper)
// ---------------------------------------------------------------------------

const mergeScore = (
  scores: readonly ArtistScoreEntry[],
  name: string,
  delta: number,
): readonly ArtistScoreEntry[] => {
  const key = name.toLowerCase();
  const existing = scores.find((s) => s.key === key);
  if (existing !== undefined) {
    return scores.map((s) =>
      s.key === key ? { ...s, score: s.score + delta } : s,
    );
  }
  return [...scores, { key, name, score: delta }];
};

// ---------------------------------------------------------------------------
// scoreArtistsFromHistory
// ---------------------------------------------------------------------------

/**
 * Scores artists from three Last.fm history sources and returns the top
 * artists by score, ready to use as radio seeds.
 *
 * Scoring weights:
 *   - Loved track artists:     +3 per occurrence
 *   - Recent top artists (7d): +3 per artist
 *   - Overall top artists:     +1 per artist
 *
 * Matching is case-insensitive; the name from the first occurrence is
 * preserved in the output.
 *
 * Pure function — no side effects, no mutations.
 *
 * @param params.lovedArtists      - Artists from loved tracks
 * @param params.recentTopArtists  - Artists from 7-day top chart
 * @param params.overallTopArtists - Artists from overall top chart
 * @param params.limit             - Maximum number of artists to return (default 8)
 * @returns Readonly array of artist names sorted by score descending
 */
export const scoreArtistsFromHistory = (params: {
  readonly lovedArtists: readonly string[];
  readonly recentTopArtists: readonly string[];
  readonly overallTopArtists: readonly string[];
  readonly limit?: number;
}): readonly string[] => {
  const limit = params.limit ?? 8;

  const withLoved = params.lovedArtists.reduce<readonly ArtistScoreEntry[]>(
    (acc, name) => mergeScore(acc, name, 3),
    [],
  );

  const withRecent = params.recentTopArtists.reduce<
    readonly ArtistScoreEntry[]
  >((acc, name) => mergeScore(acc, name, 3), withLoved);

  const allScores = params.overallTopArtists.reduce<
    readonly ArtistScoreEntry[]
  >((acc, name) => mergeScore(acc, name, 1), withRecent);

  return [...allScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.name);
};
