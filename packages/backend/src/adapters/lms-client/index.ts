/**
 * LMS Client - Public API
 *
 * Type-safe wrapper for Lyrion Music Server JSON-RPC 2.0 protocol.
 */

export { createLmsClient } from "./client.js";
export type { LmsClient } from "./client.js";
export type {
  LmsConfig,
  LmsCommand,
  LmsRequest,
  LmsResponse,
  LmsError,
  SearchResult,
  PlayerStatus,
  AlbumTrackRaw,
  ArtistAlbumRaw,
  LibraryAlbumRaw,
  TidalAlbumRaw,
  TidalTrackRaw,
  TidalArtistAlbumRaw,
  TidalSearchArtistRaw,
  QueueTrackRaw,
  RescanProgress,
} from "./types.js";
