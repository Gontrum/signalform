import type {
  LibraryAlbum,
  LibraryAlbumsResponse,
  LibraryServiceError,
} from "./types.js";

type LibraryAlbumInput = {
  readonly id: number | string;
  readonly album: string;
  readonly artist?: string;
  readonly year?: number;
  readonly artwork_track_id?: string;
  readonly genre?: string;
};

const buildLibraryCoverArtUrl = (
  raw: LibraryAlbumInput,
  baseUrl: string,
): string => {
  return raw.artwork_track_id
    ? `${baseUrl}/music/${raw.artwork_track_id}/cover.jpg`
    : `${baseUrl}/music/0/cover.jpg?album_id=${raw.id}`;
};

const mapLibraryAlbum = (
  raw: LibraryAlbumInput,
  baseUrl: string,
): LibraryAlbum => ({
  id: String(raw.id),
  title: raw.album,
  artist: raw.artist ?? "",
  releaseYear: raw.year && raw.year > 0 ? raw.year : null,
  genre: raw.genre && raw.genre.trim().length > 0 ? raw.genre.trim() : null,
  coverArtUrl: buildLibraryCoverArtUrl(raw, baseUrl),
});

export const buildLibraryAlbumsResponse = (
  albums: readonly LibraryAlbumInput[],
  totalCount: number,
  baseUrl: string,
): LibraryAlbumsResponse => ({
  albums: albums.map((raw) => mapLibraryAlbum(raw, baseUrl)),
  totalCount,
});

export const mapLibraryLmsError = (message: string): LibraryServiceError => ({
  type: "LmsError",
  message,
});
