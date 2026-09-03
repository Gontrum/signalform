/**
 * LMS Tidal Playlists Domain Methods
 *
 * Factory function for Tidal playlist browse/play LMS client methods:
 * getTidalPlaylists, getTidalPlaylistTracks, playTidalPlaylist.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, type Result } from "@signalform/shared";
import type { LmsError, TidalAlbumRaw, TidalTrackRaw } from "./types.js";
import { type ExecuteDeps } from "./execute.js";
import {
  executeTidalItems,
  tidalTracksPayloadParser,
  tidalAlbumsPayloadParser,
} from "./schemas.js";

// Menu node of the Tidal plugin: 3 = "Wiedergabelisten" (playlists).
// Siblings: 4 = albums, 6 = artists, 7 = search.
const TIDAL_PLAYLISTS_ITEM_ID = "3";

export type TidalPlaylistsMethods = {
  readonly getTidalPlaylists: (
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      { readonly items: readonly TidalAlbumRaw[]; readonly count: number },
      LmsError
    >
  >;
  readonly getTidalPlaylistTracks: (
    playlistId: string,
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      { readonly items: readonly TidalTrackRaw[]; readonly count: number },
      LmsError
    >
  >;
  readonly playTidalPlaylist: (
    playlistId: string,
  ) => Promise<Result<void, LmsError>>;
};

/**
 * Creates the Tidal playlists domain methods bound to the provided ExecuteDeps.
 */
export const createTidalPlaylistsMethods = (
  deps: ExecuteDeps,
): TidalPlaylistsMethods => {
  const { executeCommand } = deps;

  return {
    /**
     * Get the user's Tidal playlists.
     *
     * Uses Tidal plugin items command with item_id:3 ("Wiedergabelisten" = user's playlists).
     * Response shape is identical to Tidal albums (tidalAlbumsPayloadParser) — `name`
     * is the raw playlist name here, not "{title} - {artist}".
     *
     * @param offset - Pagination start index
     * @param limit - Maximum playlists to return (max 500)
     * @returns Result with raw playlist list + total count or error
     */
    getTidalPlaylists: (offset, limit) =>
      executeTidalItems(
        executeCommand,
        tidalAlbumsPayloadParser,
        offset,
        limit,
        TIDAL_PLAYLISTS_ITEM_ID,
      ),

    /**
     * Get tracks of a specific Tidal playlist.
     *
     * Uses Tidal plugin items command with item_id:{playlistId} to browse into the
     * playlist. Playlist IDs are positional indices like "3.0", "3.1" from getTidalPlaylists.
     *
     * @param playlistId - Tidal playlist item ID (e.g. "3.0")
     * @param offset - Pagination start index
     * @param limit - Maximum tracks to return
     * @returns Result with raw track list + total count or error
     */
    getTidalPlaylistTracks: (playlistId, offset, limit) =>
      executeTidalItems(
        executeCommand,
        tidalTracksPayloadParser,
        offset,
        limit,
        playlistId,
      ),

    /**
     * Play a Tidal playlist by replacing the current queue and starting playback.
     *
     * Uses ["tidal", "playlist", "play", "item_id:{playlistId}"] — one LMS command
     * loads the full playlist (verified live probe 2026-09-02), unlike album playback
     * which still fetches tracks and appends one by one.
     *
     * @param playlistId - Tidal playlist item ID (e.g. "3.0")
     * @returns Result<void, LmsError>
     */
    playTidalPlaylist: async (playlistId): Promise<Result<void, LmsError>> => {
      const result = await executeCommand([
        "tidal",
        "playlist",
        "play",
        `item_id:${playlistId}`,
      ]);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },
  };
};
