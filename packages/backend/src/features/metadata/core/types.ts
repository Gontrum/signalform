import type { AudioQuality } from "@signalform/shared";

export type AlbumTrack = {
  readonly id: string;
  readonly trackNumber: number;
  readonly title: string;
  readonly artist: string;
  readonly duration: number; // seconds (0 if not available)
  readonly url: string; // LMS track URL (for playback)
  readonly audioQuality?: AudioQuality; // undefined if quality data unavailable
};

export type AlbumDetail = {
  readonly id: string; // albumId passed in
  readonly title: string; // from first track's album field
  readonly artist: string; // from first track's artist field
  readonly releaseYear: number | null; // from tracks, null if unavailable
  readonly coverArtUrl: string; // http://{host}:{port}/music/{firstTrackId}/cover.jpg — always constructed, never null
  readonly tracks: ReadonlyArray<AlbumTrack>;
};

export type AlbumServiceError =
  | { readonly type: "LmsError"; readonly message: string }
  | { readonly type: "NotFound"; readonly message: string };

export type ArtistAlbum = {
  readonly id: string; // string album_id (for router navigation)
  readonly title: string; // album title
  readonly releaseYear: number | null; // null if LMS has no year tag
  readonly coverArtUrl: string; // always constructed — never null/undefined
};

export type ArtistDetail = {
  readonly id: string; // artistId passed in
  readonly name: string; // from albums[0].artist (empty string if no albums)
  readonly albums: ReadonlyArray<ArtistAlbum>; // sorted newest-first
};

export type ArtistServiceError =
  | { readonly type: "LmsError"; readonly message: string }
  | { readonly type: "NotFound"; readonly message: string };
