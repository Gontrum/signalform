import { ok, err, type Result } from "@signalform/shared";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type {
  ArtistTopAlbum as LastFmArtistTopAlbum,
  ArtistTopTrack as LastFmArtistTopTrack,
  LastFmError,
} from "../../../adapters/lastfm-client/index.js";
import {
  buildAlbumDetail,
  mapArtistAlbumPopularity,
  resolveArtistTopTracks,
} from "../core/service.js";
import type {
  AlbumDetail,
  AlbumServiceError,
  ArtistPopularityServiceError,
  ArtistTopAlbumsResponse,
  ArtistTopTracksResponse,
} from "../core/types.js";

export type ArtistPopularityClient = {
  readonly getArtistTopTracks: (
    artist: string,
    limit?: number,
  ) => Promise<Result<readonly LastFmArtistTopTrack[], LastFmError>>;
  readonly getArtistTopAlbums: (
    artist: string,
    limit?: number,
  ) => Promise<Result<readonly LastFmArtistTopAlbum[], LastFmError>>;
};

const mapLastFmPopularityError = (
  error: LastFmError,
): ArtistPopularityServiceError =>
  error.type === "NotFoundError"
    ? { type: "NotFound", message: error.message }
    : { type: "Unavailable", message: error.message };

export const getAlbumDetail = async (
  albumId: string,
  lmsClient: LmsClient,
  config: LmsConfig,
): Promise<Result<AlbumDetail, AlbumServiceError>> => {
  const tracksResult = await lmsClient.getAlbumTracks(albumId);

  if (!tracksResult.ok) {
    return err({ type: "LmsError", message: tracksResult.error.message });
  }

  const tracks = tracksResult.value;

  if (tracks.length === 0) {
    return err({
      type: "NotFound",
      message: `Album ${albumId} not found or has no tracks`,
    });
  }

  const baseUrl = `http://${config.host}:${config.port}`;

  return ok(buildAlbumDetail(albumId, tracks, baseUrl));
};

const searchPlayableCandidates = async (
  artist: string,
  topTrack: LastFmArtistTopTrack,
  lmsClient: LmsClient,
): Promise<readonly SearchResult[]> => {
  const result = await lmsClient.search(`${artist} ${topTrack.name}`);
  return result.ok ? result.value.tracks : [];
};

export const getArtistTopTracksByName = async (
  artist: string,
  lmsClient: LmsClient,
  popularityClient: ArtistPopularityClient,
  limit: number,
): Promise<Result<ArtistTopTracksResponse, ArtistPopularityServiceError>> => {
  const topTracksResult = await popularityClient.getArtistTopTracks(
    artist,
    limit,
  );
  if (!topTracksResult.ok) {
    return err(mapLastFmPopularityError(topTracksResult.error));
  }

  const candidateSets = await Promise.all(
    topTracksResult.value.map((topTrack) =>
      searchPlayableCandidates(artist, topTrack, lmsClient),
    ),
  );

  return ok({
    artist,
    tracks: resolveArtistTopTracks(
      artist,
      topTracksResult.value,
      candidateSets,
    ),
  });
};

export const getArtistTopAlbumsByName = async (
  artist: string,
  popularityClient: ArtistPopularityClient,
  limit: number,
): Promise<Result<ArtistTopAlbumsResponse, ArtistPopularityServiceError>> => {
  const topAlbumsResult = await popularityClient.getArtistTopAlbums(
    artist,
    limit,
  );
  if (!topAlbumsResult.ok) {
    return err(mapLastFmPopularityError(topAlbumsResult.error));
  }

  return ok({
    artist,
    albums: mapArtistAlbumPopularity(topAlbumsResult.value),
  });
};
