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

/**
 * Maps a Last.fm client result onto the enrichment error type, applying
 * `mapValue` to the success payload. Shared by the three enrichment lookups
 * below, which only differ in the upstream call and success shape.
 */
const mapEnrichmentResult = <T, U>(
  result: Result<T, LastFmServiceError>,
  mapValue: (value: T) => U,
): Result<U, EnrichmentError> => {
  if (!result.ok) {
    return err(mapLastFmError(result.error));
  }
  return ok(mapValue(result.value));
};

export const getArtistEnrichment = async (
  name: string,
  client: ArtistInfoClient,
  language: Language,
): Promise<Result<ArtistEnrichment, EnrichmentError>> => {
  const result = await client.getArtistInfo(name, language);
  return mapEnrichmentResult(result, (info) => ({
    name: info.name,
    mbid: info.mbid,
    listeners: info.listeners,
    playcount: info.playcount,
    tags: info.tags,
    bio: info.bio,
  }));
};

export const getAlbumEnrichment = async (
  artist: string,
  album: string,
  client: AlbumInfoClient,
  language: Language,
): Promise<Result<AlbumEnrichment, EnrichmentError>> => {
  const result = await client.getAlbumInfo(artist, album, language);
  return mapEnrichmentResult(result, (info) => ({
    name: info.name,
    mbid: info.mbid,
    listeners: info.listeners,
    playcount: info.playcount,
    tags: info.tags,
    wiki: info.wiki,
  }));
};

export const getSimilarArtistsEnrichment = async (
  name: string,
  client: SimilarArtistsClient,
  limit = 6,
): Promise<Result<readonly SimilarArtist[], EnrichmentError>> => {
  const result = await client.getSimilarArtists(name, limit);
  return mapEnrichmentResult(result, (artists) => artists);
};
