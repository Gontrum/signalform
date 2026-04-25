const normalize = (s: string): string => s.toLowerCase().replace(/[-–—]/g, ' ')

export const rankByRelevance = <T>(
  query: string,
  items: readonly T[],
  getTitle: (item: T) => string,
): readonly T[] => {
  const q = normalize(query)
  return [...items].sort((a, b) => {
    const aScore = normalize(getTitle(a)).includes(q) ? 1 : 0
    const bScore = normalize(getTitle(b)).includes(q) ? 1 : 0
    return bScore - aScore
  })
}
