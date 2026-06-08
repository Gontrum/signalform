/**
 * LMS Tidal Search Domain Methods
 *
 * Factory function for Tidal search/discovery LMS client methods:
 * searchTidalArtists.
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
};

const tidalSearchArtistsPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z.array(tidalItemSchema).optional(),
    count: z.number().optional(),
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
  };
};
