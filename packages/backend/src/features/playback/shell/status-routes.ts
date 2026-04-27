/**
 * Playback Status & Control Routes
 *
 * Volume, seek, time, cover-art proxy, and status polling.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import {
  getUserFriendlyErrorMessage,
  getUserFriendlyVolumeErrorMessage,
  getUserFriendlySeekErrorMessage,
  getUserFriendlyTimeErrorMessage,
} from "../core/error-mappers.js";
import { fromThrowable } from "@signalform/shared";
import { sendLmsError } from "../../../infrastructure/http-errors.js";

const VolumeRequestSchema = z.object({
  level: z.number().int().min(0).max(100),
});

const SeekRequestSchema = z.object({
  seconds: z.number().int().min(0),
});

const buildPlaybackCoverProxyUrl = (coverArtUrl: string): string => {
  const encoded = encodeURIComponent(coverArtUrl);
  return `/api/playback/cover?src=${encoded}`;
};

export const registerStatusRoutes = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  lmsConfig: LmsConfig,
): void => {
  /**
   * POST /api/playback/volume
   * Set volume (0–100).  Body: { level: number }
   * 200 | 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/volume",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/volume", method: "POST" },
        "Set volume request received",
      );

      const validation = VolumeRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid volume request",
        );
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          message: "Volume must be between 0 and 100",
          details: validation.error.issues,
        });
      }

      const { level } = validation.data;
      const result = await lmsClient.setVolume(level);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyVolumeErrorMessage,
          "LMS set volume failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ level, duration }, "Volume set successfully");
      return reply.code(200).send({});
    },
  );

  /**
   * GET /api/playback/volume
   * Get current volume.  200: { level: number } | 503
   */
  fastify.get(
    "/api/playback/volume",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/volume", method: "GET" },
        "Get volume request received",
      );

      const result = await lmsClient.getVolume();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyVolumeErrorMessage,
          "LMS get volume failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info(
        { volume: result.value, duration },
        "Volume retrieved successfully",
      );
      return reply.code(200).send({ level: result.value });
    },
  );

  /**
   * POST /api/playback/seek
   * Seek to position in seconds.  Body: { seconds: number }
   * 200 | 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/seek",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/seek", method: "POST" },
        "Seek request received",
      );

      const validation = SeekRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid seek request",
        );
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          message: "Seek position must be >= 0",
          details: validation.error.issues,
        });
      }

      const { seconds } = validation.data;
      const result = await lmsClient.seek(seconds);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlySeekErrorMessage,
          "LMS seek failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ seconds, duration }, "Seek successful");
      return reply.code(200).send({});
    },
  );

  /**
   * GET /api/playback/time
   * Current playback position.  200: { seconds: number } | 503
   */
  fastify.get(
    "/api/playback/time",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/time", method: "GET" },
        "Get current time request received",
      );

      const result = await lmsClient.getCurrentTime();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyTimeErrorMessage,
          "LMS get current time failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info(
        { seconds: result.value, duration },
        "Current time retrieved successfully",
      );
      return reply.code(200).send({ seconds: result.value });
    },
  );

  /**
   * GET /api/playback/cover
   *
   * Cover-art proxy: fetches an image from LMS and re-serves it so the
   * browser doesn't need a direct route to LMS.
   * Querystring: { src: string } (absolute LMS image URL)
   * 200 (image bytes) | 400 | upstream status
   */
  fastify.get(
    "/api/playback/cover",
    async (
      request: FastifyRequest<{
        readonly Querystring: { readonly src?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const src = request.query.src;

      if (typeof src !== "string" || src.trim() === "") {
        return reply.code(400).send({
          error: "INVALID_COVER_URL",
          message: "src query parameter is required",
        });
      }

      const parsedUrlResult = fromThrowable(
        () => new URL(src),
        () => null,
      );
      if (!parsedUrlResult.ok) {
        return reply.code(400).send({
          error: "INVALID_COVER_URL",
          message: "src must be an absolute URL",
        });
      }
      const parsedUrl = parsedUrlResult.value;

      const allowedOrigin = `http://${lmsConfig.host}:${lmsConfig.port}`;
      if (parsedUrl.origin !== allowedOrigin) {
        return reply.code(400).send({
          error: "INVALID_COVER_URL",
          message: "src must target the configured LMS host",
        });
      }

      const upstreamResponse = await fetch(parsedUrl.toString());
      if (!upstreamResponse.ok) {
        return reply.code(upstreamResponse.status).send({
          error: "COVER_FETCH_FAILED",
          message: `Failed to fetch cover art: HTTP ${upstreamResponse.status}`,
        });
      }

      const contentType = upstreamResponse.headers.get("content-type");
      const cacheControl = upstreamResponse.headers.get("cache-control");
      if (contentType !== null) {
        reply.header("content-type", contentType);
      }
      if (cacheControl !== null) {
        reply.header("cache-control", cacheControl);
      }

      const arrayBuffer = await upstreamResponse.arrayBuffer();
      return reply.code(200).send(Buffer.from(arrayBuffer));
    },
  );

  /**
   * GET /api/playback/status
   *
   * Full player state snapshot (mode, position, current track, up-next preview).
   * Called once on frontend init before the first WebSocket event arrives.
   * 200: { status, currentTime, currentTrack?, queuePreview } | 503
   */
  fastify.get(
    "/api/playback/status",
    async (request: FastifyRequest, reply: FastifyReply) => {
      request.log.debug(
        { endpoint: "/api/playback/status", method: "GET" },
        "Get playback status request received",
      );

      const result = await lmsClient.getStatus();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS get status failed",
        );
      }

      const { mode, time, duration, currentTrack, queuePreview } = result.value;
      const statusMap = {
        play: "playing",
        pause: "paused",
        stop: "stopped",
      } as const;

      return reply.code(200).send({
        status: statusMap[mode],
        currentTime: time,
        currentTrack: currentTrack
          ? {
              id: currentTrack.id,
              title: currentTrack.title,
              artist: currentTrack.artist,
              album: currentTrack.album,
              url: currentTrack.url,
              duration,
              source: currentTrack.source,
              coverArtUrl: currentTrack.coverArtUrl
                ? buildPlaybackCoverProxyUrl(currentTrack.coverArtUrl)
                : undefined,
              artistId: currentTrack.artistId,
              albumId: currentTrack.albumId,
              audioQuality: currentTrack.audioQuality,
            }
          : undefined,
        queuePreview,
      });
    },
  );
};
