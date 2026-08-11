/**
 * Domain types for the local music library view.
 * Separate from LMS raw types — service layer maps raw → domain.
 */

export type LibraryAlbum = {
  readonly id: string; // String(raw.id)
  readonly title: string; // raw.album
  readonly artist: string; // raw.artist ?? ""
  readonly releaseYear: number | null; // raw.year > 0 ? raw.year : null
  readonly coverArtUrl: string; // always constructed, never null
};

export type LibraryAlbumsResponse = {
  readonly albums: ReadonlyArray<LibraryAlbum>;
  // Not a total: a decade filter would have to count every year of the decade
  // before the first page could ship. One album past the window is enough.
  readonly hasMore: boolean;
};

export type LibraryServiceError = {
  readonly type: "LmsError";
  readonly message: string;
};
