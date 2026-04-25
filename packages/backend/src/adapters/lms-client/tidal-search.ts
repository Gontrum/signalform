/**
 * LMS Tidal Search Domain Methods
 *
 * Factory function for Tidal search/discovery LMS client methods:
 * searchTidalArtists, findTidalSearchAlbumId.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, err, type Result } from "@signalform/shared";
import { z } from "zod";
import type { LmsCommand, LmsError, TidalSearchArtistRaw } from "./types.js";
import { createLmsResultParser, type ExecuteDeps } from "./execute.js";
import { tidalItemSchema } from "./schemas.js";

export type TidalSearchMethods = {
  readonly searchTidalArtists: (
    query: string,
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      {
        readonly artists: readonly TidalSearchArtistRaw[];
        readonly count: number;
      },
      LmsError
    >
  >;
  readonly findTidalSearchAlbumId: (
    albumTitle: string,
    artist: string,
  ) => Promise<Result<string | null, LmsError>>;
};

const tidalSearchArtistsPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z.array(tidalItemSchema).optional(),
    count: z.number().optional(),
  }),
);

const tidalAlbumLookupPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
        }),
      )
      .optional(),
  }),
);

/**
 * Creates the Tidal search domain methods bound to the provided ExecuteDeps.
 */
export const createTidalSearchMethods = (
  deps: ExecuteDeps,
): TidalSearchMethods => {
  const { executeCommand } = deps;

  return {
    /**
     * Search Tidal artists by query string via LMS Tidal plugin.
     *
     * Story 8.8 (AC2): item_id:7_{query}.2 navigates to "Suchen → Interpreten" in Tidal plugin.
     * Pattern mirrors searchTidal tracks (item_id:7_{query}.4 = Titel, .2 = Interpreten).
     *
     * @param query - Search query (e.g. "Sabrina Carpenter")
     * @param offset - Pagination start index
     * @param limit - Maximum artists to return
     * @returns Result with raw artist list + total count or error
     */
    searchTidalArtists: async (
      query: string,
      offset: number,
      limit: number,
    ): Promise<
      Result<
        {
          readonly artists: readonly TidalSearchArtistRaw[];
          readonly count: number;
        },
        LmsError
      >
    > => {
      const trimmedQuery = query.trim();
      if (trimmedQuery === "") {
        return err({
          type: "EmptyQueryError",
          message: "Search query cannot be empty",
        });
      }

      // item_id:7_{query}.2 navigates to "Suchen → Interpreten" (Artists) in Tidal plugin app.
      // Pattern: item_id:7_{query}.4 = Titel (tracks, Story 7.7), .2 = Interpreten (artists).
      const command: LmsCommand = [
        "tidal",
        "items",
        offset,
        limit,
        `item_id:7_${trimmedQuery}.2`,
        `search:${trimmedQuery}`,
        "want_url:1",
      ];

      const result = await executeCommand(
        command,
        tidalSearchArtistsPayloadParser,
      );

      if (!result.ok) {
        return result;
      }

      const artists = result.value.loop_loop ?? [];
      const count = result.value.count ?? 0;

      return ok({ artists, count });
    },

    /**
     * Find the Tidal browse album ID for a search-result album.
     *
     * Uses item_id:7_{title}.3 to browse the "Alben" section of Tidal search results.
     * Live probe (2026-03-17): search submenu indices are .0=Alles, .1=Playlists, .2=Artists,
     * .3=Alben (Albums), .4=Titel (Tracks). Album name format: title only (may have "[E]" suffix).
     *
     * Matching: case-insensitive startsWith — handles "[E]" explicit suffix correctly.
     *
     * @param albumTitle - Album title from search result (e.g. "Short n' Sweet")
     * @param _artist - Artist name (not used in matching — Tidal search name field is title-only)
     * @returns Result with browse ID (e.g. "7_short n' sweet.3.0") or null if not found
     */
    findTidalSearchAlbumId: async (
      albumTitle: string,
      _artist: string,
    ): Promise<Result<string | null, LmsError>> => {
      const trimmedTitle = albumTitle.trim();
      if (trimmedTitle === "") {
        return ok(null);
      }

      // item_id:7_{query}.3 → "Suchen → Alben" (Albums) in Tidal plugin
      const command: LmsCommand = [
        "tidal",
        "items",
        0,
        10,
        `item_id:7_${trimmedTitle}.3`,
        "want_url:1",
      ];

      const result = await executeCommand(
        command,
        tidalAlbumLookupPayloadParser,
      );

      if (!result.ok) {
        return result;
      }

      const searchAlbums = result.value.loop_loop ?? [];
      const normalizedTitle = trimmedTitle.toLowerCase();

      // Name format: title only, possibly with "[E]" suffix for explicit albums.
      // startsWith check: "short n' sweet [e]".startsWith("short n' sweet") → true
      const match = searchAlbums.find((a) =>
        (a.name ?? "").toLowerCase().startsWith(normalizedTitle),
      );

      return ok(match?.id ?? null);
    },
  };
};
