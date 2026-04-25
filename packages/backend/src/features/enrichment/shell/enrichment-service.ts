import { ok, err, type Result } from "@signalform/shared";
import type { Language } from "../../../infrastructure/config/index.js";
import { mapLastFmError } from "../core/service.js";
import type {
  ArtistEnrichment,
  AlbumEnrichment,
  EnrichmentError,
  LastFmAlbumInfo,
  LastFmArtistInfo,
  LastFmServiceError,
  SimilarArtist,
} from "../core/types.js";

export type ArtistInfoClient = {
  readonly getArtistInfo: (
    name: string,
    language: Language,
  ) => Promise<Result<LastFmArtistInfo, LastFmServiceError>>;
};

export type AlbumInfoClient = {
  readonly getAlbumInfo: (
    artist: string,
    album: string,
    language: Language,
  ) => Promise<Result<LastFmAlbumInfo, LastFmServiceError>>;
};

export type SimilarArtistsClient = {
  readonly getSimilarArtists: (
    name: string,
    limit: number,
  ) => Promise<Result<readonly SimilarArtist[], LastFmServiceError>>;
};

export const getArtistEnrichment = async (
  name: string,
  client: ArtistInfoClient,
  language: Language,
): Promise<Result<ArtistEnrichment, EnrichmentError>> => {
  const result = await client.getArtistInfo(name, language);
  if (!result.ok) {
    return err(mapLastFmError(result.error));
  }
  const info = result.value;
  return ok({
    name: info.name,
    mbid: info.mbid,
    listeners: info.listeners,
    playcount: info.playcount,
    tags: info.tags,
    bio: info.bio,
  });
};

export const getAlbumEnrichment = async (
  artist: string,
  album: string,
  client: AlbumInfoClient,
  language: Language,
): Promise<Result<AlbumEnrichment, EnrichmentError>> => {
  const result = await client.getAlbumInfo(artist, album, language);
  if (!result.ok) {
    return err(mapLastFmError(result.error));
  }
  const info = result.value;
  return ok({
    name: info.name,
    mbid: info.mbid,
    listeners: info.listeners,
    playcount: info.playcount,
    tags: info.tags,
    wiki: info.wiki,
  });
};

export const getSimilarArtistsEnrichment = async (
  name: string,
  client: SimilarArtistsClient,
  limit = 6,
): Promise<Result<readonly SimilarArtist[], EnrichmentError>> => {
  const result = await client.getSimilarArtists(name, limit);
  if (!result.ok) {
    return err(mapLastFmError(result.error));
  }
  return ok(result.value);
};
