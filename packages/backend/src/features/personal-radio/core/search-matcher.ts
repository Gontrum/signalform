const normalizeStr = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export const artistMatches = (
  resultArtist: string,
  candidateArtist: string,
): boolean => {
  const r = normalizeStr(resultArtist);
  const c = normalizeStr(candidateArtist);
  return r.includes(c) || c.includes(r);
};

export const sourceRank = (source: string): number =>
  source === "local" ? 0 : source === "qobuz" ? 1 : source === "tidal" ? 2 : 3;

export const pickBestResult = <T extends { readonly source: string }>(
  results: readonly T[],
): T | undefined =>
  results.reduce<T | undefined>(
    (best, current) =>
      best === undefined || sourceRank(current.source) < sourceRank(best.source)
        ? current
        : best,
    undefined,
  );
