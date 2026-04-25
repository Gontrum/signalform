/**
 * LMS Queue Domain Methods
 *
 * Factory function for queue-related LMS client methods:
 * getQueue, jumpToTrack, removeFromQueue, moveQueueTrack,
 * addToQueue, addAlbumToQueue, addTidalAlbumToQueue.
 *
 * All methods are injected with ExecuteDeps (executeCommand, executeCommandWithRetry, config).
 */

import { ok, err, type Result } from "@signalform/shared";
import type { QueueTrack } from "@signalform/shared";
import { z } from "zod";
import type { LmsCommand, LmsError, TidalTrackRaw } from "./types.js";
import {
  MAX_TRACK_URL_LENGTH,
  VALID_TRACK_PROTOCOLS,
  detectQueueSource,
  parseAudioQuality,
} from "./helpers.js";
import { createLmsResultParser, type ExecuteDeps } from "./execute.js";
import { tidalTracksPayloadParser } from "./schemas.js";

export type QueueMethods = {
  readonly getQueue: () => Promise<Result<readonly QueueTrack[], LmsError>>;
  readonly jumpToTrack: (trackIndex: number) => Promise<Result<void, LmsError>>;
  readonly removeFromQueue: (
    trackIndex: number,
  ) => Promise<Result<void, LmsError>>;
  readonly moveQueueTrack: (
    fromIndex: number,
    toIndex: number,
  ) => Promise<Result<void, LmsError>>;
  readonly addToQueue: (trackUrl: string) => Promise<Result<void, LmsError>>;
  readonly addAlbumToQueue: (
    albumId: string,
  ) => Promise<Result<void, LmsError>>;
  readonly addTidalAlbumToQueue: (
    albumId: string,
  ) => Promise<Result<void, LmsError>>;
};

const queueTrackRawSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  artist: z.string().optional(),
  album: z.string().optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  url: z.string().optional(),
  bitrate: z.string().optional(),
  samplerate: z.string().optional(),
  type: z.string().optional(),
  samplesize: z.number().optional(),
});

const queuePayloadParser = createLmsResultParser(
  z.object({
    playlist_cur_index: z.union([z.number(), z.string()]).optional(),
    playlist_loop: z.array(queueTrackRawSchema).optional(),
  }),
);

/**
 * Creates the queue domain methods bound to the provided ExecuteDeps.
 */
export const createQueueMethods = (deps: ExecuteDeps): QueueMethods => {
  const { executeCommand } = deps;

  return {
    /**
     * Get all tracks in the current queue.
     *
     * Uses LMS status command with start=0 to get ALL tracks from beginning.
     * Count=999 gets up to 999 tracks (practical limit for queue display).
     * tags: a=artist, l=album, d=duration, b=bitrate, r=samplerate, o=type, s=samplesize, u=url
     *
     * @returns Result with queue tracks or error
     */
    getQueue: async (): Promise<Result<readonly QueueTrack[], LmsError>> => {
      // Use start=0 (not "-") to get ALL tracks from beginning of queue
      // Quality tags: b=bitrate, r=samplerate, o=type, s=samplesize/bitdepth, u=url (source detection)
      const command: LmsCommand = ["status", 0, 999, "tags:a,l,d,b,r,o,s,u"];
      const result = await executeCommand(command, queuePayloadParser);

      if (!result.ok) {
        return result;
      }

      // Parse current index: undefined means nothing is playing → no track marked isCurrent
      const rawCurIndex = result.value.playlist_cur_index;
      const curIndex =
        rawCurIndex !== undefined
          ? parseInt(String(rawCurIndex), 10)
          : undefined;
      const tracks: readonly QueueTrack[] = (
        result.value.playlist_loop ?? []
      ).map((item, index) => ({
        id: String(item.id),
        position: index + 1, // 1-based position
        title: item.title,
        artist: item.artist ?? "",
        album: item.album ?? "",
        duration: Number(item.duration) || 0, // LMS returns string for Tidal tracks (e.g. "186")
        isCurrent:
          curIndex !== undefined && !isNaN(curIndex) && index === curIndex,
        source:
          item.url !== undefined ? detectQueueSource(item.url) : undefined,
        audioQuality: parseAudioQuality(item),
      }));

      return ok(tracks);
    },

    jumpToTrack: async (
      trackIndex: number,
    ): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["playlist", "index", trackIndex];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    removeFromQueue: async (
      trackIndex: number,
    ): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["playlist", "delete", trackIndex];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    moveQueueTrack: async (
      fromIndex: number,
      toIndex: number,
    ): Promise<Result<void, LmsError>> => {
      const command: LmsCommand = ["playlist", "move", fromIndex, toIndex];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    addToQueue: async (trackUrl: string): Promise<Result<void, LmsError>> => {
      const trimmedUrl = trackUrl.trim();
      if (trimmedUrl === "") {
        return err({
          type: "EmptyQueryError",
          message: "Track URL cannot be empty",
        });
      }

      if (trimmedUrl.length > MAX_TRACK_URL_LENGTH) {
        return err({
          type: "ValidationError",
          message: `Track URL exceeds maximum length of ${MAX_TRACK_URL_LENGTH} characters`,
        });
      }

      const hasValidProtocol = VALID_TRACK_PROTOCOLS.some((protocol) =>
        trimmedUrl.startsWith(protocol),
      );
      if (!hasValidProtocol) {
        return err({
          type: "ValidationError",
          message: `Invalid track URL protocol. Must start with: ${VALID_TRACK_PROTOCOLS.join(", ")}`,
        });
      }

      const command: LmsCommand = ["playlist", "add", trimmedUrl];
      const result = await executeCommand(command);

      if (!result.ok) {
        return result;
      }

      return ok(undefined);
    },

    /**
     * Add a local library album to the queue without interrupting playback.
     *
     * Live probe 2026-03-17 (Story 9.4):
     * - Command: ["playlistcontrol", "cmd:add", "album_id:{albumId}"]
     * - Response: {"result":{"count":N}} where N = tracks added
     * - Does NOT clear queue or change current track (cmd:add vs cmd:load)
     *
     * @param albumId - Local LMS album ID (e.g. "92")
     * @returns Result with void or error
     */
    addAlbumToQueue: async (
      albumId: string,
    ): Promise<Result<void, LmsError>> => {
      const trimmedId = albumId.trim();
      if (trimmedId === "") {
        return err({
          type: "EmptyQueryError",
          message: "Album ID cannot be empty",
        });
      }

      const result = await executeCommand([
        "playlistcontrol",
        "cmd:add",
        `album_id:${trimmedId}`,
      ]);
      if (!result.ok) {
        return result;
      }
      return ok(undefined);
    },

    /**
     * Add a Tidal album to the queue without clearing or interrupting playback.
     *
     * Pattern adapted from playTidalAlbum (Story 8.7) — key differences:
     * - NO clearQueue() call
     * - NO playlist "play" call for first track
     * - Only sequential playlist "add" calls for all tracks
     *
     * @param albumId - Tidal browse album ID (e.g. "4.0", "6.0.1.0")
     * @returns Result with void or error
     */
    addTidalAlbumToQueue: async (
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

      // Step 2: Add all tracks sequentially (no-loop reduce — functional/no-loop-statements)
      return tracks.reduce<Promise<Result<void, LmsError>>>(
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
    },
  };
};
