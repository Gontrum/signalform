/**
 * LMS Search Domain Methods
 *
 * Factory function for search-related LMS client methods:
 * search (local + Tidal in parallel), enrichSingleTrack, enrichTidalTracks.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, err, type Result } from "@signalform/shared";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { LmsCommand, LmsError, SearchResult } from "./types.js";
import {
  MAX_SEARCH_RESULTS,
  TIDAL_SEARCH_TIMEOUT_MS,
  TIDAL_ENRICH_TIMEOUT_MS,
  extractTidalTrackId,
  parseTidalAudioQuality,
  parseTidalInfo,
  detectSource,
  parseAudioQuality,
} from "./helpers.js";
import { createLmsResultParser, type ExecuteDeps } from "./execute.js";

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

const localSearchPayloadParser = createLmsResultParser(
  z.object({
    titles_loop: z
      .array(
        z.object({
          id: z.number(),
          title: z.string(),
          artist: z.string().optional(),
          albumartist: z.string().optional(),
          album: z.string().optional(),
          url: z.string().optional(),
          bitrate: z.string().optional(),
          samplerate: z.string().optional(),
          type: z.string().optional(),
          remote: z.string().optional(),
          artist_ids: z.string().optional(),
          trackartist_ids: z.string().optional(),
          album_id: z.string().optional(),
        }),
      )
      .optional(),
    count: z.number(),
  }),
);

const tidalSearchPayloadParser = createLmsResultParser(
  z.object({
    loop_loop: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          url: z.string().optional(),
          image: z.string().optional(),
          isaudio: z.number().optional(),
          type: z.string().optional(),
        }),
      )
      .optional(),
  }),
);

/**
 * Creates the search domain methods bound to the provided ExecuteDeps.
 */
export const createSearchMethods = (
  deps: ExecuteDeps,
): {
  readonly search: (
    query: string,
  ) => Promise<Result<readonly SearchResult[], LmsError>>;
} => {
  const { executeCommand, config } = deps;

  // Enriches a single Tidal track with artist/album/audioQuality via LMS tidal_info command.
  // Story 7.9: Replaces songinfo approach (Story 7.8) — tidal_info works for fresh (never-played)
  // tracks because the LMS Tidal plugin fetches from Tidal REST API internally using its own OAuth.
  // Live probe (2026-03-14): command returns loop_loop with Album (id:"2") and Artist (id:"3") items.
  // AudioQuality inferred from URL extension (.flc → FLAC/lossless, .m4a → AAC).
  // Per-track timeout: TIDAL_ENRICH_TIMEOUT_MS (200ms), runs after tidalWithTimeout.
  const enrichSingleTrack = (track: SearchResult): Promise<SearchResult> => {
    const trackId = extractTidalTrackId(track.url);
    if (!trackId) {
      return Promise.resolve(track);
    }

    // tidal_info items command: returns track detail with Album and Artist items in loop_loop.
    // id:{trackId} identifies the track; type:track specifies the context.
    const command: LmsCommand = [
      "tidal_info",
      "items",
      0,
      10,
      `id:${trackId}`,
      "type:track",
    ];

    // AbortController for the underlying fetch: aborted when the 200ms cap fires.
    // This cancels the HTTP request immediately instead of letting it run for config.timeout (5s).
    const enrichController = new AbortController();

    const timeoutPromise = delay(TIDAL_ENRICH_TIMEOUT_MS).then(() => {
      enrichController.abort(); // Cancel the underlying fetch immediately
      return track;
    });

    const enrichPromise = executeCommand(
      command,
      tidalInfoPayloadParser,
      enrichController.signal,
    ).then((result): SearchResult => {
      if (!result.ok) {
        return track;
      }
      const loopLoop = result.value.loop_loop ?? [];
      const { artist, album } = parseTidalInfo(loopLoop);
      const audioQuality = parseTidalAudioQuality(track.url);
      return {
        ...track,
        artist: artist || track.artist,
        album: album || track.album,
        audioQuality: audioQuality ?? track.audioQuality,
      };
    });

    return Promise.race([enrichPromise, timeoutPromise]);
  };

  // Enriches all Tidal tracks in parallel via Promise.allSettled.
  // Each track is enriched independently — per-track failures do not affect others.
  // AC4: On per-track failure, original track (artist: "", album: "") is returned.
  const enrichTidalTracks = async (
    tracks: readonly SearchResult[],
  ): Promise<readonly SearchResult[]> => {
    const enrichResults = await Promise.allSettled(
      tracks.map(enrichSingleTrack),
    );
    return enrichResults.map((settled, idx) =>
      settled.status === "fulfilled" ? settled.value : tracks[idx]!,
    );
  };

  return {
    /**
     * Search for tracks across local library and Tidal streaming in parallel.
     *
     * Local: LMS titles command (full library, all indexed tracks).
     * Tidal: LMS TIDAL plugin app navigation (probe 2026-03-14: item_id:7_{q}.4, ~323ms latency).
     * Both searches run concurrently via Promise.allSettled.
     * Tidal is capped at 250ms timeout for NFR27 ≤300ms combined response.
     * Any error in either search → graceful degradation (returns [] for that source).
     * Only EmptyQueryError is propagated as an error result.
     *
     * @param query - Search query string
     * @returns Result with combined search results (local first, then Tidal) or EmptyQueryError
     */
    search: async (
      query: string,
    ): Promise<Result<readonly SearchResult[], LmsError>> => {
      // Validate query (fail fast)
      const trimmedQuery = query.trim();
      if (trimmedQuery === "") {
        return err({
          type: "EmptyQueryError",
          message: "Query cannot be empty",
        });
      }

      // Extracts the first ID from a comma-separated LMS ID string (e.g. "214,500" → "214")
      // Returns undefined if absent or sentinel value "0"
      const firstId = (raw: string | undefined): string | undefined => {
        if (!raw) {
          return undefined;
        }
        const first = raw.split(",")[0]?.trim();
        return first && first !== "0" ? first : undefined;
      };

      // Local library search (LMS titles command).
      // Returns [] on any error — graceful degradation.
      //
      // titles-Command: works without Full Text Search (unlike "search items").
      // Tag letters (LMS SlimProto protocol, titles command):
      //   b = bitrate    r = samplerate   o = type (codec)   x = remote
      //   u = url        l = album        a = artist          A = albumartist
      //   t = track_num  S = contributor_id (artist_id)       e = album_id
      // Cover art: use track id (item.id) → /music/{id}/cover.jpg (same as getAlbumDetail).
      // IMPORTANT: /music/{album_id}/cover.jpg is WRONG — LMS interprets the path segment as a
      // track ID, not album ID. /music/177/cover.jpg returns cover of track 177, not album 177.
      // item.id (track's decimal DB ID) is always present and always correct.
      const searchLocal = async (): Promise<readonly SearchResult[]> => {
        const command: LmsCommand = [
          "titles",
          0,
          MAX_SEARCH_RESULTS,
          `search:${trimmedQuery}`,
          "tags:b,r,o,x,u,l,a,A,t,S,e",
        ];

        const result = await executeCommand(command, localSearchPayloadParser);

        if (!result.ok) {
          return [];
        }

        const titlesLoopRaw = result.value.titles_loop;
        if (titlesLoopRaw !== undefined && !Array.isArray(titlesLoopRaw)) {
          return [];
        }

        const titlesLoop = titlesLoopRaw ?? [];
        return titlesLoop
          .filter((item) => item.url !== undefined)
          .map((item) => ({
            id: String(item.id),
            title: item.title,
            artist: item.artist ?? "",
            albumartist: item.albumartist?.trim() || undefined,
            album: item.album ?? "",
            url: item.url!,
            source: detectSource(item.url!),
            type: "track" as const,
            audioQuality: parseAudioQuality(item),
            artistId: firstId(item.trackartist_ids ?? item.artist_ids),
            albumId:
              item.album_id && item.album_id !== "0"
                ? item.album_id
                : undefined,
            coverArtUrl: `http://${config.host}:${config.port}/music/${item.id}/cover.jpg`,
          }));
      };

      // Tidal streaming search via LMS TIDAL plugin app navigation (Story 7.7, Story 9.11).
      // item_id:7_{query}.4 → "Suchen → Titel" (Tracks).
      // Live probe (2026-03-20): each track result includes image? (relative LMS proxy URL,
      // e.g. "/imageproxy/...") — the album cover for that track, same format as TidalAlbumRaw.image.
      // coverArtUrl is constructed here and preserved through enrichTidalTracks() via spread.
      // Note: spaces in multi-word queries are sent as-is (e.g. "item_id:7_pink floyd.4").
      // Graceful degradation: any error → empty tracks.
      const searchTidal = async (): Promise<readonly SearchResult[]> => {
        const command: LmsCommand = [
          "tidal",
          "items",
          0,
          MAX_SEARCH_RESULTS,
          `item_id:7_${trimmedQuery}.4`,
          `search:${trimmedQuery}`,
          "want_url:1",
        ];

        const result = await executeCommand(command, tidalSearchPayloadParser);

        if (!result.ok) {
          return [];
        }

        const rawLoop = result.value.loop_loop;
        if (rawLoop !== undefined && !Array.isArray(rawLoop)) {
          return [];
        }
        const loop = rawLoop ?? [];
        return loop
          .filter((item) => item.url !== undefined && item.isaudio === 1)
          .map((item) => ({
            id: item.url!,
            title: item.name ?? "",
            artist: "",
            album: "",
            url: item.url!,
            source: detectSource(item.url!),
            type: "track" as const,
            audioQuality: undefined,
            coverArtUrl:
              item.image !== undefined
                ? `http://${config.host}:${config.port}${item.image}`
                : undefined,
          }));
      };

      // Tidal with 250ms timeout (probe latency ~323ms → cap for NFR27 ≤300ms combined).
      const tidalWithTimeout = (): Promise<readonly SearchResult[]> => {
        const timeoutPromise = delay(TIDAL_SEARCH_TIMEOUT_MS).then(
          (): readonly SearchResult[] => [],
        );
        return Promise.race([searchTidal(), timeoutPromise]);
      };

      const [localSettled, tidalSettled] = await Promise.allSettled([
        searchLocal(),
        tidalWithTimeout(),
      ]);

      const localTracks =
        localSettled.status === "fulfilled" ? localSettled.value : [];
      const rawTidalTracks =
        tidalSettled.status === "fulfilled" ? tidalSettled.value : [];

      // Enrich Tidal tracks with artist/album/audioQuality via tidal_info (parallel, AC5).
      // Runs after tidalWithTimeout to avoid interference with the Tidal search cap.
      // On per-track failure: original track returned with artist: "", album: "" (AC4).
      // coverArtUrl set in searchTidal() is preserved via spread in enrichSingleTrack().
      const enrichedTracks = await enrichTidalTracks(rawTidalTracks);

      return ok([...localTracks, ...enrichedTracks]);
    },
  };
};
