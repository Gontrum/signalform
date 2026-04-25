/**
 * LMS Playback Domain Methods
 *
 * Factory function for playback-related LMS client methods:
 * play, pause, resume, getStatus, nextTrack, previousTrack,
 * setVolume, getVolume, seek, getCurrentTime.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, err, type Result } from "@signalform/shared";
import { z } from "zod";
import type {
  LmsCommand,
  LmsError,
  PlayerStatus,
  SearchResult,
} from "./types.js";
import {
  MAX_TRACK_URL_LENGTH,
  PAUSE_ENABLED,
  VALID_TRACK_PROTOCOLS,
  detectSource,
  parseTidalAudioQuality,
} from "./helpers.js";
import { createLmsResultParser, type ExecuteDeps } from "./execute.js";

export type PlaybackMethods = {
  readonly play: (trackUrl: string) => Promise<Result<void, LmsError>>;
  readonly pause: () => Promise<Result<void, LmsError>>;
  readonly resume: () => Promise<Result<void, LmsError>>;
  readonly getStatus: () => Promise<Result<PlayerStatus, LmsError>>;
  readonly nextTrack: () => Promise<Result<void, LmsError>>;
  readonly previousTrack: () => Promise<Result<void, LmsError>>;
  readonly setVolume: (volume: number) => Promise<Result<void, LmsError>>;
  readonly getVolume: () => Promise<Result<number, LmsError>>;
  readonly seek: (seconds: number) => Promise<Result<void, LmsError>>;
  readonly getCurrentTime: () => Promise<Result<number, LmsError>>;
};

const isPlayerMode = (value: string): value is PlayerStatus["mode"] => {
  return value === "play" || value === "pause" || value === "stop";
};

const statusTrackSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  artist: z.string().optional(),
  album: z.string().optional(),
  url: z.string(),
  artist_ids: z.string().optional(),
  trackartist_ids: z.string().optional(),
  album_id: z.string().optional(),
  artwork_url: z.string().optional(),
});

const statusPayloadParser = createLmsResultParser(
  z.object({
    mode: z.string(),
    time: z.union([z.number(), z.string()]),
    duration: z.union([z.number(), z.string()]),
    "mixer volume": z.union([z.number(), z.string()]),
    playlist_loop: z.array(statusTrackSchema).optional(),
  }),
);

const volumePayloadParser = createLmsResultParser(
  z.object({
    _volume: z.union([z.number(), z.string()]).optional(),
  }),
);

const timePayloadParser = createLmsResultParser(
  z.object({
    time: z.union([z.number(), z.string()]).optional(),
    duration: z.union([z.number(), z.string()]).optional(),
    mode: z.string().optional(),
    "mixer volume": z.union([z.number(), z.string()]).optional(),
  }),
);

const createPlaybackMethodsImplementation = (
  deps: ExecuteDeps,
): PlaybackMethods => {
  const { executeCommand, executeCommandWithRetry, config } = deps;

  /**
   * Creates the playback domain methods bound to the provided ExecuteDeps.
   */
  return {
    /**
     * Play a track.
     * @param trackUrl - Track URL to play (e.g., "file:///music/track.flac")
     * @returns Result with void or error
     */
    play: async (trackUrl: string): Promise<Result<void, LmsError>> => {
      // Validate track URL (fail fast)
      const trimmedUrl = trackUrl.trim();
      if (trimmedUrl === "") {
        return err({
          type: "EmptyQueryError",
          message: "Track URL cannot be empty",
        });
      }

      if (trimmedUrl.length > MAX_TRACK_URL_LENGTH) {
        return err({
          type: "NetworkError",
          message: `Track URL exceeds maximum length of ${MAX_TRACK_URL_LENGTH} characters`,
        });
      }

      // Issue #15: Validate URL protocol (security - prevent malformed URLs)
      const hasValidProtocol = VALID_TRACK_PROTOCOLS.some((protocol) =>
        trimmedUrl.startsWith(protocol),
      );

      if (!hasValidProtocol) {
        return err({
          type: "NetworkError",
          message: `Invalid track URL protocol. Must start with: ${VALID_TRACK_PROTOCOLS.join(", ")}`,
        });
      }

      const command: LmsCommand = ["playlist", "play", trimmedUrl];
      const result = await executeCommandWithRetry(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Pause playback.
     *
     * LMS pause command: "1" = pause
     *
     * @returns Result with void or error
     */
    pause: async (): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["pause", PAUSE_ENABLED];
      const result = await executeCommandWithRetry(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Resume playback (unpause).
     *
     * LMS pause command: "0" = resume (unpause)
     *
     * @returns Result with void or error
     */
    resume: async (): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["pause", "0"];
      const result = await executeCommandWithRetry(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Get current player status.
     * @returns Result with player status or error
     */
    getStatus: async (): Promise<Result<PlayerStatus, LmsError>> => {
      // tags: u=url, a=artist, l=album, S=contributor_id (artist_id), e=album_id, K=artwork_url
      // count=4: playlist_loop[0]=current track, [1..3]=next 3 tracks (queue preview)
      const command: LmsCommand = ["status", "-", 4, "tags:u,a,l,S,e,K"];
      const result = await executeCommandWithRetry(
        command,
        statusPayloadParser,
      );

      if (!result.ok) {
        return result;
      }

      // Validate and normalize player mode (fail safe with default)
      const normalizedMode = isPlayerMode(result.value.mode)
        ? result.value.mode
        : "stop";

      // Extract current track (if playing)
      const currentTrackData = result.value.playlist_loop?.[0];
      const currentTrack: SearchResult | null = currentTrackData
        ? {
            id: String(currentTrackData.id), // LMS returns numeric IDs — convert to string
            title: currentTrackData.title,
            artist: currentTrackData.artist ?? "", // may be absent for some tracks
            album: currentTrackData.album ?? "", // may be absent for some tracks
            url: currentTrackData.url,
            source: detectSource(currentTrackData.url),
            type: "track", // Current track is always a track
            audioQuality: parseTidalAudioQuality(currentTrackData.url), // inferred from URL extension for Tidal tracks
            coverArtUrl: currentTrackData.artwork_url
              ? `http://${config.host}:${config.port}${currentTrackData.artwork_url}`
              : `http://${config.host}:${config.port}/music/${String(currentTrackData.id)}/cover.jpg`,
            // Various-artist albums use trackartist_ids; single-artist albums use artist_ids
            artistId: ((): string | undefined => {
              const raw =
                currentTrackData.trackartist_ids ?? currentTrackData.artist_ids;
              if (!raw) {
                return undefined;
              }
              const first = raw.split(",")[0]?.trim();
              return first && first !== "0" ? first : undefined;
            })(),
            albumId:
              currentTrackData.album_id && currentTrackData.album_id !== "0"
                ? currentTrackData.album_id
                : undefined,
          }
        : null;

      // Extract queue preview from playlist_loop[1..3] (next 3 tracks after current)
      const queuePreview = (result.value.playlist_loop ?? [])
        .slice(1, 4)
        .map((item) => ({
          id: String(item.id),
          title: item.title,
          artist: item.artist ?? "",
        }));

      const normalizedTime = Number(result.value.time ?? 0);
      const normalizedDuration = Number(result.value.duration ?? 0);
      const normalizedVolume = Number(result.value["mixer volume"] ?? 0);

      // Build PlayerStatus
      const status: PlayerStatus = {
        mode: normalizedMode,
        time: Number.isFinite(normalizedTime) ? normalizedTime : 0,
        duration: Number.isFinite(normalizedDuration) ? normalizedDuration : 0,
        volume: Number.isFinite(normalizedVolume) ? normalizedVolume : 0,
        currentTrack,
        queuePreview,
      };

      return ok(status);
    },

    /**
     * Skip to next track in playlist.
     *
     * Uses LMS command: ['playlist', 'index', '+1']
     * This advances the playlist position by one track.
     *
     * @returns Result with void or error
     */
    nextTrack: async (): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["playlist", "index", "+1"];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Skip to previous track in playlist.
     *
     * Uses LMS command: ['playlist', 'index', '-1']
     * This moves the playlist position back by one track.
     *
     * @returns Result with void or error
     */
    previousTrack: async (): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["playlist", "index", "-1"];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Set volume to specific level.
     *
     * Uses LMS command: ['mixer', 'volume', level]
     * Volume range: 0-100
     *
     * @param level - Volume level (0-100)
     * @returns Result with void or error
     */
    setVolume: async (level: number): Promise<Result<void, LmsError>> => {
      // Validate volume range (fail fast)
      if (level < 0 || level > 100) {
        return err({
          type: "ValidationError",
          message: "Volume must be between 0 and 100",
        });
      }

      const command: LmsCommand = ["mixer", "volume", level];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Get current volume level.
     *
     * Uses LMS command: ['mixer', 'volume', '?']
     * Returns volume level (0-100)
     *
     * @returns Result with volume level or error
     */
    getVolume: async (): Promise<Result<number, LmsError>> => {
      const command: LmsCommand = ["mixer", "volume", "?"];
      const result = await executeCommand(command, volumePayloadParser);

      if (!result.ok) {
        return result;
      }

      // Parse volume: LMS returns string "50" from mixer volume ? command
      const volume = Number(result.value._volume ?? 0);

      return ok(volume);
    },

    /**
     * Seek to specific position in track.
     *
     * Uses LMS command: ['time', seconds]
     * Position range: 0 to track duration (seconds)
     *
     * @param seconds - Position in seconds (must be >= 0)
     * @returns Result with void or error
     */
    seek: async (seconds: number): Promise<Result<void, LmsError>> => {
      // Validate seek position (fail fast)
      if (seconds < 0) {
        return err({
          type: "ValidationError",
          message: "Seek position must be >= 0",
        });
      }

      const command: LmsCommand = ["time", seconds];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Get current playback position.
     *
     * Uses LMS command: ['status', '-', '1', 'tags:...']
     * Returns current position in seconds (rounded to integer)
     *
     * @returns Result with current time in seconds or error
     */
    getCurrentTime: async (): Promise<Result<number, LmsError>> => {
      const command: LmsCommand = ["status", "-", 1, "tags:u"];
      const result = await executeCommand(command, timePayloadParser);

      if (!result.ok) {
        return result;
      }

      // Extract time, default to 0 if missing
      const time = Number(result.value.time ?? 0);

      // Round to integer seconds
      return ok(Math.floor(time));
    },
  };
};

export const createPlaybackMethods = (deps: ExecuteDeps): PlaybackMethods => {
  return createPlaybackMethodsImplementation(deps);
};
