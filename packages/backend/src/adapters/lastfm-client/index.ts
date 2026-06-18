export { createLastFmClient } from "./client.js";
export { createCircuitBreakerLastFmClient } from "./circuit-breaker-client.js";
export type {
  LastFmClient,
  LastFmConfig,
  LastFmError,
  SimilarTrack,
  SimilarArtist,
  ArtistInfo,
  AlbumInfo,
  ArtistTopTrack,
  ArtistTopAlbum,
  TagTopTrack,
  TagSearchResult,
  LastFmPeriod,
  UserTopArtist,
  UserTopTrack,
  UserLovedTrack,
  UserRecentTrack,
  CircuitBreakerConfig,
} from "./types.js";
