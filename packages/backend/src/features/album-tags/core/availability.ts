import { normalizeForMatch } from "./normalize.js";
import type { TagCandidate } from "./types.js";

export type TidalAlbumCandidate = {
  readonly name: string;
  readonly coverArtUrl?: string;
};

// Tidals Alben-Suche liefert kein Künstlerfeld — die Präzision kommt aus der
// Suchanfrage selbst (Künstler steht bereits im `search:`-Text, Shell-Seite),
// hier wird nur noch der Albumtitel normalisiert verglichen.
export const matchTidalAlbum = (
  candidate: TagCandidate,
  tidalAlbums: readonly TidalAlbumCandidate[],
): TidalAlbumCandidate | undefined => {
  const normalizedTitle = normalizeForMatch(candidate.title);
  if (normalizedTitle === "") {
    return undefined;
  }
  return tidalAlbums.find(
    (album) => normalizeForMatch(album.name) === normalizedTitle,
  );
};
