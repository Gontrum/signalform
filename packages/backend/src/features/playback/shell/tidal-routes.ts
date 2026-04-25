/**
 * Playback Tidal / Multi-Track Routes
 *
 * Handles album and track-list playback: local albums, Tidal albums
 * (both browse-based and search-result fallback), and ordered track lists.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LmsError } from "../../../adapters/lms-client/index.js";
import { initiateAlbumPlayback } from "../core/service.js";
import {
  getUserFriendlyErrorMessage,
  getUserFriendlyAlbumErrorMessage,
} from "../core/error-mappers.js";
import { ok, isTidalAlbumId, type Result } from "@signalform/shared";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import {
  PLAYER_QUEUE_UPDATED,
  PLAYER_UPDATES_ROOM,
} from "../../../infrastructure/websocket/index.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";

const PlayAlbumRequestSchema = z.object({
  albumId: z.string().min(1, "Album ID is required"),
});

const isBodyRecord = (body: unknown): body is Record<string, unknown> => {
  return typeof body === "object" && body !== null;
};

export const registerTidalRoutes = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  io: TypedSocketIOServer,
  playerId: string,
): void => {
  /**
   * POST /api/playback/play-tidal-search-album
   *
   * Play a Tidal album from search results by browsing the FULL album via the
   * LMS Tidal plugin.  Prefers a full browse (all tracks); falls back to the
   * provided trackUrls when the browse ID cannot be resolved.
   *
   * Body: { albumTitle, artist, trackUrls }
   * 204 | 400 | 503
   */
  fastify.post(
    "/api/playback/play-tidal-search-album",
    async (request, reply) => {
      const body = isBodyRecord(request.body) ? request.body : null;

      if (
        typeof body?.["albumTitle"] !== "string" ||
        body["albumTitle"].trim() === ""
      ) {
        return reply.code(400).send({
          message: "albumTitle is required",
          code: "INVALID_INPUT",
        });
      }

      const albumTitle = body["albumTitle"].trim();
      const artist =
        typeof body["artist"] === "string" ? body["artist"].trim() : "";
      const trackUrls: readonly string[] = Array.isArray(body["trackUrls"])
        ? body["trackUrls"].filter((u): u is string => typeof u === "string")
        : [];

      // Step 1: Try to find the browse album ID
      const browseResult = await lmsClient.findTidalSearchAlbumId(
        albumTitle,
        artist,
      );

      if (!browseResult.ok) {
        fastify.log.warn(
          { event: "tidal_album_browse_failed", error: browseResult.error },
          "Tidal album search failed — falling back to trackUrls",
        );
      }

      // Step 2a: Browse ID found → play full album
      if (browseResult.ok && browseResult.value !== null) {
        const playResult = await lmsClient.playTidalAlbum(browseResult.value);
        if (!playResult.ok) {
          return sendLmsError(
            reply,
            request,
            playResult.error,
            getUserFriendlyErrorMessage,
            "LMS play Tidal album failed",
          );
        }

        const queueResult = await lmsClient.getQueue();
        if (queueResult.ok) {
          io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
            playerId,
            tracks: queueResult.value,
            timestamp: Date.now(),
          });
        }

        return reply.code(204).send();
      }

      // Step 2b: No browse ID → fall back to trackUrls
      if (trackUrls.length === 0) {
        return reply.code(503).send({
          message: "No playable content found for Tidal album",
          code: "NO_PLAYABLE_CONTENT",
        });
      }

      const [firstUrl, ...restUrls] = trackUrls;

      const playResult = await lmsClient.play(firstUrl ?? "");
      if (!playResult.ok) {
        return sendLmsError(
          reply,
          request,
          playResult.error,
          getUserFriendlyErrorMessage,
          "LMS play Tidal search album (fallback) failed",
        );
      }

      const addResult = await restUrls.reduce<Promise<Result<void, LmsError>>>(
        async (prevPromise, url) => {
          const prev = await prevPromise;
          if (!prev.ok) {
            return prev;
          }
          return lmsClient.addToQueue(url);
        },
        Promise.resolve(ok(undefined)),
      );

      if (!addResult.ok) {
        return sendLmsError(
          reply,
          request,
          addResult.error,
          getUserFriendlyErrorMessage,
          "LMS add Tidal search album track failed",
        );
      }

      const queueResult = await lmsClient.getQueue();
      if (queueResult.ok) {
        io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
          playerId,
          tracks: queueResult.value,
          timestamp: Date.now(),
        });
      }

      return reply.code(204).send();
    },
  );

  /**
   * POST /api/playback/play-track-list
   *
   * Play an ordered list of track URLs.  Clears the queue by playing the first
   * URL, then adds the rest sequentially.
   *
   * Body: { urls: string[] }
   * 204 | 400 | 503
   */
  fastify.post("/api/playback/play-track-list", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const urls = body?.["urls"];

    if (
      !Array.isArray(urls) ||
      urls.length === 0 ||
      !urls.every((u): u is string => typeof u === "string")
    ) {
      return reply.code(400).send({
        message: "urls must be a non-empty string array",
        code: "INVALID_INPUT",
      });
    }

    const [firstUrl, ...restUrls] = urls;

    const playResult = await lmsClient.play(firstUrl ?? "");
    if (!playResult.ok) {
      return sendLmsError(
        reply,
        request,
        playResult.error,
        getUserFriendlyErrorMessage,
        "LMS play track-list (first track) failed",
      );
    }

    const addResult = await restUrls.reduce<Promise<Result<void, LmsError>>>(
      async (prevPromise, url) => {
        const prev = await prevPromise;
        if (!prev.ok) {
          return prev;
        }
        return lmsClient.addToQueue(url);
      },
      Promise.resolve(ok(undefined)),
    );

    if (!addResult.ok) {
      return sendLmsError(
        reply,
        request,
        addResult.error,
        getUserFriendlyErrorMessage,
        "LMS add track-list track failed",
      );
    }

    const queueResult = await lmsClient.getQueue();
    if (queueResult.ok) {
      io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
        playerId,
        tracks: queueResult.value,
        timestamp: Date.now(),
      });
    } else {
      fastify.log.warn(
        { event: "queue_update_emit_failed", error: queueResult.error },
        "Could not fetch queue after play-track-list — status poller will sync within 1s",
      );
    }

    return reply.code(204).send();
  });

  /**
   * POST /api/playback/play-album
   *
   * Play an entire album with gapless mode.  Supports both local (numeric ID)
   * and Tidal (dotted ID like "4.0") albums.
   *
   * Body: { albumId: string }
   * 200 | 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/play-album",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/play-album", method: "POST" },
        "Play album request received",
      );

      const validation = PlayAlbumRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid play album request",
        );
        return reply.code(400).send({
          error: "INVALID_ALBUM_ID",
          message: "Album ID is required",
          details: validation.error.issues,
        });
      }

      const { albumId } = validation.data;

      const validationResult = initiateAlbumPlayback(albumId);
      if (!validationResult.ok) {
        request.log.warn(
          {
            error: validationResult.error.type,
            message: validationResult.error.message,
          },
          "Album ID validation failed",
        );
        return reply.code(400).send({
          error: validationResult.error.type,
          message: validationResult.error.message,
        });
      }

      const albumResult = isTidalAlbumId(validationResult.value.albumId)
        ? await lmsClient.playTidalAlbum(validationResult.value.albumId)
        : await lmsClient.playAlbum(validationResult.value.albumId);

      if (!albumResult.ok) {
        return sendLmsError(
          reply,
          request,
          albumResult.error,
          getUserFriendlyAlbumErrorMessage,
          "LMS play album failed",
          { albumId },
        );
      }

      // Disable repeat so album plays through once
      const repeatResult = await lmsClient.disableRepeat();
      if (!repeatResult.ok) {
        request.log.warn(
          {
            albumId,
            lmsErrorType: repeatResult.error.type,
            lmsErrorMessage: repeatResult.error.message,
          },
          "Failed to disable repeat mode — album may loop",
        );
        // Non-fatal: album is already playing
      }

      const duration = Date.now() - startTime;
      request.log.info({ albumId, duration }, "Album playback started");
      return reply.code(200).send({});
    },
  );
};
