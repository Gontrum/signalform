/**
 * Tidal Albums Service — Story 8.1 (Functional Core)
 *
 * Pure mapping: TidalAlbumRaw (LMS) → TidalAlbum (domain).
 * Live probe 2026-03-15: name = "{title} - {artist}", image = relative LMS proxy path.
 */

import type {
  TidalAlbumRaw,
  TidalTrackRaw,
} from "../../../adapters/lms-client/index.js";
import type {
  TidalAlbum,
  TidalAlbumsResponse,
  TidalTrack,
  TidalAlbumTracksResponse,
} from "./types.js";

const mapTidalAlbum = (raw: TidalAlbumRaw, baseUrl: string): TidalAlbum => {
  const lastDashIdx = raw.name.lastIndexOf(" - ");
  const title =
    lastDashIdx !== -1 ? raw.name.substring(0, lastDashIdx) : raw.name;
  const artist = lastDashIdx !== -1 ? raw.name.substring(lastDashIdx + 3) : "";

  const coverArtUrl = raw.image ? `${baseUrl}${raw.image}` : "";

  return { id: raw.id, title, artist, coverArtUrl };
};

const mapTidalTrack = (raw: TidalTrackRaw, index: number): TidalTrack => ({
  id: raw.id,
  trackNumber: index + 1,
  title: raw.name,
  url: raw.url ?? "",
  duration: raw.duration ?? 0,
});

export const mapTidalAlbumTracks = (
  rawTracks: ReadonlyArray<TidalTrackRaw>,
  count: number,
): TidalAlbumTracksResponse => {
  const audioTracks = rawTracks.filter((t) => t.isaudio === 1);
  return {
    tracks: audioTracks.map(mapTidalTrack),
    totalCount: count,
  };
};

export const mapTidalAlbums = (
  rawAlbums: ReadonlyArray<TidalAlbumRaw>,
  count: number,
  baseUrl: string,
): TidalAlbumsResponse => ({
  albums: rawAlbums.map((raw) => mapTidalAlbum(raw, baseUrl)),
  totalCount: count,
});
