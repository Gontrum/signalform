/**
 * Normalizes an artist name for comparison: lowercase + NFD diacritic removal.
 * Used by metadata route (exact match) and radio service (bidirectional fuzzy match).
 */
export const normalizeArtist = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
