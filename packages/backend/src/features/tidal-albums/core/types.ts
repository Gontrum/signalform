/**
 * Tidal Albums Domain Types — Story 8.1
 *
 * Domain types for Tidal album browsing (user's Tidal library albums).
 * Live probe 2026-03-15: albums fetched via item_id:4 ("Alben") from Tidal LMS plugin.
 */

export type TidalAlbum = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly coverArtUrl: string;
};

export type TidalAlbumsResponse = {
  readonly albums: ReadonlyArray<TidalAlbum>;
  readonly totalCount: number;
};

export type TidalTrack = {
  readonly id: string;
  readonly trackNumber: number;
  readonly title: string;
  readonly url: string;
  readonly duration: number;
};

export type TidalAlbumTracksResponse = {
  readonly tracks: ReadonlyArray<TidalTrack>;
  readonly totalCount: number;
};
