export type TagCandidate = {
  readonly artist: string;
  readonly title: string;
  readonly year?: number;
  readonly coverImageUrl?: string;
};

// Duplicated from the Discogs adapter on purpose: the core owns its input
// shapes so the adapter can change without touching this zone.
export type ReleaseSearchResult = {
  readonly title: string;
  readonly year?: number;
  readonly coverImageUrl?: string;
};

export type LibraryAlbumMatchInput = {
  readonly id: number | string;
  readonly album: string;
  readonly artist?: string;
  readonly year?: number;
  readonly artwork_track_id?: string;
};
