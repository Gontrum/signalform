import type { TagCandidate } from "./types.js";

export type TagAlbumPage = {
  readonly page: readonly TagCandidate[];
  readonly hasMore: boolean;
  readonly totalCandidates: number;
};

export const sliceCandidatePage = (
  candidates: readonly TagCandidate[],
  offset: number,
  limit: number,
): TagAlbumPage => ({
  page: candidates.slice(offset, offset + limit),
  hasMore: offset + limit < candidates.length,
  totalCandidates: candidates.length,
});

export type TagAlbumView = {
  readonly artist: string;
  readonly title: string;
  readonly year?: number;
  readonly coverArtUrl: string;
  readonly source: "local" | "tidal";
  readonly albumId?: string;
};

// /music/{albumId}/cover.jpg is wrong: LMS treats that path segment as a
// track ID, not an album ID. artwork_track_id must be used when available.
export const buildCoverArtUrl = (
  baseUrl: string,
  albumId: string,
  artworkTrackId: string | undefined,
): string =>
  artworkTrackId !== undefined
    ? `${baseUrl}/music/${artworkTrackId}/cover.jpg`
    : `${baseUrl}/music/0/cover.jpg?album_id=${albumId}`;

type TagAlbumSource = Pick<TagAlbumView, "coverArtUrl" | "source" | "albumId">;

const toLocalSource = (
  local: { readonly albumId: string; readonly artworkTrackId?: string },
  baseUrl: string,
): TagAlbumSource => ({
  coverArtUrl: buildCoverArtUrl(baseUrl, local.albumId, local.artworkTrackId),
  source: "local",
  albumId: local.albumId,
});

// A Tidal hit without cover art is as useless in a cover grid as an
// unavailable album, so it is dropped rather than shown imageless.
const toTidalSource = (tidal: {
  readonly coverArtUrl?: string;
}): TagAlbumSource | undefined =>
  tidal.coverArtUrl !== undefined
    ? { coverArtUrl: tidal.coverArtUrl, source: "tidal" }
    : undefined;

const resolveSource = (
  local:
    { readonly albumId: string; readonly artworkTrackId?: string } | undefined,
  tidal: { readonly coverArtUrl?: string } | undefined,
  baseUrl: string,
): TagAlbumSource | undefined => {
  if (local !== undefined) {
    return toLocalSource(local, baseUrl);
  }
  return tidal !== undefined ? toTidalSource(tidal) : undefined;
};

export const toTagAlbumView = (
  candidate: TagCandidate,
  local:
    { readonly albumId: string; readonly artworkTrackId?: string } | undefined,
  tidal: { readonly coverArtUrl?: string } | undefined,
  baseUrl: string,
): TagAlbumView | undefined => {
  const source = resolveSource(local, tidal, baseUrl);
  if (source === undefined) {
    return undefined;
  }
  return {
    artist: candidate.artist,
    title: candidate.title,
    ...(candidate.year !== undefined ? { year: candidate.year } : {}),
    ...source,
  };
};
