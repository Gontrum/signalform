/**
 * Tag Search Query - Functional Core
 *
 * Pure helpers for the `tag:` search syntax that routes a full search to a
 * Discogs tag lookup instead of the normal local/Tidal search.
 */

import type { TagSearchMatch } from "./types.js";

const TAG_PREFIX = "tag:";

/**
 * `tag:<text>` routes a full search to a global Discogs tag lookup instead
 * of the normal local/Tidal search. Returns undefined when the query carries
 * no `tag:` prefix, so callers can distinguish "no tag search" from "tag
 * search with empty text" (the latter still returns a match, with an empty
 * `tagQuery`).
 */
export const parseTagQuery = (
  rawQuery: string,
): { readonly tagQuery: string } | undefined => {
  const trimmed = rawQuery.trim();
  if (!trimmed.toLowerCase().startsWith(TAG_PREFIX)) {
    return undefined;
  }

  return { tagQuery: trimmed.slice(TAG_PREFIX.length).trim() };
};

/**
 * Builds the single-entry `TagSearchMatch` list for a resolved Discogs tag
 * candidate count. Empty when no candidates were found.
 */
export const buildTagSearchMatch = (
  tagQuery: string,
  candidateCount: number,
): readonly TagSearchMatch[] => {
  return candidateCount > 0
    ? [{ query: tagQuery, displayName: tagQuery, albumCount: candidateCount }]
    : [];
};
