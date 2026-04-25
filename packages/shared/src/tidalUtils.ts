/**
 * Tidal album ID detection utility.
 *
 * Story 9.2 (TD-1): Single authoritative implementation, shared across frontend and backend.
 * Replaces duplicated logic that previously existed in:
 *   - packages/frontend/src/views/AlbumDetailView.vue
 *   - packages/backend/src/features/playback/route.ts
 *
 * ## Known Tidal browse album ID formats (verified via live probe 2026-03-17):
 *
 * | Format           | Example                          | Source                        |
 * |------------------|----------------------------------|-------------------------------|
 * | Favorites        | "4.0", "4.1"                    | item_id:4 (Tidal Alben)      |
 * | Artist albums    | "6.0.1.0"                       | item_id:6.x.1                |
 * | Featured albums  | "1.0.1.0"                       | item_id:1.0.1                |
 * | Recommendations  | "0.1.0", "0.4.3"               | item_id:0.x (Hauptmenü)     |
 * | Genre albums     | "8.1.1.0"                       | item_id:8.x.1                |
 * | Search-artist    | "7_sabrina carpenter.2.0.1.4"  | item_id:7_{query}.2.x.1      |
 *
 * All dot-separated numeric IDs match the regex /^\d+(\.\d+)+$/.
 * Search-artist IDs start with "7_" (Story 8.9 AC1).
 */

/**
 * Returns true if the given ID is a Tidal browse album ID.
 *
 * Distinguishes Tidal album IDs from local LMS numeric album IDs (e.g. "92").
 * Local album IDs are plain integers without dots.
 *
 * @param id - The album ID string to test
 */
export const isTidalAlbumId = (id: string): boolean =>
  /^\d+(\.\d+)+$/.test(id) || (id.startsWith("7_") && id.length > 2);
