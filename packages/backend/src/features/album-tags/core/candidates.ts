import { normalizeForMatch } from "./normalize.js";
import type { ReleaseSearchResult, TagCandidate } from "./types.js";

const ARTIST_TITLE_SEPARATOR = " - ";
// Normalization strips punctuation, so "|" cannot occur inside a key part.
const KEY_SEPARATOR = "|";

const makeCandidate = (
  artist: string,
  title: string,
  year: number | undefined,
  coverImageUrl: string | undefined,
): TagCandidate => ({
  artist,
  title,
  ...(year !== undefined ? { year } : {}),
  ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
});

const parseResult = (result: ReleaseSearchResult): TagCandidate | undefined => {
  const separatorAt = result.title.indexOf(ARTIST_TITLE_SEPARATOR);
  if (separatorAt < 0) {
    return undefined;
  }

  const artist = result.title.slice(0, separatorAt).trim();
  const title = result.title
    .slice(separatorAt + ARTIST_TITLE_SEPARATOR.length)
    .trim();
  if (artist === "" || title === "") {
    return undefined;
  }

  return makeCandidate(artist, title, result.year, result.coverImageUrl);
};

const candidateKey = (candidate: TagCandidate): string =>
  [
    normalizeForMatch(candidate.artist),
    normalizeForMatch(candidate.title),
  ].join(KEY_SEPARATOR);

const earlierYear = (
  a: number | undefined,
  b: number | undefined,
): number | undefined => {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  return Math.min(a, b);
};

const mergeInto = (
  acc: readonly TagCandidate[],
  candidate: TagCandidate,
): readonly TagCandidate[] => {
  const key = candidateKey(candidate);
  const knownAt = acc.findIndex((known) => candidateKey(known) === key);
  const known = knownAt < 0 ? undefined : acc[knownAt];
  if (known === undefined) {
    return [...acc, candidate];
  }

  const merged = makeCandidate(
    known.artist,
    known.title,
    earlierYear(known.year, candidate.year),
    known.coverImageUrl ?? candidate.coverImageUrl,
  );
  return acc.map((entry, index) => (index === knownAt ? merged : entry));
};

export const toCandidates = (
  results: readonly ReleaseSearchResult[],
): readonly TagCandidate[] =>
  results
    .map(parseResult)
    .filter((candidate): candidate is TagCandidate => candidate !== undefined)
    .reduce<readonly TagCandidate[]>(mergeInto, []);
