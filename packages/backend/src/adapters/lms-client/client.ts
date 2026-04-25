/**
 * LMS Client Implementation
 *
 * Type-safe wrapper for Lyrion Music Server JSON-RPC 2.0 protocol.
 * Implements functional programming patterns with Result<T, E>.
 *
 * This file is a thin assembler — domain logic lives in:
 *   helpers.ts    — pure functions and constants
 *   execute.ts    — executeCommand infrastructure
 *   playback.ts   — play, pause, resume, getStatus, volume, seek, …
 *   queue.ts      — getQueue, jumpToTrack, removeFromQueue, addToQueue, …
 *   search.ts     — search (local + Tidal parallel), enrichment
 *   library.ts    — playAlbum, playTidalAlbum, getAlbumTracks, getLibraryAlbums, rescan, …
 *   tidal-albums.ts — getTidalAlbums, getTidalAlbumTracks, getTidalArtistAlbums, getTidalFeaturedAlbums
 *   tidal-search.ts — searchTidalArtists, findTidalSearchAlbumId
 */

import type { LmsConfig } from "./types.js";
import { makeExecuteCommand, makeExecuteCommandWithRetry } from "./execute.js";
import { createPlaybackMethods, type PlaybackMethods } from "./playback.js";
import { createQueueMethods, type QueueMethods } from "./queue.js";
import { createSearchMethods } from "./search.js";
import { createLibraryMethods, type LibraryMethods } from "./library.js";
import {
  createTidalAlbumsMethods,
  type TidalAlbumsMethods,
} from "./tidal-albums.js";
import {
  createTidalSearchMethods,
  type TidalSearchMethods,
} from "./tidal-search.js";

type LmsClientMethods = PlaybackMethods &
  QueueMethods &
  ReturnType<typeof createSearchMethods> &
  LibraryMethods &
  TidalAlbumsMethods &
  TidalSearchMethods;

const createLmsClientInternal = (config: LmsConfig): LmsClientMethods => {
  const executeCommand = makeExecuteCommand(config);
  const executeCommandWithRetry = makeExecuteCommandWithRetry(
    executeCommand,
    config,
  );
  const deps = { executeCommand, executeCommandWithRetry, config };

  return {
    ...createPlaybackMethods(deps),
    ...createQueueMethods(deps),
    ...createSearchMethods(deps),
    ...createLibraryMethods(deps),
    ...createTidalAlbumsMethods(deps),
    ...createTidalSearchMethods(deps),
  };
};

/**
 * Type for LMS client instance.
 */
export type LmsClient = LmsClientMethods;

/**
 * Factory function to create LMS client instance.
 * @param config - Configuration for LMS connection
 * @returns LMS client with typed methods
 */
export const createLmsClient = (config: LmsConfig): LmsClient => {
  return createLmsClientInternal(config);
};
