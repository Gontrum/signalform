/**
 * Tidal Artists Feature — Domain Types (Story 8.6)
 *
 * Represents an album from a specific Tidal artist's catalogue.
 * Distinct from TidalAlbum (tidal-albums feature): no artist field here
 * since the artist is known from the page context.
 */

export type TidalArtistAlbum = {
  readonly id: string;
  readonly title: string;
  readonly coverArtUrl: string;
};

export type TidalArtistAlbumsResponse = {
  readonly artistId: string;
  readonly albums: readonly TidalArtistAlbum[];
  readonly totalCount: number;
};

export type TidalSearchArtist = {
  readonly artistId: string;
  readonly name: string;
  readonly coverArtUrl: string;
};

export type TidalArtistSearchResponse = {
  readonly artists: readonly TidalSearchArtist[];
  readonly totalCount: number;
};
