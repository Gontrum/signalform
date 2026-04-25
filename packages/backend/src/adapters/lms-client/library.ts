/**
 * LMS Library Domain Methods
 *
 * Factory function for library-related LMS client methods:
 * playAlbum, playTidalAlbum, disableRepeat, getAlbumTracks,
 * getArtistAlbums, getArtistName, getLibraryAlbums, rescanLibrary, getRescanProgress.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, err, type Result } from "@signalform/shared";
import { z } from "zod";
import type {
  LmsCommand,
  LmsError,
  RescanProgress,
  AlbumTrackRaw,
  ArtistAlbumRaw,
  LibraryAlbumRaw,
  TidalTrackRaw,
} from "./types.js";
import { MAX_SEARCH_RESULTS } from "./helpers.js";
import {
  createLmsResultParser,
  isRecord,
  type ExecuteDeps,
} from "./execute.js";
import { tidalTracksPayloadParser } from "./schemas.js";

export type LibraryMethods = {
  readonly playAlbum: (albumId: string) => Promise<Result<void, LmsError>>;
  readonly playTidalAlbum: (albumId: string) => Promise<Result<void, LmsError>>;
  readonly disableRepeat: () => Promise<Result<void, LmsError>>;
  readonly getAlbumTracks: (
    albumId: string,
  ) => Promise<Result<readonly AlbumTrackRaw[], LmsError>>;
  readonly getArtistAlbums: (
    artistId: string,
  ) => Promise<Result<readonly ArtistAlbumRaw[], LmsError>>;
  readonly getArtistName: (
    artistId: string,
  ) => Promise<Result<string | null, LmsError>>;
  readonly getLibraryAlbums: (
    offset: number,
    limit: number,
  ) => Promise<
    Result<
      { readonly albums: readonly LibraryAlbumRaw[]; readonly count: number },
      LmsError
    >
  >;
  readonly rescanLibrary: () => Promise<Result<void, LmsError>>;
  readonly getRescanProgress: () => Promise<Result<RescanProgress, LmsError>>;
};

const parseRescanProgressPayload = (
  value: unknown,
): {
  readonly rescan?: number;
  readonly steps?: string;
  readonly info?: string;
  readonly totaltime?: string;
} => {
  if (!isRecord(value)) {
    return {};
  }

  const result = value["result"];
  if (!isRecord(result)) {
    return {};
  }

  return {
    rescan: typeof result["rescan"] === "number" ? result["rescan"] : undefined,
    steps: typeof result["steps"] === "string" ? result["steps"] : undefined,
    info: typeof result["info"] === "string" ? result["info"] : undefined,
    totaltime:
      typeof result["totaltime"] === "string" ? result["totaltime"] : undefined,
  };
};

const albumTrackSchema = z.object({
  id: z.number(),
  title: z.string(),
  artist: z.string().optional(),
  albumartist: z.string().optional(),
  album: z.string().optional(),
  url: z.string().optional(),
  tracknum: z.string().optional(),
  duration: z.number().optional(),
  bitrate: z.string().optional(),
  samplerate: z.string().optional(),
  type: z.string().optional(),
  samplesize: z.number().optional(),
  year: z.union([z.number(), z.string()]).optional(),
});

const artistAlbumSchema = z.object({
  id: z.number(),
  album: z.string(),
  artist: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  artwork_track_id: z.string().optional(),
});

const libraryAlbumSchema = z.object({
  id: z.number(),
  album: z.string(),
  artist: z.string().optional(),
  year: z.number().optional(),
  artwork_track_id: z.string().optional(),
  genre: z.string().optional(),
});

const albumTracksPayloadParser = createLmsResultParser(
  z.object({
    titles_loop: z.array(albumTrackSchema).optional(),
  }),
);

const artistAlbumsPayloadParser = createLmsResultParser(
  z.object({
    albums_loop: z.array(artistAlbumSchema).optional(),
  }),
);

const artistNamePayloadParser = createLmsResultParser(
  z.object({
    artists_loop: z
      .array(
        z.object({
          id: z.number(),
          artist: z.string(),
        }),
      )
      .optional(),
  }),
);

const libraryAlbumsPayloadParser = createLmsResultParser(
  z.object({
    albums_loop: z.array(libraryAlbumSchema).optional(),
    count: z.number().optional(),
  }),
);

const songsPayloadParser = createLmsResultParser(
  z.object({
    titles_loop: z
      .array(
        z.object({
          album_id: z.string().optional(),
          genre: z.string().optional(),
        }),
      )
      .optional(),
  }),
);

const createLibraryMethodsImplementation = (
  deps: ExecuteDeps,
): LibraryMethods => {
  const { executeCommand, config } = deps;

  /**
   * Creates the library domain methods bound to the provided ExecuteDeps.
   */
  return {
    /**
     * Play an entire album as a playlist (enables gapless transitions).
     *
     * Uses LMS command: ['playlistcontrol', 'cmd:load', 'album_id:X']
     * This replaces the current queue with the full album and starts playback.
     * LMS handles pre-buffering and gapless transitions automatically.
     *
     * @param albumId - LMS album ID
     * @returns Result with void or error
     */
    playAlbum: async (albumId: string): Promise<Result<void, LmsError>> => {
      const trimmedId = albumId.trim();
      if (trimmedId === "") {
        return err({
          type: "EmptyQueryError",
          message: "Album ID cannot be empty",
        });
      }

      // playlistcontrol cmd:load loads the full album as a playlist.
      // LMS pre-buffers the next track automatically for gapless transitions.
      const command: LmsCommand = [
        "playlistcontrol",
        "cmd:load",
        `album_id:${trimmedId}`,
      ];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Play a Tidal album from the browse hierarchy.
     *
     * Live probe (2026-03-15): album_id:{tidalId} returns count:0 (no local album).
     * item_id:{tidalId} in playlistcontrol context loads wrong (global browse, not Tidal).
     * Correct approach: fetch tracks via getTidalAlbumTracks, then:
     *   1. clear queue
     *   2. ["playlist", "play", tracks[0].url] — loads + starts first track
     *   3. ["playlist", "add", track.url] — adds subsequent tracks
     *
     * @param albumId - Tidal browse album ID (e.g. "4.0", "6.0.1.0")
     * @returns Result with void or error
     */
    playTidalAlbum: async (
      albumId: string,
    ): Promise<Result<void, LmsError>> => {
      const trimmedId = albumId.trim();
      if (trimmedId === "") {
        return err({
          type: "EmptyQueryError",
          message: "Album ID cannot be empty",
        });
      }

      // Step 1: Fetch album tracks
      const tracksResult = await executeCommand(
        ["tidal", "items", 0, 999, `item_id:${trimmedId}`, "want_url:1"],
        tidalTracksPayloadParser,
      );

      if (!tracksResult.ok) {
        return tracksResult;
      }

      const allItems = tracksResult.value.loop_loop ?? [];
      // Type guard narrows url from string|undefined to string, preventing empty-string LMS commands
      const tracks = allItems.filter(
        (t): t is TidalTrackRaw & { readonly url: string } =>
          t.isaudio === 1 && t.url !== undefined && t.url !== "",
      );

      if (tracks.length === 0) {
        return err({
          type: "LmsApiError",
          code: 0,
          message: `No playable tracks found for Tidal album ${trimmedId}`,
        });
      }

      // Step 2: Clear queue
      const clearResult = await executeCommand(["playlist", "clear"]);
      if (!clearResult.ok) {
        return clearResult;
      }

      // Step 3: Load first track (starts playback immediately)
      // tracks[0] is guaranteed to exist (tracks.length > 0) and url is a string (type guard above)
      const firstTrackUrl = tracks[0]!.url;
      const playResult = await executeCommand([
        "playlist",
        "play",
        firstTrackUrl,
      ]);
      if (!playResult.ok) {
        return playResult;
      }

      // Step 4: Append remaining tracks to queue (functional sequential reduce)
      const appendResult = await tracks
        .slice(1)
        .reduce<Promise<Result<void, LmsError>>>(
          async (prevPromise, track) => {
            const prev = await prevPromise;
            if (!prev.ok) {
              return prev;
            }
            const result = await executeCommand([
              "playlist",
              "add",
              track.url, // url is string — guaranteed by type guard in filter above
            ]);
            return result.ok ? ok(undefined) : err(result.error);
          },
          Promise.resolve(ok(undefined)),
        );
      if (!appendResult.ok) {
        return appendResult;
      }

      return ok(undefined);
    },

    /**
     * Disable playlist repeat mode.
     *
     * Uses LMS command: ['playlist', 'repeat', '0']
     * Explicitly sets repeat off after loading an album so playback
     * stops naturally at the end of the album instead of looping.
     *
     * @returns Result with void or error
     */
    disableRepeat: async (): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["playlist", "repeat", "0"];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Get all tracks for an album by album ID.
     *
     * Uses LMS titles command with album_id filter.
     * Returns tracks sorted by track number.
     *
     * @param albumId - LMS album ID
     * @returns Result with sorted track list or error
     */
    getAlbumTracks: async (
      albumId: string,
    ): Promise<Result<readonly AlbumTrackRaw[], LmsError>> => {
      const trimmedId = albumId.trim();
      if (trimmedId === "") {
        return err({
          type: "EmptyQueryError",
          message: "Album ID cannot be empty",
        });
      }

      // tags: b=bitrate, r=samplerate, t=track_num, a=artist, A=albumartist, o=type, u=url, d=duration, T=samplesize, y=year, l=album_name
      const command: LmsCommand = [
        "titles",
        0,
        MAX_SEARCH_RESULTS,
        `album_id:${trimmedId}`,
        "tags:b,r,t,a,A,o,u,d,T,y,l",
      ];

      const result = await executeCommand(command, albumTracksPayloadParser);

      if (!result.ok) {
        return result;
      }

      const titlesLoop = result.value.titles_loop ?? [];

      // Sort by URL (encodes global file order, including disc/side), then tracknum as fallback.
      // LMS tracknum is disc/side-relative, so URL-primary sort gives correct album ordering
      // for multi-disc releases where each side restarts at track 1.
      const sorted = [...titlesLoop].sort((a, b) => {
        const urlCmp = (a.url ?? "").localeCompare(b.url ?? "");
        if (urlCmp !== 0) {
          return urlCmp;
        }
        return (
          (parseInt(a.tracknum ?? "0", 10) || 0) -
          (parseInt(b.tracknum ?? "0", 10) || 0)
        );
      });

      return ok(sorted);
    },

    /**
     * Get all albums for an artist by artist ID.
     *
     * Uses LMS albums command with artist_id filter.
     * tags: a=artist_name, y=year, l=album_title, j=artwork_track_id (for cover art)
     * Returns albums in arbitrary order — sort in service layer.
     *
     * @param artistId - LMS artist ID
     * @returns Result with album list or error
     */
    getArtistAlbums: async (
      artistId: string,
    ): Promise<Result<readonly ArtistAlbumRaw[], LmsError>> => {
      const trimmedId = artistId.trim();
      if (trimmedId === "") {
        return err({
          type: "EmptyQueryError",
          message: "Artist ID cannot be empty",
        });
      }

      const command: LmsCommand = [
        "albums",
        0,
        MAX_SEARCH_RESULTS,
        `artist_id:${trimmedId}`,
        "tags:a,y,l,j",
      ];

      const result = await executeCommand(command, artistAlbumsPayloadParser);

      if (!result.ok) {
        return result;
      }

      return ok(result.value.albums_loop ?? []);
    },

    /**
     * Get the canonical artist name from LMS by artist ID.
     * Uses LMS artists command with artist_id filter — returns the actual artist name
     * regardless of how album fields (which may show "Diverse Interpreten" for compilations)
     * are populated.
     *
     * @param artistId - LMS artist ID
     * @returns Result with artist name string, or null if not found
     */
    getArtistName: async (
      artistId: string,
    ): Promise<Result<string | null, LmsError>> => {
      const trimmedId = artistId.trim();
      if (trimmedId === "") {
        return ok(null);
      }

      const command: LmsCommand = ["artists", 0, 1, `artist_id:${trimmedId}`];

      const result = await executeCommand(command, artistNamePayloadParser);

      if (!result.ok) {
        return result;
      }

      const artists = result.value.artists_loop ?? [];
      return ok(artists[0]?.artist ?? null);
    },

    /**
     * Get all albums in the local library (unfiltered albums command).
     *
     * Uses LMS albums command without artist_id filter.
     * tags: a=artist_name, y=year, l=album_title, j=artwork_track_id (for cover art)
     * Returns albums with count for pagination.
     *
     * @param offset - Pagination start index
     * @param limit - Maximum albums to return (max 999)
     * @returns Result with album list + total count or error
     */
    getLibraryAlbums: async (
      offset: number,
      limit: number,
    ): Promise<
      Result<
        { readonly albums: readonly LibraryAlbumRaw[]; readonly count: number },
        LmsError
      >
    > => {
      const command: LmsCommand = ["albums", offset, limit, "tags:a,y,l,j"];

      const result = await executeCommand(command, libraryAlbumsPayloadParser);

      if (!result.ok) {
        return result;
      }

      const albums = result.value.albums_loop ?? [];
      const count = result.value.count ?? 0;

      // Enrich albums with genre via songs bulk query.
      // LMS albums command does not return genre (tags:g/G have no effect on albums command).
      // songs command with tags:g,e returns {album_id, genre} per track — 11k songs ~0.9s locally.
      // Graceful degradation: if songs query fails, albums are returned without genre (genre=null).
      // Tech Debt: 20000 is a safe upper limit for most home libraries (~0.9s for 11k songs).
      // Libraries with >20000 songs will get incomplete genre data (silent, graceful degradation).
      // Fix: pass songs limit as config option or use LMS count from a prior query. Deferred to Story 7.6.
      const songsCommand: LmsCommand = ["songs", 0, 20000, "tags:g,e"];
      const songsResult = await executeCommand(
        songsCommand,
        songsPayloadParser,
      );

      // Build album_id → genre lookup using reduce (no Map mutation — functional/immutable-data).
      // Only first genre per album is kept (most songs on an album share the same genre).
      const genreRecord: Readonly<Record<string, string>> = songsResult.ok
        ? (songsResult.value.titles_loop ?? []).reduce<
            Readonly<Record<string, string>>
          >((acc, song) => {
            const albumId = song.album_id;
            const genre = song.genre?.trim();
            if (!albumId || !genre || albumId in acc) {
              return acc;
            }
            return { ...acc, [albumId]: genre };
          }, {})
        : {};

      const enrichedAlbums: readonly LibraryAlbumRaw[] = albums.map(
        (album) => ({
          ...album,
          genre: genreRecord[String(album.id)],
        }),
      );

      return ok({ albums: enrichedAlbums, count });
    },

    rescanLibrary: async (): Promise<Result<void, LmsError>> => {
      // rescan is a server-level command — player ID must be empty string
      const serverUrl = `http://${config.host}:${config.port}/jsonrpc.js`;
      return await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "slim.request",
          params: ["", ["rescan"]],
          id: 1,
        }),
        signal: AbortSignal.timeout(config.timeout),
      })
        .then<Result<void, LmsError>>(() => ok(undefined))
        .catch<Result<void, LmsError>>((error: unknown) =>
          err({
            type: "NetworkError",
            message:
              error instanceof Error ? error.message : "Rescan request failed",
          }),
        );
    },

    getRescanProgress: async (): Promise<Result<RescanProgress, LmsError>> => {
      const serverUrl = `http://${config.host}:${config.port}/jsonrpc.js`;
      const responseResult = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "slim.request",
          params: ["", ["rescanprogress"]],
          id: 1,
        }),
        signal: AbortSignal.timeout(config.timeout),
      })
        .then<Result<Response, LmsError>>((response) => ok(response))
        .catch<Result<Response, LmsError>>((error: unknown) =>
          err({
            type: "NetworkError",
            message:
              error instanceof Error
                ? error.message
                : "Rescan progress request failed",
          }),
        );

      if (!responseResult.ok) {
        return responseResult;
      }

      const jsonResult = await responseResult.value
        .json()
        .then<Result<ReturnType<typeof parseRescanProgressPayload>, LmsError>>(
          (value: unknown) => ok(parseRescanProgressPayload(value)),
        )
        .catch<Result<ReturnType<typeof parseRescanProgressPayload>, LmsError>>(
          (error: unknown) =>
            err({
              type: "JsonParseError",
              message:
                error instanceof Error
                  ? error.message
                  : "Rescan progress request failed",
            }),
        );

      if (!jsonResult.ok) {
        return jsonResult;
      }

      const result = jsonResult.value;
      return ok({
        scanning: (result.rescan ?? 0) === 1,
        step: result.steps ?? "",
        info: result.info ?? "",
        totalTime: result.totaltime ?? "",
      });
    },
  };
};

export const createLibraryMethods = (deps: ExecuteDeps): LibraryMethods => {
  return createLibraryMethodsImplementation(deps);
};
