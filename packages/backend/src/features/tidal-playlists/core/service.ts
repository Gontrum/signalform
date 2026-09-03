/**
 * Pure mapping: TidalAlbumRaw / TidalTrackRaw (LMS) → TidalPlaylist(Track) (domain).
 * Live probe 2026-09-02: item_id:3 ("Wiedergabelisten") returns the same item
 * shape as albums, but name is the plain playlist name — not "{title} - {artist}".
 */

import type {
  TidalAlbumRaw,
  TidalTrackRaw,
} from "../../../adapters/lms-client/index.js";
import type {
  TidalPlaylist,
  TidalPlaylistsResponse,
  TidalPlaylistTrack,
  TidalPlaylistTracksResponse,
} from "./types.js";

const mapTidalPlaylist = (
  raw: TidalAlbumRaw,
  baseUrl: string,
): TidalPlaylist => ({
  id: raw.id,
  name: raw.name,
  coverArtUrl: raw.image ? `${baseUrl}${raw.image}` : "",
});

export const mapTidalPlaylists = (
  raw: readonly TidalAlbumRaw[],
  count: number,
  baseUrl: string,
): TidalPlaylistsResponse => ({
  playlists: raw
    .filter((item) => item.name.trim() !== "")
    .map((item) => mapTidalPlaylist(item, baseUrl)),
  totalCount: count,
});

const mapTidalPlaylistTrack = (
  raw: TidalTrackRaw,
  position: number,
): TidalPlaylistTrack => ({
  id: raw.id,
  position,
  title: raw.name,
  url: raw.url ?? "",
  duration: raw.duration,
  coverArtUrl: "",
});

export const mapTidalPlaylistTracks = (
  raw: readonly TidalTrackRaw[],
  count: number,
  offset: number,
  _baseUrl: string,
): TidalPlaylistTracksResponse => ({
  tracks: raw
    .filter((track) => track.isaudio === 1)
    .map((track, index) => mapTidalPlaylistTrack(track, offset + index)),
  totalCount: count,
});
