/**
 * Tidal Albums Service — Story 8.1 (Functional Core)
 *
 * Pure mapping: TidalAlbumRaw (LMS) → TidalAlbum (domain).
 * Live probe 2026-03-15: name = "{title} - {artist}", image = relative LMS proxy path.
 */

import type {
  TidalAlbumRaw,
  TidalArtistAlbumRaw,
  TidalTrackRaw,
  TidalTrackSearchResultRaw,
} from "../../../adapters/lms-client/index.js";
import type {
  TidalAlbum,
  TidalAlbumsResponse,
  TidalTrack,
  TidalAlbumTracksResponse,
  TidalAlbumDetail,
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

export const extractAlbumMeta = (
  name: string,
  image: string | undefined,
  baseUrl: string,
): {
  readonly title: string;
  readonly artist: string;
  readonly coverArtUrl: string;
} => {
  const lastDashIdx = name.lastIndexOf(" - ");
  const title = lastDashIdx !== -1 ? name.substring(0, lastDashIdx) : name;
  const artist = lastDashIdx !== -1 ? name.substring(lastDashIdx + 3) : "";
  const coverArtUrl = image ? `${baseUrl}${image}` : "";
  return { title, artist, coverArtUrl };
};

export const mapTidalAlbumDetail = (
  albumId: string,
  metaName: string,
  metaImage: string | undefined,
  rawTracks: ReadonlyArray<TidalTrackRaw>,
  trackCount: number,
  baseUrl: string,
): TidalAlbumDetail => {
  const { title, artist, coverArtUrl } = extractAlbumMeta(
    metaName,
    metaImage,
    baseUrl,
  );
  const { tracks } = mapTidalAlbumTracks(rawTracks, trackCount);
  return {
    id: albumId,
    title,
    artist,
    coverArtUrl,
    tracks,
    totalCount: trackCount,
  };
};

export const findAlbumMetaFromParentItems = (
  albumId: string,
  items: ReadonlyArray<TidalArtistAlbumRaw>,
): { readonly name: string; readonly image: string | undefined } => {
  const match = items.find((item) => item.id === albumId);
  return { name: match?.name ?? "", image: match?.image };
};

/**
 * Filter track search results to those belonging to the requested album.
 *
 * Matching strategy (mirrors old findTidalSearchAlbumId logic):
 * 1. Primary: albumName case-insensitively startsWith the albumTitle
 * 2. Secondary (classical "Composer: Work" format): when albumTitle contains ":",
 *    extract the work title after ":" and match albumName by startsWith or includes.
 * 3. If albumName is absent (enrichment failed): include the track (best-effort).
 *
 * @param tracks - Enriched track results from searchTidalAlbumTracks
 * @param albumTitle - The album title to match against (e.g. "Mahler: Symphony No. 5")
 * @returns Filtered tracks belonging to the album
 */
export const filterTracksByAlbumTitle = (
  tracks: ReadonlyArray<TidalTrackSearchResultRaw>,
  albumTitle: string,
): ReadonlyArray<TidalTrackSearchResultRaw> => {
  const lowerTitle = albumTitle.toLowerCase().trim();

  // Extract work title for classical "Composer: Work" format
  const colonIdx = lowerTitle.indexOf(":");
  const workTitle =
    colonIdx >= 0 ? lowerTitle.slice(colonIdx + 1).trim() : undefined;

  return tracks.filter((track) => {
    // No albumName from enrichment — include best-effort
    if (track.albumName === undefined || track.albumName === "") {
      return true;
    }
    const lowerAlbumName = track.albumName.toLowerCase();

    // Primary: case-insensitive startsWith
    if (lowerAlbumName.startsWith(lowerTitle)) {
      return true;
    }

    // Secondary: classical work title match
    if (workTitle !== undefined) {
      if (
        lowerAlbumName.startsWith(workTitle) ||
        lowerAlbumName.includes(workTitle)
      ) {
        return true;
      }
    }

    return false;
  });
};

export const mapTidalAlbumTracksBySearch = (
  tracks: ReadonlyArray<TidalTrackSearchResultRaw>,
): TidalAlbumTracksResponse => ({
  tracks: tracks.map((t, i) => ({
    id: t.id,
    trackNumber: i + 1,
    title: t.name,
    url: t.url,
    duration: 0,
  })),
  totalCount: tracks.length,
});
