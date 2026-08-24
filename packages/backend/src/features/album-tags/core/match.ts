import { normalizeForMatch } from "./normalize.js";
import type { LibraryAlbumMatchInput, TagCandidate } from "./types.js";

const sortedWords = (normalized: string): readonly string[] =>
  [...new Set(normalized.split(" ").filter((word) => word !== ""))].sort();

const sameWordSet = (a: string, b: string): boolean => {
  const wordsA = sortedWords(a);
  const wordsB = sortedWords(b);
  return (
    wordsA.length === wordsB.length &&
    wordsA.every((word, index) => word === wordsB[index])
  );
};

const artistMatches = (
  candidateArtist: string,
  albumArtist: string | undefined,
): boolean => {
  const a = normalizeForMatch(candidateArtist);
  const b = normalizeForMatch(albumArtist ?? "");
  if (a === "" || b === "") {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  return sameWordSet(a, b);
};

export const matchCandidate = (
  candidate: TagCandidate,
  lmsAlbums: readonly LibraryAlbumMatchInput[],
): LibraryAlbumMatchInput | undefined => {
  const title = normalizeForMatch(candidate.title);
  if (title === "") {
    return undefined;
  }

  return lmsAlbums.find(
    (album) =>
      normalizeForMatch(album.album) === title &&
      artistMatches(candidate.artist, album.artist),
  );
};
