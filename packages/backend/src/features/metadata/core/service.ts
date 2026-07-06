import { parseAudioQuality } from "../../../adapters/lms-client/helpers.js";
import type {
  AlbumDetail,
  AlbumTrack,
  ArtistAlbumPopularity,
  ArtistTopTrack,
  ArtistTopTrackInput,
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

type ArtistTopTrackCandidate = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly albumartist?: string;
  readonly album: string;
  readonly url: string;
  readonly source: "local" | "qobuz" | "tidal" | "unknown";
  readonly type: "track" | "artist" | "album";
  readonly coverArtUrl?: string;
  readonly audioQuality?: ArtistTopTrack["audioQuality"];
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

const normalizeMatchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

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

const sourceRank = (
  source: "local" | "qobuz" | "tidal" | "unknown",
): number => {
  if (source === "local") {
    return 0;
  }
  if (source === "qobuz") {
    return 1;
  }
  if (source === "tidal") {
    return 2;
  }
  return 3;
};

const titlesMatch = (a: string, b: string): boolean =>
  a === b || a.includes(b) || b.includes(a);

const selectPlayableTopTrack = (
  artist: string,
  topTrack: ArtistTopTrackInput,
  candidates: readonly ArtistTopTrackCandidate[],
): ArtistTopTrackCandidate | undefined => {
  const normalizedArtist = normalizeMatchText(artist);
  const normalizedTitle = normalizeMatchText(topTrack.name);

  return [...candidates]
    .filter((candidate) => {
      const candidateArtist = normalizeMatchText(
        candidate.albumartist ?? candidate.artist,
      );
      const artistMatches =
        candidateArtist === normalizedArtist ||
        (candidateArtist === "" && candidate.source === "tidal");
      return (
        candidate.type === "track" &&
        titlesMatch(normalizeMatchText(candidate.title), normalizedTitle) &&
        artistMatches &&
        candidate.url.trim() !== ""
      );
    })
    .sort(
      (left, right) => sourceRank(left.source) - sourceRank(right.source),
    )[0];
};

export const resolveArtistTopTracks = (
  artist: string,
  topTracks: readonly ArtistTopTrackInput[],
  candidateSets: readonly (readonly ArtistTopTrackCandidate[])[],
): readonly ArtistTopTrack[] =>
  topTracks.flatMap((topTrack, index): readonly ArtistTopTrack[] => {
    const playable = selectPlayableTopTrack(
      artist,
      topTrack,
      candidateSets[index] ?? [],
    );
    if (playable === undefined) {
      return [];
    }

    return [
      {
        id: playable.id,
        title: playable.title,
        artist: playable.artist,
        album: playable.album,
        url: playable.url,
        source: playable.source,
        playcount: topTrack.playcount,
        listeners: topTrack.listeners,
        rank: index + 1,
        coverArtUrl: playable.coverArtUrl,
        audioQuality: playable.audioQuality,
      },
    ];
  });

export const mapArtistAlbumPopularity = (
  topAlbums: readonly {
    readonly name: string;
    readonly artist: string;
    readonly playcount: number;
  }[],
): readonly ArtistAlbumPopularity[] =>
  topAlbums.map((album, index) => ({
    title: album.name,
    artist: album.artist,
    playcount: album.playcount,
    rank: index + 1,
  }));
