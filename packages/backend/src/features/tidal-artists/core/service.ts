/**
 * Tidal Artists Service — Story 8.6 (Functional Core)
 *
 * Pure mapping: TidalArtistAlbumRaw (LMS) → TidalArtistAlbum (domain).
 *
 * Live probe 2026-03-15:
 * - name = album title ONLY (NOT "{title} - {artist}" like TidalAlbumRaw)
 * - image = relative LMS proxy path "/imageproxy/..." — prepend http://{host}:{port}
 * - Artist albums are at item_id:{artistId}.1 ("Alben" submenu — always position 1)
 */

import type {
  TidalArtistAlbumRaw,
  TidalSearchArtistRaw,
} from "../../../adapters/lms-client/index.js";
import type {
  TidalArtistAlbum,
  TidalArtistAlbumsResponse,
  TidalSearchArtist,
  TidalArtistSearchResponse,
} from "./types.js";

/**
 * Maps a raw LMS Tidal artist album item to the domain TidalArtistAlbum type.
 *
 * name field: album title only (no artist suffix — differs from TidalAlbumRaw).
 * image field: relative LMS proxy path → prepend http://{host}:{port}.
 */
export const mapTidalArtistAlbum = (
  raw: TidalArtistAlbumRaw,
  baseUrl: string,
): TidalArtistAlbum => ({
  id: raw.id,
  title: raw.name,
  coverArtUrl: raw.image ? `${baseUrl}${raw.image}` : "",
});

const normalizeTidalSearchArtistId = (id: string): string =>
  id.replace(/(?<=_[^_]+)_[^_]+(\.\d+\.\d+)$/, "$1");

/**
 * Maps a raw LMS Tidal artist search result to the domain TidalSearchArtist type.
 */
export const mapTidalSearchArtist = (
  raw: TidalSearchArtistRaw,
  baseUrl: string,
): TidalSearchArtist => ({
  artistId: normalizeTidalSearchArtistId(raw.id),
  name: raw.name,
  coverArtUrl: raw.image ? `${baseUrl}${raw.image}` : "",
});

export const mapTidalArtistSearch = (
  rawArtists: ReadonlyArray<TidalSearchArtistRaw>,
  count: number,
  baseUrl: string,
): TidalArtistSearchResponse => ({
  artists: rawArtists.map((raw) => mapTidalSearchArtist(raw, baseUrl)),
  totalCount: count,
});

export const mapTidalArtistAlbums = (
  artistId: string,
  rawAlbums: ReadonlyArray<TidalArtistAlbumRaw>,
  count: number,
  baseUrl: string,
): TidalArtistAlbumsResponse => ({
  artistId,
  albums: rawAlbums.map((raw) => mapTidalArtistAlbum(raw, baseUrl)),
  totalCount: count,
});
