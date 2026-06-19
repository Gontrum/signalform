/**
 * Personal Radio — Seed Merger
 *
 * Functional core: Pure functions with NO side effects, NO IO.
 * No let declarations, no mutations, no console.log, no fetch.
 *
 * Provides channel selection and track pool merging for the two-channel
 * personal radio (Kanal A = comfort, Kanal B = discovery).
 */

// ---------------------------------------------------------------------------
// pickChannel
// ---------------------------------------------------------------------------

/**
 * Determines which radio channel to use for a given queue-replenishment cycle.
 *
 * The decision is driven entirely by `discoveryRatio` (0–100):
 *   - 0   → always "comfort"  (no discovery tracks)
 *   - 100 → always "discovery" (no comfort tracks)
 *   - 50  → cycles 0–49 → "discovery", cycles 50–99 → "comfort", repeats
 *
 * Pure function — no side effects, no mutations.
 *
 * @param cycle          - Monotonically increasing replenishment counter (≥ 0)
 * @param discoveryRatio - Percentage of discovery tracks desired (0–100 inclusive)
 * @returns "discovery" | "comfort"
 */
export const pickChannel = (
  cycle: number,
  discoveryRatio: number,
): "comfort" | "discovery" =>
  cycle % 100 < discoveryRatio ? "discovery" : "comfort";

// ---------------------------------------------------------------------------
// mergeTrackPools
// ---------------------------------------------------------------------------

/**
 * Merges a comfort pool and a discovery pool into a single result array sized
 * to `totalSlots`, respecting `discoveryRatio`.
 *
 * Slot allocation:
 *   discoverySlots = Math.round(totalSlots * discoveryRatio / 100)
 *   comfortSlots   = totalSlots - discoverySlots
 *
 * Result order: discovery tracks first, comfort tracks second.
 * If a pool is shorter than its slot allocation, only the available items are used.
 *
 * Pure function — no side effects, no mutations.
 *
 * @param comfortPool    - Tracks from Kanal A (similar artists)
 * @param discoveryPool  - Tracks from Kanal B (neighbouring Last.fm users)
 * @param discoveryRatio - Percentage of slots allocated to discovery (0–100)
 * @param totalSlots     - Total number of tracks requested
 * @returns Merged readonly array of up to `totalSlots` tracks
 */
export const mergeTrackPools = <T>(
  comfortPool: readonly T[],
  discoveryPool: readonly T[],
  discoveryRatio: number,
  totalSlots: number,
): readonly T[] => {
  const discoverySlots = Math.round((totalSlots * discoveryRatio) / 100);
  const comfortSlots = totalSlots - discoverySlots;

  return [
    ...discoveryPool.slice(0, discoverySlots),
    ...comfortPool.slice(0, comfortSlots),
  ];
};

// ---------------------------------------------------------------------------
// spreadSample
// ---------------------------------------------------------------------------

/**
 * Selects `n` elements evenly distributed across `arr`, always including the
 * first and last element when `n >= 2`.
 *
 * Index formula: `Math.round(i * (arr.length - 1) / (n - 1))` for i in 0..n-1.
 * Duplicate indices (when arr.length < n) are deduplicated.
 *
 * Edge cases:
 *   - empty array or n=0 → []
 *   - n=1              → [arr[0]]
 *   - arr.length <= n  → all elements
 *
 * Pure function — no side effects, no mutations.
 *
 * @param arr - Source array
 * @param n   - Number of elements to select
 * @returns Readonly array of up to n evenly spread elements
 */
export const spreadSample = <T>(arr: readonly T[], n: number): readonly T[] => {
  if (arr.length === 0 || n === 0) {
    return [];
  }
  if (n === 1) {
    return arr.slice(0, 1);
  }
  if (arr.length <= n) {
    return arr;
  }
  return Array.from({ length: n }, (_, i) =>
    Math.round((i * (arr.length - 1)) / (n - 1)),
  )
    .filter((idx, pos, self) => self.indexOf(idx) === pos)
    .map((idx) => arr[idx])
    .filter((item): item is T => item !== undefined);
};

export const fisherYatesShuffle = <T>(arr: readonly T[]): readonly T[] =>
  Array.from({ length: arr.length }, (_, i) => i).reduce<readonly T[]>(
    (acc, _, i) => {
      const remaining = arr.length - i;
      const j = Math.floor(Math.random() * remaining);
      const item = acc[j];
      const last = acc[remaining - 1];
      if (item === undefined || last === undefined) {
        return acc;
      }
      return acc.map((el, idx) =>
        idx === j ? last : idx === remaining - 1 ? item : el,
      );
    },
    [...arr],
  );
