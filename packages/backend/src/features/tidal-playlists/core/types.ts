/**
 * Domain types for Tidal playlist browsing (user's Tidal playlists).
 * Live probe 2026-09-02: playlists fetched via item_id:3 ("Wiedergabelisten") from Tidal LMS plugin.
 */

export type TidalPlaylist = {
  readonly id: string;
  readonly name: string;
  readonly coverArtUrl: string;
};

export type TidalPlaylistsResponse = {
  readonly playlists: readonly TidalPlaylist[];
  readonly totalCount: number;
};

export type TidalPlaylistTrack = {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly url: string;
  readonly duration?: number;
  readonly coverArtUrl: string;
};

export type TidalPlaylistTracksResponse = {
  readonly tracks: readonly TidalPlaylistTrack[];
  readonly totalCount: number;
};
