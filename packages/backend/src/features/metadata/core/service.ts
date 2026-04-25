import { parseAudioQuality } from "../../../adapters/lms-client/helpers.js";
import type {
  AlbumDetail,
  AlbumTrack,
  ArtistAlbum,
  ArtistDetail,
} from "./types.js";

type AlbumTrackInput = {
  readonly id: number | string;
  readonly title: string;
  readonly artist?: string;
  readonly album?: string;
  readonly albumartist?: string;
  readonly url?: string;
  readonly duration?: number;
  readonly year?: number | string | null;
  readonly type?: string;
  readonly bitrate?: string;
  readonly samplerate?: string;
  readonly samplesize?: number;
};

type ArtistAlbumInput = {
  readonly id: number | string;
  readonly album: string;
  readonly artist?: string;
  readonly year?: number | string | null;
  readonly artwork_track_id?: string;
};

const findMostCommonArtist = (artists: readonly string[]): string => {
  const nonEmpty = artists.filter((artist) => artist !== "");
  if (nonEmpty.length === 0) {
    return "";
  }

  const counts = nonEmpty.reduce<Readonly<Record<string, number>>>(
    (acc, artist) => ({ ...acc, [artist]: (acc[artist] ?? 0) + 1 }),
    {},
  );

  return Object.entries(counts).reduce(
    (best, [artist, count]) => (count > best.count ? { artist, count } : best),
    { artist: nonEmpty[0]!, count: 0 },
  ).artist;
};

const parseYear = (raw: number | string | null | undefined): number | null => {
  if (raw === null || raw === undefined) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapAlbumTrack = (raw: AlbumTrackInput, position: number): AlbumTrack => ({
  id: String(raw.id),
  trackNumber: position,
  title: raw.title,
  artist: raw.artist ?? "",
  duration: raw.duration ?? 0,
  url: raw.url ?? "",
  audioQuality: parseAudioQuality(raw),
});

const buildAlbumCoverArtUrl = (
  firstTrackId: number | string,
  baseUrl: string,
): string => `${baseUrl}/music/${String(firstTrackId)}/cover.jpg`;

const mapArtistAlbum = (
  raw: ArtistAlbumInput,
  baseUrl: string,
): ArtistAlbum => {
  const coverArtUrl = raw.artwork_track_id
    ? `${baseUrl}/music/${raw.artwork_track_id}/cover.jpg`
    : `${baseUrl}/music/0/cover.jpg?album_id=${raw.id}`;

  return {
    id: String(raw.id),
    title: raw.album,
    releaseYear: parseYear(raw.year),
    coverArtUrl,
  };
};

export const buildAlbumDetail = (
  albumId: string,
  tracks: readonly AlbumTrackInput[],
  baseUrl: string,
): AlbumDetail => {
  const firstTrack = tracks[0]!;
  const albumArtist =
    tracks.find((track) => track.albumartist?.trim())?.albumartist?.trim() ||
    findMostCommonArtist(tracks.map((track) => track.artist ?? "")) ||
    "";

  return {
    id: albumId,
    title: firstTrack.album ?? "",
    artist: albumArtist,
    releaseYear: parseYear(firstTrack.year),
    coverArtUrl: buildAlbumCoverArtUrl(firstTrack.id, baseUrl),
    tracks: tracks.map((raw, index) => mapAlbumTrack(raw, index + 1)),
  };
};

export const buildArtistDetail = (
  artistId: string,
  artistName: string | null,
  albums: readonly ArtistAlbumInput[],
  baseUrl: string,
): ArtistDetail => ({
  id: artistId,
  name: artistName ?? albums[0]?.artist ?? "",
  albums: [...albums]
    .sort((a, b) => (parseYear(b.year) ?? 0) - (parseYear(a.year) ?? 0))
    .map((raw) => mapArtistAlbum(raw, baseUrl)),
});
