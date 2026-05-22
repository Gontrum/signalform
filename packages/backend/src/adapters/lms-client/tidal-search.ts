/**
 * LMS Tidal Search Domain Methods
 *
 * Factory function for Tidal search/discovery LMS client methods:
 * searchTidalArtists, findTidalSearchAlbumId, searchTidalAlbumTracks.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, err, type Result } from "@signalform/shared";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { LmsCommand, LmsError, TidalSearchArtistRaw } from "./types.js";
import { createLmsResultParser, type ExecuteDeps } from "./execute.js";
import { tidalItemSchema } from "./schemas.js";
import { extractTidalTrackId, parseTidalInfo } from "./helpers.js";

// Enrichment timeout for album track search: 300ms (Tidal can be slower than regular search)
const TIDAL_ALBUM_TRACK_ENRICH_TIMEOUT_MS = 300;

/**
 * Raw Tidal track result from searchTidalAlbumTracks.
 * id and url are both the tidal:// playback URL.
 */
export type TidalTrackSearchResultRaw = {
  readonly id: string; // tidal:// URL (playback URL)
  readonly name: string; // track title
  readonly url: string; // same as id — the tidal:// URL
  readonly albumName?: string; // populated after tidal_info enrichment
};

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
  readonly searchTidalAlbumTracks: (
    albumTitle: string,
    artist: string,
  ) => Promise<Result<readonly TidalTrackSearchResultRaw[], LmsError>>;
};

const tidalSearchArtistsPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z.array(tidalItemSchema).optional(),
    count: z.number().optional(),
  }),
);

const tidalTrackSearchPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          url: z.string().optional(),
          isaudio: z.number().optional(),
        }),
      )
      .optional(),
  }),
);

const tidalInfoPayloadParser = createLmsResultParser(
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

  // Enriches a single raw track with albumName via tidal_info.
  // 300ms timeout per track — Tidal can be slow on album-track lookups.
  // On failure or timeout: track is returned with albumName undefined.
  const enrichTrackWithAlbumName = (
    track: TidalTrackSearchResultRaw,
  ): Promise<TidalTrackSearchResultRaw> => {
    const trackId = extractTidalTrackId(track.url);
    if (!trackId) {
      return Promise.resolve(track);
    }

    const command: LmsCommand = [
      "tidal_info",
      "items",
      0,
      10,
      `id:${trackId}`,
      "type:track",
    ];

    const enrichController = new AbortController();

    const timeoutPromise = delay(TIDAL_ALBUM_TRACK_ENRICH_TIMEOUT_MS).then(
      () => {
        enrichController.abort();
        return track;
      },
    );

    const enrichPromise = executeCommand(
      command,
      tidalInfoPayloadParser,
      enrichController.signal,
    ).then((result): TidalTrackSearchResultRaw => {
      if (!result.ok) {
        return track;
      }
      const loopLoop = result.value.loop_loop ?? [];
      const { album } = parseTidalInfo(loopLoop);
      return { ...track, albumName: album || undefined };
    });

    return Promise.race([enrichPromise, timeoutPromise]);
  };

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
     * Matching strategy:
     * 1. Primary: case-insensitive startsWith — handles "[E]" explicit suffix correctly.
     * 2. Secondary (classical "Composer: Work" format): when trimmedTitle contains ":",
     *    extract the work title after the last colon and match by startsWith or includes.
     *    Tidal stores "Symphony No. 5" even when the search title is "Mahler: Symphony No. 5".
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

      // item_id:7_{query}.3 (Albums section) OOM-kills LMS for any query returning many
      // recordings — confirmed for classical works AND simplified titles.
      // The Tidal plugin fetches ALL results before paging, so even limit:10 is unsafe.
      // Resolution via album browse is disabled; callers fall back to track-search display.
      return ok(null);
    },

    /**
     * Search for Tidal tracks for a specific album using the Tracks section (item_id:7_{query}.4).
     *
     * This is SAFE — unlike the Albums section (.3), the Tracks section does not OOM LMS.
     * Query is built from artist + work title (strips "Composer: " prefix for classical works).
     * Each track is enriched with albumName via tidal_info (300ms timeout, concurrent).
     *
     * @param albumTitle - Album title (e.g. "Mahler: Symphony No. 5" or "OK Computer")
     * @param artist - Artist/performer name (e.g. "Berliner Philharmoniker" or "Radiohead")
     * @returns Result with raw track list (with albumName from tidal_info) or error
     */
    searchTidalAlbumTracks: async (
      albumTitle: string,
      artist: string,
    ): Promise<Result<readonly TidalTrackSearchResultRaw[], LmsError>> => {
      const trimmedTitle = albumTitle.trim();
      if (trimmedTitle === "") {
        return ok([]);
      }

      // Strip "Composer: " prefix for classical works (e.g. "Mahler: Symphony No. 5" → "Symphony No. 5")
      const colonIdx = trimmedTitle.indexOf(":");
      const workTitle =
        colonIdx >= 0 ? trimmedTitle.slice(colonIdx + 1).trim() : trimmedTitle;

      const trimmedArtist = artist.trim();
      const query =
        trimmedArtist !== "" ? `${trimmedArtist} ${workTitle}` : workTitle;

      // item_id:7_{query}.4 = Tidal "Suchen → Titel" (Tracks section) — SAFE, no OOM risk.
      const command: LmsCommand = [
        "tidal",
        "items",
        0,
        50,
        `item_id:7_${query}.4`,
        "want_url:1",
      ];

      const result = await executeCommand(
        command,
        tidalTrackSearchPayloadParser,
      );

      if (!result.ok) {
        return result;
      }

      const rawLoop = result.value.loop_loop ?? [];
      const tracks: readonly TidalTrackSearchResultRaw[] = rawLoop
        .filter((item) => item.isaudio === 1 && item.url !== undefined)
        .map((item) => ({
          id: item.url!,
          name: item.name ?? "",
          url: item.url!,
        }));

      // Enrich tracks concurrently with albumName via tidal_info (300ms timeout per track).
      // On per-track failure: track kept with albumName undefined.
      const enrichResults = await Promise.allSettled(
        tracks.map(enrichTrackWithAlbumName),
      );
      const enrichedTracks = enrichResults.map((settled, idx) =>
        settled.status === "fulfilled" ? settled.value : tracks[idx]!,
      );

      return ok(enrichedTracks);
    },
  };
};
