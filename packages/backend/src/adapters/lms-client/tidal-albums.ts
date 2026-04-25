/**
 * LMS Tidal Albums Domain Methods
 *
 * Factory function for Tidal album browse LMS client methods:
 * getTidalAlbums, getTidalAlbumTracks, getTidalArtistAlbums, getTidalFeaturedAlbums.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, type Result } from "@signalform/shared";
import type {
  LmsCommand,
  LmsError,
  TidalAlbumRaw,
  TidalArtistAlbumRaw,
  TidalTrackRaw,
} from "./types.js";
import { type ExecuteDeps } from "./execute.js";
import {
  tidalTracksPayloadParser,
  tidalAlbumsPayloadParser,
  tidalArtistAlbumsPayloadParser,
} from "./schemas.js";

export type TidalAlbumsMethods = {
  readonly getTidalAlbums: (
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      { readonly albums: readonly TidalAlbumRaw[]; readonly count: number },
      LmsError
    >
  >;
  readonly getTidalAlbumTracks: (
    albumId: string,
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      { readonly tracks: readonly TidalTrackRaw[]; readonly count: number },
      LmsError
    >
  >;
  readonly getTidalArtistAlbums: (
    artistId: string,
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      {
        readonly albums: readonly TidalArtistAlbumRaw[];
        readonly count: number;
      },
      LmsError
    >
  >;
  readonly getTidalFeaturedAlbums: (
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      { readonly albums: readonly TidalAlbumRaw[]; readonly count: number },
      LmsError
    >
  >;
};

/**
 * Creates the Tidal albums domain methods bound to the provided ExecuteDeps.
 */
export const createTidalAlbumsMethods = (
  deps: ExecuteDeps,
): TidalAlbumsMethods => {
  const { executeCommand } = deps;

  return {
    /**
     * Get albums from the user's Tidal library.
     *
     * Uses Tidal plugin items command with item_id:4 ("Alben" = user's library albums).
     * Live probe 2026-03-15: name = "{title} - {artist}", image = relative LMS proxy path.
     *
     * @param offset - Pagination start index
     * @param limit - Maximum albums to return (max 500)
     * @returns Result with raw album list + total count or error
     */
    getTidalAlbums: async (
      offset: number,
      limit: number,
    ): Promise<
      Result<
        { readonly albums: readonly TidalAlbumRaw[]; readonly count: number },
        LmsError
      >
    > => {
      const command: LmsCommand = [
        "tidal",
        "items",
        offset,
        limit,
        "item_id:4",
        "want_url:1",
      ];

      const result = await executeCommand(command, tidalAlbumsPayloadParser);

      if (!result.ok) {
        return result;
      }

      const albums = result.value.loop_loop ?? [];
      const count = result.value.count ?? 0;

      return ok({ albums, count });
    },

    /**
     * Get tracks from a specific Tidal album.
     *
     * Uses Tidal plugin items command with item_id:{albumId} to browse into the album.
     * Story 8.1: album IDs are positional indices like "4.0", "4.1" from getTidalAlbums.
     *
     * @param albumId - Tidal album item ID (e.g. "4.0")
     * @param offset - Pagination start index
     * @param limit - Maximum tracks to return
     * @returns Result with raw track list + total count or error
     */
    getTidalAlbumTracks: async (
      albumId: string,
      offset: number,
      limit: number,
    ): Promise<
      Result<
        { readonly tracks: readonly TidalTrackRaw[]; readonly count: number },
        LmsError
      >
    > => {
      const command: LmsCommand = [
        "tidal",
        "items",
        offset,
        limit,
        `item_id:${albumId}`,
        "want_url:1",
      ];

      const result = await executeCommand(command, tidalTracksPayloadParser);

      if (!result.ok) {
        return result;
      }

      const tracks = result.value.loop_loop ?? [];
      const count = result.value.count ?? 0;

      return ok({ tracks, count });
    },

    /**
     * Get albums for a specific Tidal artist.
     *
     * Uses Tidal plugin items command with item_id:{artistId}.1 to browse the artist's
     * "Alben" section (always position 1 in artist submenu — verified live probe 2026-03-15).
     *
     * Live probe 2026-03-15 (Story 8.6):
     * - Artist IDs: "6.0", "6.1", etc. (from getTidalArtists / item_id:6 browse)
     * - Album IDs: "{artistId}.1.0", "{artistId}.1.1", etc.
     * - name field: album title ONLY — NOT "{title} - {artist}" (differs from TidalAlbumRaw)
     *
     * @param artistId - Tidal artist item ID (e.g. "6.0")
     * @param offset - Pagination start index
     * @param limit - Maximum albums to return (max 500)
     * @returns Result with raw album list + total count or error
     */
    getTidalArtistAlbums: async (
      artistId: string,
      offset: number,
      limit: number,
    ): Promise<
      Result<
        {
          readonly albums: readonly TidalArtistAlbumRaw[];
          readonly count: number;
        },
        LmsError
      >
    > => {
      // Albums are at {artistId}.1 — the "Alben" submenu (always position 1 in artist submenu)
      const albumsItemId = `${artistId}.1`;
      const command: LmsCommand = [
        "tidal",
        "items",
        offset,
        limit,
        `item_id:${albumsItemId}`,
        "want_url:1",
      ];

      const result = await executeCommand(
        command,
        tidalArtistAlbumsPayloadParser,
      );

      if (!result.ok) {
        return result;
      }

      const albums = result.value.loop_loop ?? [];
      const count = result.value.count ?? 0;

      return ok({ albums, count });
    },

    /**
     * Get Tidal Featured albums (item_id:1.0.1 = Featured → Neu → Alben).
     *
     * Story 8.9 AC2: entry point into Tidal catalog without requiring user favorites.
     * Live probe 2026-03-16: returns ~52 albums in "Title - Artist" format (TidalAlbumRaw).
     * Album IDs: "1.0.1.0", "1.0.1.1", etc. — compatible with isTidalAlbumId (see @signalform/shared).
     *
     * @param offset - Pagination start index
     * @param limit - Maximum albums to return (max 500)
     * @returns Result with raw album list + total count or error
     */
    getTidalFeaturedAlbums: async (
      offset: number,
      limit: number,
    ): Promise<
      Result<
        { readonly albums: readonly TidalAlbumRaw[]; readonly count: number },
        LmsError
      >
    > => {
      const command: LmsCommand = [
        "tidal",
        "items",
        offset,
        limit,
        "item_id:1.0.1",
        "want_url:1",
      ];

      const result = await executeCommand(command, tidalAlbumsPayloadParser);

      if (!result.ok) {
        return result;
      }

      const albums = result.value.loop_loop ?? [];
      const count = result.value.count ?? 0;

      return ok({ albums, count });
    },
  };
};
